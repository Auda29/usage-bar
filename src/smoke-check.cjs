const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runSmoke({ popup, tray, app, showPopup, nativeTheme, trayImage, showSetup, getTrayMenu }) {
  showPopup();
  await wait(250);
  assert(!tray.isDestroyed(), 'Tray must exist');
  assert.equal(nativeTheme.themeSource, 'dark', 'App menus must use the dark theme');
  assert.equal(nativeTheme.shouldUseDarkColors, true);
  const darkTrayImage = trayImage(false);
  const lightTrayImage = trayImage(true);
  assert(!darkTrayImage.isEmpty() && !lightTrayImage.isEmpty(), 'Both taskbar theme icons must load');
  assert.notDeepEqual(darkTrayImage.toPNG(), lightTrayImage.toPNG(), 'Light and dark taskbars need distinct icons');
  assert(popup.isVisible(), 'Popup must be visible');
  const read = () => popup.webContents.executeJavaScript(`({
    rows: [...document.querySelectorAll('.usage-row')].map(el => ({text: el.textContent, height: el.getBoundingClientRect().height})),
    headings: [...document.querySelectorAll('.provider-heading')].map(el => el.textContent),
    expanded: document.getElementById('toggle').getAttribute('aria-expanded'),
    hidden: document.getElementById('providers').hidden,
    bodyHeight: document.querySelector('.usage-panel').getBoundingClientRect().height,
    headline: document.getElementById('headline').textContent,
    logos: [...document.images].every(img => img.complete && img.naturalWidth > 0),
    nodeAvailable: typeof require !== 'undefined',
    overflowing: [...document.querySelectorAll('.usage-row')].some(el => el.scrollWidth > el.clientWidth)
  })`);
  const full = await read();
  assert.deepEqual(full.headings, ['Claude', 'Codex']);
  assert.equal(full.rows.length, 4);
  assert(full.rows.every((row) => row.height === 28));
  assert(full.rows.some((row) => row.text.includes('109.0869435')));
  assert.equal(full.headline, '5-Hour20%');
  assert(full.logos, 'Logos must load');
  assert.equal(full.nodeAvailable, false, 'Renderer must not have Node access');
  assert.equal(full.overflowing, false, 'Rows must fit the popup');
  assert.equal(popup.getContentBounds().height, full.bodyHeight);
  const artifacts = process.env.USAGE_BAR_ARTIFACT_DIR || path.join(app.getAppPath(), 'artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  fs.writeFileSync(path.join(artifacts, 'usage-bar-demo.png'), (await popup.webContents.capturePage()).toPNG());
  await popup.webContents.executeJavaScript(`document.getElementById('toggle').click()`);
  await wait(150);
  const collapsed = await read();
  assert.equal(collapsed.expanded, 'false');
  assert.equal(collapsed.hidden, true);
  assert(popup.getContentBounds().height < 60);
  await popup.webContents.executeJavaScript(`document.getElementById('toggle').click()`);
  await wait(150);
  assert.equal((await read()).expanded, 'true');
  await popup.webContents.executeJavaScript(`document.getElementById('refresh').click()`);
  await wait(150);
  assert.equal(await popup.webContents.executeJavaScript(`document.getElementById('refresh').disabled`), false);
  const { PROVIDER_IDS, PROVIDERS } = require('./catalog.cjs');
  const choices = getTrayMenu().items.find((item) => item.label === 'Provider anzeigen').submenu.items;
  assert.equal(choices.length, 6);
  assert(choices.every((item) => item.type === 'checkbox'));
  const setup = await showSetup();
  await wait(150);
  assert.equal(await setup.webContents.executeJavaScript(`document.querySelectorAll('input[type="checkbox"]').length`), 6);
  assert.equal(await setup.webContents.executeJavaScript(`document.querySelectorAll('input[type="checkbox"]:checked').length`), 2);
  const accountOptions = await setup.webContents.executeJavaScript(`[...document.getElementById('copilot-account').options].map(option => option.value)`);
  assert.deepEqual(accountOptions, ['automatic', 'github-cli:usagebar-personal', 'github-cli:usagebar-work']);
  assert.equal(await setup.webContents.executeJavaScript(`document.getElementById('copilot-account').value`), 'automatic');
  assert.equal(await setup.webContents.executeJavaScript(`document.querySelector('label[for="copilot-account"]').textContent`), 'GitHub-Konto für Usage Bar');
  await setup.webContents.executeJavaScript(`document.getElementById('copilot-account').value = 'github-cli:usagebar-work'; document.getElementById('copilot-account').dispatchEvent(new Event('change'))`);
  await wait(150);
  assert.match(await setup.webContents.executeJavaScript(`document.getElementById('setup-message').textContent`), /Demo/);
  assert.equal(await setup.webContents.executeJavaScript(`document.getElementById('copilot-account').value`), 'automatic', 'Failed selection must restore the saved choice');
  assert.equal(await setup.webContents.executeJavaScript(`document.getElementById('copilot-account').disabled`), false);
  const copilotChoice = choices.find((item) => item.label === 'GitHub Copilot');
  copilotChoice.checked = false;
  copilotChoice.click(copilotChoice);
  await wait(100);
  assert.equal(await setup.webContents.executeJavaScript(`document.getElementById('enable-copilot').checked`), true);
  await setup.webContents.executeJavaScript(`window.usageBar.setProviders(${JSON.stringify(PROVIDER_IDS)})`);
  await wait(100);
  const allProviders = await read();
  assert.deepEqual(allProviders.headings, PROVIDERS.map(({ name }) => name));
  assert.equal(allProviders.overflowing, false);
  assert(allProviders.logos);
  assert.equal(popup.getContentBounds().height, allProviders.bodyHeight);
  fs.writeFileSync(path.join(artifacts, 'usage-bar-all-providers.png'), (await popup.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(artifacts, 'usage-bar-provider-settings.png'), (await setup.webContents.capturePage()).toPNG());
  await setup.webContents.executeJavaScript(`document.getElementById('copilot-account').scrollIntoView({block: 'center'})`);
  fs.writeFileSync(path.join(artifacts, 'usage-bar-copilot-accounts.png'), (await setup.webContents.capturePage()).toPNG());
  const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8'));
  assert.deepEqual(saved.providers, PROVIDER_IDS);
  assert.equal(await setup.webContents.executeJavaScript(`document.querySelectorAll('input[type="password"]').length`), 3);
  assert.equal(await setup.webContents.executeJavaScript(`[...document.querySelectorAll('input[type="password"]')].every(input => input.value === '')`), true);
  const { safeStorage } = require('electron');
  const encrypted = await safeStorage.encryptStringAsync('smoke-test-private-value');
  assert(!encrypted.includes('smoke-test-private-value'));
  assert.equal((await safeStorage.decryptStringAsync(encrypted)).result, 'smoke-test-private-value');
  assert.equal(typeof require('node:sqlite').DatabaseSync, 'function', 'Packaged Electron must support the Cursor login reader');
  await setup.webContents.executeJavaScript(`window.usageBar.setProviders(['claude', 'codex'])`);
  await wait(100);
  setup.close();
  await popup.webContents.executeJavaScript(`render({...state, settings: {...state.settings, displayMode: 'remaining'}})`);
  assert.equal((await read()).headline, '5-Hour80%');
  assert((await read()).rows.some(row => row.text.includes('109.0869435')), 'Credits must not flip in remaining mode');
  await popup.webContents.executeJavaScript(`render({...state, providers: state.providers.map(p => ({...p, status: 'stale', error: 'Verbindung unterbrochen.'}))})`);
  assert.equal(await popup.webContents.executeJavaScript(`document.querySelectorAll('.stale-indicator').length`), 2);
  assert.equal(await popup.webContents.executeJavaScript(`document.querySelectorAll('.provider-status').length`), 2);
  await popup.webContents.executeJavaScript(`render({...state, settings: {...state.settings, providers: []}})`);
  assert.match(await popup.webContents.executeJavaScript(`document.getElementById('providers').textContent`), /Provider/);
  await popup.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'}))`);
  await wait(100);
  assert.equal(popup.isVisible(), false);
  console.log(JSON.stringify({ passed: true, version: app.getVersion(), packaged: app.isPackaged, systemUsesDarkColors: nativeTheme.shouldUseDarkColorsForSystemIntegratedUI, checks: ['native tray', 'light/dark tray icons', 'dark native menu theme', 'sandboxed renderer', 'provider logos', 'row dimensions', 'credit precision', 'dynamic window height', 'collapse and expand', 'refresh IPC', 'six provider checkboxes', 'native menu selection', 'persisted provider selection', 'all-provider layout', 'setup window', 'Windows token encryption', 'remaining mode', 'stale indicators', 'empty provider selection', 'Escape hides popup'], screenshot: path.join(artifacts, 'usage-bar-all-providers.png') }, null, 2));
}
module.exports = { runSmoke };
