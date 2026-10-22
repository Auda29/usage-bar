const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseGemini, parseCopilot, parseCursor, parseOpenRouter } = require('../src/additional-models.cjs');
const { normalizeSettings } = require('../src/catalog.cjs');

test('Gemini keeps a fully available quota at zero and groups duplicate model buckets by the tightest limit', () => {
  const rows = parseGemini({ buckets: [
    { modelId: 'gemini-pro', remainingFraction: 1 },
    { modelId: 'gemini-pro', remainingFraction: 0.25 },
    { modelId: 'gemini-flash', remainingFraction: 1 },
    { modelId: 'unknown', remainingFraction: null },
  ] });
  assert.deepEqual(rows.map(({ usedPercent }) => usedPercent), [75, 0]);
  assert.throws(() => parseGemini({ buckets: [{ modelId: 'unknown' }] }));
});
test('Copilot uses precise fractional credits and honors unlimited plans', () => {
  const rows = parseCopilot({ quota_snapshots: { premium_interactions: { entitlement: 60000, remaining: 39078, quota_remaining: 39078.5 } } });
  assert.equal(rows[0].detail, '20921.5 / 60000 Credits verbraucht');
  assert(Math.abs(rows[0].usedPercent - 34.869166666666665) < 1e-8);
  assert.equal(parseCopilot({ quota_snapshots: { premium_interactions: { unlimited: true } } })[0].valueLabel, 'Unlimited');
  assert.throws(() => parseCopilot({ quota_snapshots: { completions: { unlimited: true } } }));
});
test('Copilot supports percentage-only snapshots and real zero usage', () => {
  assert.equal(parseCopilot({ quota_snapshots: { premium_interactions: { percent_remaining: 100 } } })[0].usedPercent, 0);
  assert.throws(() => parseCopilot({ quota_snapshots: { premium_interactions: {} } }));
});
test('Cursor derives plan usage and skips absent or unusable on-demand limits', () => {
  const rows = parseCursor({ billingCycleEnd: '2026-11-01T00:00:00Z', planUsage: { limit: 2000, remaining: 1500, autoPercentUsed: 10 }, spendLimitUsage: { individualLimit: 0 } });
  assert.deepEqual(rows.map(({ usedPercent }) => usedPercent), [25, 10]);
  assert.equal(rows[0].resetAt, Date.parse('2026-11-01T00:00:00Z'));
  assert.throws(() => parseCursor({ planUsage: {} }));
  assert.throws(() => parseCursor({ enabled: false }));
});
test('OpenRouter uses the current budget axis instead of lifetime spend and computes reset boundaries in UTC', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  const [result] = parseOpenRouter({ data: { limit: 100, limit_remaining: 74.5, limit_reset: 'monthly', usage: 9999 } }, now);
  assert.equal(result.usedPercent, 25.5);
  assert.equal(result.valueLabel, '$25.50 / $100.00');
  assert.equal(result.remainingValueLabel, '$74.50 left');
  assert.equal(result.resetAt, Date.parse('2026-11-01T00:00:00Z'));
  const [lifetime] = parseOpenRouter({ data: { limit: 100, limit_remaining: 100, limit_reset: null } }, now);
  assert.equal(lifetime.usedPercent, 0);
  assert.equal(lifetime.resetAt, null);
});
test('OpenRouter honors effective workspace budgets and keeps unlimited-key spending distinct', () => {
  const [effective] = parseOpenRouter({ data: { limit: 100, limit_remaining: 90, effective_budget: { limit_usd: 50, remaining_usd: 17.5, reset_interval: 'weekly', resets_at: '2026-10-26T00:00:00Z' } } });
  assert.equal(effective.usedPercent, 65);
  assert.equal(effective.label, 'Weekly Budget');
  const [unlimited] = parseOpenRouter({ data: { limit: null, usage_monthly: 0 } });
  assert.equal(unlimited.usedPercent, null);
  assert.equal(unlimited.valueLabel, '$0.00 spent');
  assert.throws(() => parseOpenRouter({ data: { limit: 100 } }));
  assert.throws(() => parseOpenRouter({ data: { is_management_key: true } }));
});
test('existing choices survive an upgrade and new providers can be selected independently', () => {
  assert.deepEqual(normalizeSettings({ providers: ['codex'] }).providers, ['codex']);
  assert.deepEqual(normalizeSettings({ providers: [] }).providers, []);
  assert.deepEqual(normalizeSettings({ providers: ['gemini', 'copilot', 'cursor', 'openrouter', 'gemini', 'unknown'] }).providers, ['gemini', 'copilot', 'cursor', 'openrouter']);
  assert.equal(normalizeSettings({ headlineProvider: 'openrouter' }).headlineProvider, 'openrouter');
});
