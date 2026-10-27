const { test } = require('node:test');
const assert = require('node:assert/strict');
const { windowElapsed, pace, rankRows, riskiest, timeline, relativeTime } = require('../src/renderer/insights.js');

const HOUR = 3600000;
const DAY = 24 * HOUR;
const now = Date.parse('2026-10-27T12:00:00Z');
const limit = (usedPercent, resetIn, windowSeconds, extra = {}) => ({ key: 'k', label: 'L', usedPercent, resetAt: now + resetIn, windowSeconds, ...extra });

test('window progress needs a window length and a future reset', () => {
  assert.equal(windowElapsed(limit(20, 2 * HOUR, 18000), now), 0.6);
  assert.equal(windowElapsed(limit(20, 2 * HOUR, null), now), null);
  assert.equal(windowElapsed(limit(20, -HOUR, 18000), now), null);
  assert.equal(windowElapsed({ usedPercent: 20, resetAt: null, windowSeconds: 18000 }, now), null);
  assert.equal(windowElapsed(limit(20, 10 * DAY, 604800), now), 0, 'a reset beyond the window clamps to the start');
});

test('pace flags a limit that runs out before its reset', () => {
  const result = pace(limit(41, 6 * DAY, 604800), now);
  assert.ok(Math.abs(result.elapsed - 1 / 7) < 1e-9);
  assert.equal(result.ahead, true);
  assert.ok(result.emptyAt > now && result.emptyAt < now + 2 * DAY);
});

test('pace stays calm when usage trails elapsed time', () => {
  const result = pace(limit(20, 2 * HOUR, 18000), now);
  assert.equal(result.ahead, false);
  assert.equal(result.emptyAt, null);
});

test('pace ignores the first minutes of a window, full limits and rows without a window', () => {
  assert.equal(pace(limit(10, 4.9 * HOUR, 18000), now).ahead, false);
  assert.equal(pace(limit(100, 2 * HOUR, 18000), now).ahead, false);
  assert.equal(pace(limit(35, 10 * DAY, null), now), null);
  assert.equal(pace({ key: 'credits', usedPercent: null, resetAt: null, windowSeconds: null, valueLabel: '109' }, now), null);
});

test('pace warns about heavy usage early in a long window', () => {
  // 60 % of a weekly limit after six hours runs out in about four more hours.
  const result = pace(limit(60, 7 * DAY - 6 * HOUR, 604800), now);
  assert.equal(result.ahead, true);
  assert.ok(result.emptyAt - now < 5 * HOUR);
});

test('ranked rows put limits whose reset already passed last', () => {
  const providers = [{ id: 'claude', name: 'Claude', status: 'stale', rows: [limit(92, -HOUR, 18000, { key: 'old' }), limit(28, DAY, 604800, { key: 'week' })] }];
  assert.deepEqual(rankRows(providers, now).limits.map(({ row }) => row.key), ['week', 'old']);
  assert.deepEqual(rankRows(providers).limits.map(({ row }) => row.key), ['old', 'week'], 'without a time the order is by usage only');
});

test('ranked rows sort limits by usage and keep plain values apart', () => {
  const providers = [
    { id: 'claude', name: 'Claude', rows: [limit(20, HOUR, 18000, { key: '5h' }), limit(28, DAY, 604800, { key: '7d' })] },
    { id: 'codex', name: 'Codex', rows: [limit(41, DAY, 604800, { key: 'weekly' }), { key: 'credits', usedPercent: null, valueLabel: '109' }] },
    { id: 'cursor', name: 'Cursor', rows: [limit(52, DAY, null, { key: 'plan' })] },
  ];
  const { limits, values } = rankRows(providers);
  assert.deepEqual(limits.map(({ row }) => row.key), ['plan', 'weekly', '7d', '5h']);
  assert.deepEqual(values.map(({ provider, row }) => `${provider.id}:${row.key}`), ['codex:credits']);
});

test('riskiest prefers the earliest projected exhaustion, then the highest usage', () => {
  const calm = { id: 'cursor', name: 'Cursor', rows: [limit(52, 12 * DAY, null)] };
  const hot = { id: 'codex', name: 'Codex', rows: [limit(41, 6 * DAY, 604800)] };
  assert.equal(riskiest([calm, hot], now).provider.id, 'codex');
  assert.equal(riskiest([calm, { ...hot, rows: [limit(10, 6 * DAY, 604800)] }], now).provider.id, 'cursor');
  assert.equal(riskiest([{ id: 'x', name: 'X', rows: [] }], now), null);
});

test('timeline merges equal resets, stretches the first day and spreads close points over lanes', () => {
  const providers = [
    { id: 'claude', name: 'Claude', rows: [limit(20, 2 * HOUR, 18000, { label: '5-Hour' }), limit(28, 2 * DAY, 604800, { label: '7-Day' })] },
    { id: 'gemini', name: 'Gemini', rows: [limit(24, 3 * HOUR, 86400, { label: 'pro' }), limit(8, 3 * HOUR, 86400, { label: 'flash' })] },
    { id: 'cursor', name: 'Cursor', rows: [limit(52, 20 * DAY, null, { label: 'Plan' })] },
  ];
  const { points, later } = timeline(providers, now);
  assert.equal(later, 1);
  assert.equal(points.length, 3);
  const gemini = points.find((point) => point.providerId === 'gemini');
  assert.deepEqual(gemini.labels, ['pro', 'flash']);
  assert.equal(gemini.maxPercent, 24);
  assert.equal(points[0].x, 2 / 24 * 0.3);
  assert.equal(points.find((point) => point.labels[0] === '7-Day').x, 0.3 + 24 / 312 * 0.7);
  assert.notEqual(points[0].lane, gemini.lane, 'neighbors within the minimum gap use separate lanes');
});

test('relative time uses minutes, hours and days', () => {
  assert.equal(relativeTime(25 * 60000), '25 Min');
  assert.equal(relativeTime(2 * HOUR), '2 Std');
  assert.equal(relativeTime(47 * HOUR), '47 Std');
  assert.equal(relativeTime(2 * DAY - 60000), '2 Tg', 'never shows 48 Std');
  assert.equal(relativeTime(6 * DAY + 2 * HOUR), '6 Tg');
  assert.equal(relativeTime(-HOUR), 'jetzt');
});
