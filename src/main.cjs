const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, nativeTheme, screen, shell, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ProviderService } = require('./providers.cjs');
const { positionPopup } = require('./model.cjs');
const { demoProviders } = require('./demo.cjs');
const { PROVIDERS, PROVIDER_IDS, DEFAULT_SETTINGS, normalizeSettings } = require('./catalog.cjs');
const { loadCredential, readCursorCredential } = require('./credentials.cjs');
const { CredentialVault } = require('./vault.cjs');
const { listGitHubAccounts, githubAccountLogin } = require('./github-accounts.cjs');
const { signInClaude, ClaudeSignInError, CLAUDE_SIGN_IN_REQUIRED } = require('./claude-session.cjs');
const loginItemOptions = { path: process.execPath, args: ['--hidden'] };

const smoke = process.env.USAGE_BAR_SMOKE === '1';
const demo = smoke || process.argv.includes('--demo');
app.setName('Usage Bar');
app.setAppUserModelId('dev.usagebar.desktop');
app.setPath('userData', smoke ? fs.mkdtempSync(path.join(os.tmpdir(), 'usage-bar-smoke-')) : path.join(app.getPath('appData'), demo ? 'usage-bar-demo' : 'usage-bar'));

const settingsFile = path.join(app.getPath('userData'), 'settings.json');
let settings = normalizeSettings(DEFAULT_SETTINGS);
try {
  const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  settings = normalizeSettings(saved);
} catch { /* A first run or damaged settings uses the defaults. */ }

let popup;
let setupWindow;
let tray;
let trayMenu;
let quitting = false;
let refreshPromise = null;
let refreshSelectionQueued = false;
let desiredHeight = 220;
let lastHiddenAt = 0;
let lastRefreshStarted = 0;
let timer;
const vault = new CredentialVault(path.join(app.getPath('userData'), 'credentials'), safeStorage);
const credentialLoader = async (id) => loadCredential(id, { managedCredential: await vault.read(id) });
const service = new ProviderService({ credentialLoader });
let state = { providers: [], catalog: PROVIDERS, loading: true, demo, settings };

function saveSettings() {
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  const temporary = `${settingsFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(settings, null, 2), 'utf8');
  fs.renameSync(temporary, settingsFile);
}

function emitState() {
  state = { ...state, settings: { ...settings } };
  if (popup && !popup.isDestroyed()) popup.webContents.send('usage:state', state);
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.webContents.send('usage:state', state);
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
      await Promise.all(settings.providers.map(async (id) => {
        const result = await service.read(id);
        const byId = new Map(state.providers.map((provider) => [provider.id, provider]));
        byId.set(id, result);
        state.providers = PROVIDER_IDS.map((key) => byId.get(key)).filter(Boolean);
        emitState();
      }));
    }
  })().finally(() => {
    refreshPromise = null;
    state.loading = false;
    emitState();
    if (refreshSelectionQueued) { refreshSelectionQueued = false; void refresh(); }
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
  const selectionChanged = patch.providers && JSON.stringify(normalizeSettings({ ...settings, ...patch }).providers) !== JSON.stringify(settings.providers);
  settings = normalizeSettings({ ...settings, ...patch });
  try { saveSettings(); } catch { /* Keep this session usable if the settings directory is read-only. */ }
  emitState();
  buildMenu();
  if (selectionChanged) {
    if (refreshPromise) refreshSelectionQueued = true;
    else void refresh();
  }
}

const externalLinks = Object.fromEntries(PROVIDERS.map(({ id, url }) => [id, url]));

async function getSetupState() {
  const credentials = {};
  let selectedCopilotAccount = 'automatic';
  const copilotAccounts = demo ? [
    { login: 'usagebar-personal', active: true, available: true },
    { login: 'usagebar-work', active: false, available: true },
  ] : await listGitHubAccounts();
  for (const { id } of PROVIDERS) {
    if (demo) { credentials[id] = { available: true, source: 'Beispieldaten', stored: false }; continue; }
    const managedCredential = await vault.read(id);
    if (id === 'copilot') selectedCopilotAccount = managedCredential?.mode === 'github-cli' ? `github-cli:${managedCredential.login}` : managedCredential?.token ? 'saved-token' : 'automatic';
    try {
      const credential = await loadCredential(id, { managedCredential });
      credentials[id] = { available: Boolean(credential), source: credential?.source || null, stored: Boolean(managedCredential) };
      if (id === 'copilot') credentials[id].login = await githubAccountLogin(credential);
    } catch {
      credentials[id] = { available: false, source: null, stored: Boolean(managedCredential), login: id === 'copilot' ? managedCredential?.login : null, error: id === 'claude' ? CLAUDE_SIGN_IN_REQUIRED : 'Anmeldung nicht verfügbar. Erneut anmelden oder anderes Konto auswählen.' };
    }
  }
  return { catalog: PROVIDERS, settings, credentials, copilotAccounts, selectedCopilotAccount, demo };
}

function credentialChanged(id) {
  service.forget(id);
  state.providers = state.providers.filter((provider) => provider.id !== id);
  emitState();
  if (settings.providers.includes(id)) {
    if (refreshPromise) refreshSelectionQueued = true;
    else void refresh();
  }
}

async function showSetup() {
  if (setupWindow && !setupWindow.isDestroyed()) { setupWindow.show(); setupWindow.focus(); return; }
  setupWindow = new BrowserWindow({
    width: 520, height: 720, minWidth: 440, minHeight: 440, show: false,
    title: 'Usage Bar · Provider', backgroundColor: '#181b22', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  setupWindow.setMenu(null);
  setupWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  setupWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  setupWindow.on('closed', () => { setupWindow = null; });
  await setupWindow.loadFile(path.join(__dirname, 'renderer', 'setup.html'));
  setupWindow.show();
  return setupWindow;
}

function buildMenu() {
  trayMenu = Menu.buildFromTemplate([
    { label: 'Usage Bar öffnen', click: showPopup },
    { label: 'Aktualisieren', click: () => void refresh() },
    { type: 'separator' },
    { label: 'Anzeige', submenu: [
      { label: 'Verbraucht', type: 'radio', checked: settings.displayMode === 'usage', click: () => updateSettings({ displayMode: 'usage' }) },
      { label: 'Verbleibend', type: 'radio', checked: settings.displayMode === 'remaining', click: () => updateSettings({ displayMode: 'remaining' }) },
    ] },
    { label: 'Provider anzeigen', submenu: PROVIDERS.map(({ id, name }) => ({
      label: name, type: 'checkbox', checked: settings.providers.includes(id),
      click: (item) => updateSettings({ providers: item.checked ? [...settings.providers, id] : settings.providers.filter((key) => key !== id) }),
    })) },
    { label: 'Provider einrichten…', click: () => void showSetup() },
    { label: 'Kurzstatus in der Kopfzeile', submenu: PROVIDERS.map(({ id, name }) => ({
      label: name, type: 'radio', checked: settings.headlineProvider === id,
      click: () => updateSettings({ headlineProvider: id }),
    })) },
    { label: 'Mit Windows starten', type: 'checkbox', enabled: app.isPackaged,
      checked: app.isPackaged && app.getLoginItemSettings(loginItemOptions).openAtLogin,
      click: (item) => app.setLoginItemSettings({ ...loginItemOptions, openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: 'Usage im Browser', submenu: PROVIDERS.map(({ id, name }) => ({ label: name, click: () => void shell.openExternal(externalLinks[id]) })) },
    { label: 'Hilfe und Anmeldewege', click: () => void shell.openPath(path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'README.md')) },
    { type: 'separator' },
    { label: 'Beenden', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(trayMenu);
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
  const window = [popup, setupWindow].find((item) => item && !item.isDestroyed() && event.sender === item.webContents);
  if (!window || event.senderFrame !== window.webContents.mainFrame) throw new Error('Invalid sender');
}

function registerIpc() {
  ipcMain.handle('usage:get', (event) => { trusted(event); return state; });
  ipcMain.handle('usage:setup-state', (event) => { trusted(event); return getSetupState(); });
  ipcMain.handle('usage:setup-open', (event) => { trusted(event); void showSetup(); });
  ipcMain.handle('usage:claude-sign-in', async (event) => {
    trusted(event);
    if (demo) return { ok: false, error: 'In der Demo wird keine Claude-Anmeldung gestartet.' };
    try {
      await signInClaude();
      credentialChanged('claude');
      return { ok: true };
    } catch (error) { return { ok: false, error: error instanceof ClaudeSignInError ? error.message : 'Claude-Anmeldung konnte nicht abgeschlossen werden. Bitte erneut versuchen.' }; }
  });
  ipcMain.handle('usage:providers', (event, ids) => {
    trusted(event);
    if (!Array.isArray(ids) || ids.some((id) => !PROVIDER_IDS.includes(id))) throw new Error('Ungültige Provider-Auswahl.');
    updateSettings({ providers: ids });
    return settings;
  });
  ipcMain.handle('usage:credential-save', async (event, id, token) => {
    trusted(event);
    if (demo) return { ok: false, error: 'In der Demo werden keine Zugangsdaten gespeichert.' };
    try {
      await vault.save(id, { token }); credentialChanged(id);
      return { ok: true };
    } catch { return { ok: false, error: 'Token konnte nicht verschlüsselt gespeichert werden. Eingabe und Windows-Anmeldung prüfen.' }; }
  });
  ipcMain.handle('usage:credential-remove', async (event, id) => {
    trusted(event);
    if (demo) return { ok: false, error: 'In der Demo werden keine Zugangsdaten entfernt.' };
    try {
      await vault.remove(id); credentialChanged(id);
      return { ok: true };
    }
    catch { return { ok: false, error: 'Gespeicherte Anmeldung konnte nicht entfernt werden.' }; }
  });
  ipcMain.handle('usage:copilot-account', async (event, selection) => {
    trusted(event);
    if (demo) return { ok: false, error: 'In der Demo wird kein GitHub-Konto geändert.' };
    try {
      if (selection === 'automatic') {
        await vault.remove('copilot');
      } else {
        if (typeof selection !== 'string' || !selection.startsWith('github-cli:')) throw new Error('Invalid selection');
        const login = selection.slice('github-cli:'.length);
        const accounts = await listGitHubAccounts();
        if (!accounts.some((account) => account.login === login && account.available)) throw new Error('Account unavailable');
        const record = { mode: 'github-cli', login };
        await loadCredential('copilot', { managedCredential: record });
        await vault.save('copilot', record);
      }
      credentialChanged('copilot');
      return { ok: true };
    } catch { return { ok: false, error: 'Konto konnte nicht ausgewählt werden. GitHub-CLI-Anmeldung prüfen und Konten neu laden.' }; }
  });
  ipcMain.handle('usage:cursor-import', async (event) => {
    trusted(event);
    if (demo) return { ok: false, error: 'In der Demo wird keine Anmeldung importiert.' };
    const credential = await readCursorCredential();
    if (!credential) return { ok: false, error: 'Keine lesbare Cursor-Anmeldung gefunden. In Cursor anmelden oder einen Access-Token eingeben.' };
    try {
      await vault.save('cursor', { mode: 'local-cursor' }); credentialChanged('cursor');
      return { ok: true };
    } catch { return { ok: false, error: 'Cursor-Import konnte nicht gespeichert werden.' }; }
  });
  ipcMain.handle('usage:refresh', async (event) => { trusted(event); await refresh(); return state; });
  ipcMain.handle('usage:expanded', (event, expanded) => {
    trusted(event);
    if (typeof expanded === 'boolean') updateSettings({ expanded });
  });
  ipcMain.on('usage:height', (event, height) => {
    trusted(event);
    if (event.sender !== popup.webContents) return;
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
  tray = new Tray(trayImage(), demo ? 'c4068b4f-02c0-426b-aead-e56582e4cb0e' : '2334371a-b9ea-44c3-89cb-b2acfe63aa21');
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
      await require('./smoke-check.cjs').runSmoke({ popup, tray, app, showPopup, nativeTheme, trayImage, showSetup, getTrayMenu: () => trayMenu });
      quitting = true;
      app.quit();
    } catch (error) {
      console.error(error.stack || error.message);
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
