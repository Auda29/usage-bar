const { test } = require('node:test');
const assert = require('node:assert/strict');
const { THEMES, THEME_IDS, normalizeSettings } = require('../src/catalog.cjs');

test('the classic design stays the default and unknown designs fall back to it', () => {
  assert.equal(normalizeSettings({}).theme, 'classic');
  assert.equal(normalizeSettings({ theme: 'neon' }).theme, 'classic');
  assert.equal(normalizeSettings({ theme: 'terminal' }).theme, 'terminal');
});

test('every design has a name and an opaque window background', () => {
  assert.deepEqual(THEME_IDS, ['classic', 'fluent', 'tiles', 'terminal', 'focus', 'light', 'compact']);
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
