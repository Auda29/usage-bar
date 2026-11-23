// Renders the README design gallery from labeled demo data: `npm run screenshots`.
// Runs as an Electron main process; it never reads credentials or calls a provider.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { demoProviders } = require('../src/demo.cjs');
const { PROVIDERS, PROVIDER_IDS, THEMES, DEFAULT_SETTINGS } = require('../src/catalog.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs', 'images', 'designs');
const GALLERY_PROVIDERS = ['claude', 'codex', 'gemini', 'cursor'];
const FEATURE_SHOTS = [
  { file: 'feature-pace', theme: 'focus', settings: { showPace: true } },
  { file: 'feature-timeline', theme: 'compact', settings: { showTimeline: true } },
  { file: 'feature-ranked', theme: 'light', settings: { sortByUsage: true, showPace: true } },
];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function capture(window, targetFile, settings) {
  const state = { providers: demoProviders(), catalog: PROVIDERS, loading: false, demo: true, settings: { ...DEFAULT_SETTINGS, providers: GALLERY_PROVIDERS, ...settings } };
  await window.webContents.executeJavaScript(`render(${JSON.stringify(state)})`);
  await wait(150);
  const height = await window.webContents.executeJavaScript(`(() => {
    const panel = document.querySelector('.usage-panel');
    const top = panel.getBoundingClientRect().top;
    const bottom = Math.max(...[...panel.children].map((child) => child.getBoundingClientRect().bottom - top));
    return Math.ceil(bottom + parseFloat(getComputedStyle(panel).paddingBottom));
  })()`);
  window.setContentSize(310, height);
  await wait(250);
  fs.writeFileSync(targetFile, (await window.webContents.capturePage()).toPNG());
  console.log(`${path.relative(root, targetFile)}  ${height}px`);
}

app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true });
  const window = new BrowserWindow({
    width: 310, height: 600, show: false, frame: false, resizable: false, paintWhenInitiallyHidden: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await window.loadFile(path.join(root, 'src', 'renderer', 'index.html'));
  const defaultTheme = THEMES[0];
  window.setBackgroundColor(defaultTheme.background);
  await capture(window, path.join(root, 'docs', 'images', 'usage-bar.png'), { theme: defaultTheme.id, providers: PROVIDER_IDS });
  for (const theme of THEMES) {
    window.setBackgroundColor(theme.background);
    await capture(window, path.join(output, `${theme.id}.png`), { theme: theme.id });
  }
  for (const shot of FEATURE_SHOTS) {
    window.setBackgroundColor(THEMES.find(({ id }) => id === shot.theme).background);
    await capture(window, path.join(output, `${shot.file}.png`), { theme: shot.theme, ...shot.settings });
  }
  app.quit();
}).catch((error) => { console.error(error.stack || error.message); app.exit(1); });
