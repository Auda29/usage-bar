const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { THEMES, FEATURES, DEFAULT_SETTINGS } = require('./catalog.cjs');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const inspect = (popup) => popup.webContents.executeJavaScript(`({
  theme: document.documentElement.dataset.theme,
  panelWidth: document.querySelector('.usage-panel').scrollWidth,
  panelHeight: document.querySelector('.usage-panel').getBoundingClientRect().height,
  // A visible scrollbar takes width; scrollHeight/clientHeight are rounded and misreport sub-pixel fits.
  scrolls: document.querySelector('.usage-panel').offsetWidth > document.querySelector('.usage-panel').clientWidth,
  headline: document.getElementById('headline').offsetParent ? document.getElementById('headline').textContent : '',
  overflowing: [...document.querySelectorAll('.usage-row, .reset-relative, .provider-heading, .timeline-head, .hero')].filter(el => el.offsetParent && getComputedStyle(el).textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 1).map(el => el.className),
  ranked: document.getElementById('providers').classList.contains('ranked'),
  timelineChips: document.getElementById('timeline').hidden ? 0 : document.querySelectorAll('.tl-chip').length,
  paceTicks: [...document.querySelectorAll('.pace-tick')].filter(el => el.offsetParent).length,
  logos: [...document.images].every(img => img.complete && img.naturalWidth > 0),
})`);

function menuItem(getTrayMenu, group, label) {
  return getTrayMenu().items.find((item) => item.label === group).submenu.items.find((item) => item.label === label);
}

function setFeatures(getTrayMenu, enabled) {
  for (const { name } of FEATURES) {
    const item = menuItem(getTrayMenu, 'Funktionen', name);
    if (item.checked === enabled) continue;
    item.click();
  }
}

// The collapsed popup must still show the header status in every design.
async function checkCollapsed(popup, id) {
  await popup.webContents.executeJavaScript(`document.getElementById('toggle').click()`);
  await wait(150);
  const collapsed = await inspect(popup);
  assert.match(collapsed.headline, /[0-9]+%/, `${id} collapsed: header status visible (${JSON.stringify(collapsed)})`);
  assert(popup.getContentBounds().height < 60, `${id} collapsed: window shrinks`);
  await popup.webContents.executeJavaScript(`document.getElementById('toggle').click()`);
  await wait(150);
}

// Switch every design through the real tray menu, with all optional features off and on.
async function checkThemes({ popup, getTrayMenu, app, artifacts }) {
  const settingsFile = path.join(app.getPath('userData'), 'settings.json');
  for (const theme of THEMES) {
    menuItem(getTrayMenu, 'Design', theme.name).click();
    for (const enabled of [false, true]) {
      setFeatures(getTrayMenu, enabled);
      await wait(200);
      const view = await inspect(popup);
      const label = `${theme.id}${enabled ? ' with features' : ''}`;
      assert.equal(view.theme, theme.id, `${label}: theme attribute`);
      assert.equal(popup.getBackgroundColor().toLowerCase(), theme.background, `${label}: window background`);
      assert(view.panelWidth <= 310, `${label}: panel must not scroll sideways (${view.panelWidth}px)`);
      assert.deepEqual(view.overflowing, [], `${label}: content must fit`);
      const height = popup.getContentBounds().height;
      assert(height >= view.panelHeight - 0.01 && height - view.panelHeight < 1, `${label}: window height ${height} follows content ${view.panelHeight}`);
      assert(!view.scrolls || height >= 720, `${label}: panel shows a scrollbar although the window can still grow`);
      assert(view.logos, `${label}: logos load`);
      assert.equal(view.ranked, enabled, `${label}: ranking`);
      assert.equal(view.timelineChips > 0, enabled, `${label}: timeline`);
      assert.equal(view.paceTicks > 0, enabled, `${label}: pace markers`);
      const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      assert.equal(saved.theme, theme.id);
      assert(FEATURES.every(({ key }) => saved[key] === enabled), `${label}: features persisted`);
      fs.writeFileSync(path.join(artifacts, `usage-bar-theme-${theme.id}${enabled ? '-features' : ''}.png`), (await popup.webContents.capturePage()).toPNG());
    }
    await checkCollapsed(popup, theme.id);
  }
  setFeatures(getTrayMenu, false);
  menuItem(getTrayMenu, 'Design', THEMES.find(({ id }) => id === DEFAULT_SETTINGS.theme).name).click();
  await wait(150);
}

module.exports = { checkThemes };
