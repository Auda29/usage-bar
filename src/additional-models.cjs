const { number, timestamp } = require('./model.cjs');
function row(key, label, percent, resetAt = null, seconds = null, valueLabel = null) {
  return { key, label, usedPercent: percent === null ? null : Math.max(0, Math.min(100, percent)), resetAt: timestamp(resetAt), windowSeconds: seconds, valueLabel };
}
function requireRows(rows) { if (!rows.length) throw new Error('Keine Nutzungslimits gemeldet.'); return rows; }
const money = (value) => `$${value.toFixed(2)}`;

function parseGemini(payload) {
  const models = new Map();
  for (const bucket of Array.isArray(payload?.buckets) ? payload.buckets : []) {
    const fraction = number(bucket?.remainingFraction);
    if (!bucket?.modelId || fraction === null) continue;
    const key = String(bucket.modelId);
    const next = row(key, key.replace(/^models\//, ''), (1 - fraction) * 100, bucket.resetTime, 86400);
    // Several token buckets can apply to one model. Its tightest quota controls availability.
    if (!models.has(key) || models.get(key).usedPercent < next.usedPercent) models.set(key, next);
  }
  return requireRows([...models.values()]);
}

function parseCopilot(payload) {
  const snapshot = payload?.quota_snapshots?.premium_interactions;
  if (!snapshot) return requireRows([]);
  const resetAt = payload.quota_reset_date;
  if (snapshot.unlimited === true) return [row('credits', 'AI Credits', null, resetAt, null, 'Unlimited')];
  const total = number(snapshot.entitlement);
  const remaining = number(snapshot.quota_remaining) ?? number(snapshot.remaining);
  const percentRemaining = number(snapshot.percent_remaining);
  const percent = total > 0 && remaining !== null ? (1 - remaining / total) * 100 : percentRemaining === null ? null : 100 - percentRemaining;
  if (percent === null) return requireRows([]);
  const result = row('credits', 'AI Credits', percent, resetAt);
  if (total > 0 && remaining !== null) result.detail = `${Math.max(0, total - remaining)} / ${total} Credits verbraucht`;
  return [result];
}

function periodReset(period, now) {
  const date = new Date(now);
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  if (period === 'daily') return Date.UTC(y, m, d + 1);
  if (period === 'weekly') return Date.UTC(y, m, d + ((8 - date.getUTCDay()) % 7 || 7));
  if (period === 'monthly') return Date.UTC(y, m + 1, 1);
  return null;
}

function parseOpenRouter(payload, now = Date.now()) {
  const data = payload?.data;
  if (!data || typeof data !== 'object') return requireRows([]);
  if (data.is_management_key === true) throw new Error('Bitte einen normalen OpenRouter-API-Key verwenden.');
  // Budgets can constrain a key through workspace/member policy as well as its own limit.
  const budget = data.effective_budget;
  const limit = number(budget?.limit_usd) ?? number(data.limit);
  const remaining = budget ? number(budget.remaining_usd) : number(data.limit_remaining);
  const period = budget?.reset_interval ?? data.limit_reset;
  const names = { daily: 'Daily Budget', weekly: 'Weekly Budget', monthly: 'Monthly Budget' };
  const durations = { daily: 86400, weekly: 604800, monthly: 2592000 };
  if (limit !== null) {
    if (remaining === null || limit < 0) return requireRows([]);
    const used = Math.max(0, limit - remaining);
    const result = row('budget', names[period] || 'Key Budget', limit > 0 ? used / limit * 100 : null, budget?.resets_at || periodReset(period, now), durations[period] || null, `${money(used)} / ${money(limit)}`);
    result.remainingValueLabel = `${money(Math.max(0, remaining))} left`;
    return [result];
  }
  const monthly = number(data.usage_monthly);
  return requireRows(monthly === null ? [] : [row('spend', 'Monthly Spend', null, periodReset('monthly', now), 2592000, `${money(monthly)} spent`)]);
}

function parseCursor(payload) {
  if (payload?.enabled === false) throw new Error('Cursor meldet keine aktive Nutzungsanzeige.');
  const rows = [];
  const plan = payload?.planUsage;
  const resetAt = payload?.billingCycleEnd;
  if (plan) {
    const limit = number(plan.limit), remaining = number(plan.remaining);
    const percent = number(plan.totalPercentUsed) ?? (limit > 0 && remaining !== null ? (1 - remaining / limit) * 100 : null);
    if (percent !== null) rows.push(row('plan', 'Plan Usage', percent, resetAt));
    else if (number(plan.totalSpend) !== null) rows.push(row('spend', 'Plan Spend', null, resetAt, null, money(number(plan.totalSpend) / 100)));
    for (const [key, label] of [['autoPercentUsed', 'Auto'], ['apiPercentUsed', 'API']]) {
      if (number(plan[key]) !== null) rows.push(row(key, label, number(plan[key]), resetAt));
    }
  }
  const demand = payload?.spendLimitUsage;
  const limit = number(demand?.individualLimit), remaining = number(demand?.individualRemaining);
  if (limit > 0 && remaining !== null) rows.push(row('on-demand', 'On-Demand', (1 - remaining / limit) * 100, resetAt));
  return requireRows(rows);
}

module.exports = { parseGemini, parseCopilot, parseOpenRouter, parseCursor };
