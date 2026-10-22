const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, nativeTheme, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ProviderService } = require('./providers.cjs');
const { positionPopup } = require('./model.cjs');
const { demoProviders } = require('./demo.cjs');

const smoke = process.env.USAGE_BAR_SMOKE === '1';
const demo = smoke || process.argv.includes('--demo');
app.setName('Usage Bar');
app.setAppUserModelId('dev.usagebar.desktop');
app.setPath('userData', smoke ? fs.mkdtempSync(path.join(os.tmpdir(), 'usage-bar-smoke-')) : path.join(app.getPath('appData'), 'usage-bar'));

const defaults = { displayMode: 'usage', expanded: true, providers: ['claude', 'codex'], headlineProvider: 'claude', hasLaunched: false };
const settingsFile = path.join(app.getPath('userData'), 'settings.json');
let settings = { ...defaults };
try {
  const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  settings = {
    displayMode: saved.displayMode === 'remaining' ? 'remaining' : 'usage',
    expanded: saved.expanded !== false,
    providers: Array.isArray(saved.providers) ? ['claude', 'codex'].filter((id) => saved.providers.includes(id)) : [...defaults.providers],
    headlineProvider: saved.headlineProvider === 'codex' ? 'codex' : 'claude',
    hasLaunched: saved.hasLaunched === true,
  };
} catch { /* A first run or damaged settings uses the defaults. */ }

let popup;
let tray;
let quitting = false;
let refreshPromise = null;
let desiredHeight = 220;
let lastHiddenAt = 0;
let lastRefreshStarted = 0;
let timer;
const service = new ProviderService();
let state = { providers: [], loading: true, demo, settings };

function saveSettings() {
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  const temporary = `${settingsFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(settings, null, 2), 'utf8');
  fs.renameSync(temporary, settingsFile);
}

function emitState() {
  state = { ...state, settings: { ...settings } };
  if (popup && !popup.isDestroyed()) popup.webContents.send('usage:state', state);
  const lines = ['Usage Bar'];
  for (const provider of state.providers.filter(({ id }) => settings.providers.includes(id))) {
    const window = provider.rows.find((row) => row.usedPercent !== null);
    lines.push(`${provider.name}: ${window ? `${Math.round(window.usedPercent)}% verbraucht` : provider.error || 'Keine Limits'}${provider.status === 'stale' ? ' (veraltet)' : ''}`);
  }
  if (tray && !tray.isDestroyed()) tray.setToolTip(lines.join('\n').slice(0, 127));
}

async function refresh() {
  if (refreshPromise) return refreshPromise;
  state.loading = true;
  lastRefreshStarted = Date.now();
  emitState();
  refreshPromise = (async () => {
    if (demo) {
      state.providers = demoProviders();
      emitState();
    } else {
      // Each provider updates as soon as it answers; one slow provider does not hide the other.
      await Promise.all(['claude', 'codex'].map(async (id) => {
        const result = await service.read(id);
        const byId = new Map(state.providers.map((provider) => [provider.id, provider]));
        byId.set(id, result);
        state.providers = ['claude', 'codex'].map((key) => byId.get(key)).filter(Boolean);
        emitState();
      }));
    }
  })().finally(() => {
    refreshPromise = null;
    state.loading = false;
    emitState();
  });
  return refreshPromise;
}

function position() {
  if (!popup || popup.isDestroyed()) return;
  const anchor = tray?.getBounds();
  const display = anchor?.width ? screen.getDisplayMatching(anchor) : screen.getPrimaryDisplay();
  popup.setBounds(positionPopup(display.workArea, anchor, 310, desiredHeight));
}

function showPopup() {
  if (!popup || popup.isDestroyed()) return;
  position();
  popup.show();
  popup.focus();
  if (Date.now() - lastRefreshStarted > 180000) void refresh();
}

function hidePopup() {
  if (popup?.isVisible()) {
    popup.hide();
    lastHiddenAt = Date.now();
  }
}

function updateSettings(patch) {
  settings = { ...settings, ...patch };
  try { saveSettings(); } catch { /* Keep this session usable if the settings directory is read-only. */ }
  emitState();
  buildMenu();
}

const externalLinks = {
  claude: 'https://claude.ai/settings/usage',
  codex: 'https://chatgpt.com/settings/usage',
};

function buildMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Usage Bar öffnen', click: showPopup },
    { label: 'Aktualisieren', click: () => void refresh() },
    { type: 'separator' },
    { label: 'Anzeige', submenu: [
      { label: 'Verbraucht', type: 'radio', checked: settings.displayMode === 'usage', click: () => updateSettings({ displayMode: 'usage' }) },
      { label: 'Verbleibend', type: 'radio', checked: settings.displayMode === 'remaining', click: () => updateSettings({ displayMode: 'remaining' }) },
    ] },
    { label: 'Provider anzeigen', submenu: ['claude', 'codex'].map((id) => ({
      label: id === 'claude' ? 'Claude' : 'Codex', type: 'checkbox', checked: settings.providers.includes(id),
      click: (item) => updateSettings({ providers: item.checked ? [...settings.providers, id] : settings.providers.filter((key) => key !== id) }),
    })) },
    { label: 'Kurzstatus in der Kopfzeile', submenu: ['claude', 'codex'].map((id) => ({
      label: id === 'claude' ? 'Claude' : 'Codex', type: 'radio', checked: settings.headlineProvider === id,
      click: () => updateSettings({ headlineProvider: id }),
    })) },
    { label: 'Mit Windows starten', type: 'checkbox', enabled: app.isPackaged,
      checked: app.isPackaged && app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath, args: ['--hidden'] }),
    },
    { type: 'separator' },
    { label: 'Claude-Usage im Browser', click: () => void shell.openExternal(externalLinks.claude) },
    { label: 'Codex-Usage im Browser', click: () => void shell.openExternal(externalLinks.codex) },
    { label: 'Hilfe und Anmeldewege', click: () => void shell.openPath(path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'README.md')) },
    { type: 'separator' },
    { label: 'Beenden', click: () => { quitting = true; app.quit(); } },
  ]));
}

function trayImage(systemUsesDarkColors = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI) {
  // The taskbar follows Windows' system theme, independently of this app's dark menu.
  const variant = systemUsesDarkColors ? 'light' : 'dark';
  return nativeImage.createFromPath(path.join(__dirname, '..', 'assets', `tray-${variant}.png`));
}

function updateTrayImage() {
  if (tray && !tray.isDestroyed()) tray.setImage(trayImage());
}

function trusted(event) {
  if (!popup || event.sender !== popup.webContents || event.senderFrame !== popup.webContents.mainFrame) throw new Error('Invalid sender');
}

function registerIpc() {
  ipcMain.handle('usage:get', (event) => { trusted(event); return state; });
  ipcMain.handle('usage:refresh', async (event) => { trusted(event); await refresh(); return state; });
  ipcMain.handle('usage:expanded', (event, expanded) => {
    trusted(event);
    if (typeof expanded === 'boolean') updateSettings({ expanded });
  });
  ipcMain.on('usage:height', (event, height) => {
    trusted(event);
    if (typeof height !== 'number' || !Number.isFinite(height)) return;
    const next = Math.max(42, Math.min(720, Math.ceil(height)));
    if (desiredHeight !== next) { desiredHeight = next; position(); }
  });
  ipcMain.on('usage:hide', (event) => { trusted(event); hidePopup(); });
  ipcMain.on('usage:menu', (event) => { trusted(event); tray.popUpContextMenu(); });
  ipcMain.handle('usage:open-provider', (event, id) => {
    trusted(event);
    if (Object.hasOwn(externalLinks, id)) return shell.openExternal(externalLinks[id]);
  });
}

async function createApp() {
  nativeTheme.themeSource = 'dark';
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(trayImage(), '2334371a-b9ea-44c3-89cb-b2acfe63aa21');
  nativeTheme.on('updated', updateTrayImage);
  popup = new BrowserWindow({
    width: 310, height: desiredHeight, show: false, frame: false, resizable: false,
    maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true,
    alwaysOnTop: true, backgroundColor: '#181b22', title: 'Usage Bar', icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, spellcheck: false,
    },
  });
  popup.setMenu(null);
  popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  popup.webContents.on('will-navigate', (event) => event.preventDefault());
  popup.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  popup.on('blur', () => { if (!smoke) hidePopup(); });
  popup.on('close', (event) => { if (!quitting) { event.preventDefault(); hidePopup(); } });
  tray.on('click', () => {
    if (popup.isVisible()) hidePopup();
    else if (Date.now() - lastHiddenAt > 180) showPopup();
  });
  tray.on('double-click', showPopup);
  screen.on('display-metrics-changed', position);
  screen.on('display-removed', position);
  registerIpc();
  buildMenu();
  await popup.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.argv.includes('--show') || (!settings.hasLaunched && !process.argv.includes('--hidden'))) showPopup();
  if (!smoke && !demo) updateSettings({ hasLaunched: true });
  await refresh();
  timer = setInterval(() => void refresh(), 180000);
  if (smoke) {
    try {
      await require('./smoke-check.cjs').runSmoke({ popup, tray, app, showPopup, nativeTheme, trayImage });
      quitting = true;
      app.quit();
    } catch (error) {
      console.error(error.message);
      app.exit(1);
    }
  }
}

if (!smoke && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showPopup);
  app.whenReady().then(createApp).catch((error) => { console.error(error.message); app.exit(1); });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; clearInterval(timer); });
  app.on('will-quit', () => {
    nativeTheme.removeListener('updated', updateTrayImage);
    if (tray && !tray.isDestroyed()) tray.destroy();
  });
}
