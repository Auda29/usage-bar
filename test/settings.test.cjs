const { test } = require('node:test');
const assert = require('node:assert/strict');
const { THEMES, THEME_IDS, normalizeSettings } = require('../src/catalog.cjs');

test('compact is the default and unknown designs fall back to it', () => {
  assert.equal(normalizeSettings({}).theme, 'compact');
  assert.equal(normalizeSettings({ theme: 'neon' }).theme, 'compact');
  assert.equal(normalizeSettings({ theme: 'terminal' }).theme, 'terminal');
});

test('the classic design stays selectable as the only legacy design, listed last', () => {
  assert.equal(normalizeSettings({ theme: 'classic' }).theme, 'classic');
  assert.deepEqual(THEMES.filter((theme) => theme.legacy).map(({ id }) => id), ['classic']);
  assert.equal(THEMES.at(-1).id, 'classic');
  assert.match(THEMES.at(-1).name, /Legacy/);
});

test('every design has a name and an opaque window background', () => {
  assert.deepEqual(THEME_IDS, ['compact', 'fluent', 'tiles', 'terminal', 'focus', 'light', 'classic']);
  for (const theme of THEMES) {
    assert.ok(theme.name);
    assert.match(theme.background, /^#[0-9a-f]{6}$/);
  }
});

test('optional features are off unless saved as true', () => {
  const defaults = normalizeSettings({});
  assert.deepEqual([defaults.showPace, defaults.showTimeline, defaults.sortByUsage], [false, false, false]);
  const enabled = normalizeSettings({ showPace: true, showTimeline: true, sortByUsage: true });
  assert.deepEqual([enabled.showPace, enabled.showTimeline, enabled.sortByUsage], [true, true, true]);
  assert.equal(normalizeSettings({ showPace: 'yes' }).showPace, false);
});
