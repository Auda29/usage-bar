const { test } = require('node:test');
const assert = require('node:assert/strict');
const { number, timestamp, parseClaude, parseCodex, positionPopup } = require('../src/model.cjs');

test('missing and non-finite readings never become zero', () => {
  for (const value of [null, undefined, '', 'invalid', Infinity, NaN, true]) assert.equal(number(value), null);
  assert.equal(number(0), 0);
  assert.equal(number('0'), 0);
});
test('reset timestamps support ISO, seconds and milliseconds', () => {
  assert.equal(timestamp('2026-10-24T12:00:00Z'), Date.parse('2026-10-24T12:00:00Z'));
  assert.equal(timestamp(1792843200), 1792843200000);
  assert.equal(timestamp(1792843200000), 1792843200000);
  assert.equal(timestamp('invalid'), null);
});
test('Claude legacy limits keep zero usage and omit missing windows', () => {
  const rows = parseClaude({ five_hour: { utilization: 0, resets_at: '2026-10-24T12:00:00Z' }, seven_day: null });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].usedPercent, 0);
  assert.equal(rows[0].windowSeconds, 18000);
});
test('Claude limits array supports overall and model windows', () => {
  const rows = parseClaude({ limits: [{ kind: 'session', percent: 39 }, { kind: 'weekly_all', percent: 30 }, { kind: 'weekly_scoped', percent: 50, scope: { model: { display_name: 'Sonnet' } } }] });
  assert.deepEqual(rows.map((row) => row.usedPercent), [39, 30, 50]);
  assert.equal(rows[2].label, 'Sonnet · 7-Day Limit');
});
test('malformed or empty provider payload is an error', () => {
  for (const payload of [null, {}, { five_hour: { utilization: null } }]) assert.throws(() => parseClaude(payload), /Keine Nutzungslimits/);
  assert.throws(() => parseCodex({ rate_limit: {} }), /Keine Nutzungslimits/);
});
test('Codex labels the actual duration even when primary is weekly', () => {
  const rows = parseCodex({ rate_limit: { primary_window: { used_percent: 44, limit_window_seconds: 604800, reset_at: 1793192285 } } });
  assert.equal(rows[0].label, 'Weekly');
  assert.equal(rows[0].resetAt, 1793192285000);
});
test('Codex credits preserve precision, zero, and unlimited', () => {
  assert.equal(parseCodex({ credits: { balance: '109.0869435' } })[0].valueLabel, '109.0869435');
  assert.equal(parseCodex({ credits: { balance: '0' } })[0].valueLabel, '0');
  assert.equal(parseCodex({ credits: { unlimited: true } })[0].valueLabel, 'Unlimited');
  assert.throws(() => parseCodex({ credits: { balance: null } }));
});
test('popup stays in the work area on bottom, top and secondary displays', () => {
  for (const [area, anchor] of [
    [{ x: 0, y: 0, width: 1920, height: 1032 }, { x: 1800, y: 1032, width: 24, height: 48 }],
    [{ x: 0, y: 48, width: 1920, height: 1032 }, { x: 1800, y: 0, width: 24, height: 48 }],
    [{ x: -1920, y: 0, width: 1920, height: 1032 }, { x: -120, y: 1032, width: 24, height: 48 }],
    [{ x: 0, y: 0, width: 240, height: 180 }, null],
  ]) {
    const popup = positionPopup(area, anchor, 310, 220);
    assert(popup.x >= area.x && popup.y >= area.y);
    assert(popup.x + popup.width <= area.x + area.width);
    assert(popup.y + popup.height <= area.y + area.height);
  }
});
