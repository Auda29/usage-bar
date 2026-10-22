const number = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function timestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = number(value);
  const result = numeric !== null
    ? (numeric < 1e12 ? numeric * 1000 : numeric)
    : Date.parse(value);
  return Number.isFinite(result) && result > 0 ? result : null;
}

function row(key, label, usedPercent, resetAt, seconds, valueLabel = null) {
  const percent = number(usedPercent);
  return {
    key, label,
    usedPercent: percent === null ? null : Math.max(0, Math.min(100, percent)),
    resetAt: timestamp(resetAt),
    windowSeconds: seconds,
    valueLabel,
  };
}

function parseClaude(payload) {
  const rows = [];
  if (Array.isArray(payload?.limits) && payload.limits.length) {
    for (const limit of payload.limits) {
      if (limit?.kind === 'session' && number(limit.percent) !== null) {
        rows.push(row('5h', '5-Hour', limit.percent, limit.resets_at, 18000));
      } else if (limit?.kind === 'weekly_all' && number(limit.percent) !== null) {
        rows.push(row('7d', '7-Day Limit', limit.percent, limit.resets_at, 604800));
      } else if (limit?.kind === 'weekly_scoped' && number(limit.percent) !== null && limit.scope?.model?.display_name) {
        rows.push(row(`model-${limit.scope.model.display_name}`, `${limit.scope.model.display_name} · 7-Day Limit`, limit.percent, limit.resets_at, 604800));
      }
    }
  } else {
    if (number(payload?.five_hour?.utilization) !== null) rows.push(row('5h', '5-Hour', payload.five_hour.utilization, payload.five_hour.resets_at, 18000));
    if (number(payload?.seven_day?.utilization) !== null) rows.push(row('7d', '7-Day Limit', payload.seven_day.utilization, payload.seven_day.resets_at, 604800));
  }
  // Do not turn an absent or disabled paid allowance into a zero reading.
  const extra = payload?.extra_usage;
  if (extra?.is_enabled === true && number(extra.utilization) !== null) {
    rows.push(row('extra', 'Extra Usage', extra.utilization, null, null));
  }
  const spend = payload?.spend;
  if (spend?.enabled === true && number(spend.percent) !== null) {
    rows.push(row('extra', 'Extra Usage', spend.percent, null, null));
  }
  if (!rows.length) throw new Error('Keine Nutzungslimits gemeldet.');
  return rows;
}

function parseCodex(payload) {
  const rows = [];
  for (const [key, window] of [['primary', payload?.rate_limit?.primary_window], ['secondary', payload?.rate_limit?.secondary_window]]) {
    if (!window || number(window.used_percent) === null) continue;
    const seconds = number(window.limit_window_seconds);
    const label = seconds === 18000 ? '5-Hour' : seconds === 604800 ? 'Weekly' : seconds === 86400 ? 'Daily' : 'Usage';
    rows.push(row(key, label, window.used_percent, window.reset_at, seconds));
  }
  const credits = payload?.credits;
  if (credits?.unlimited === true) rows.push(row('credits', 'Credits Balance', null, null, null, 'Unlimited'));
  else if (number(credits?.balance) !== null) rows.push(row('credits', 'Credits Balance', null, null, null, String(number(credits.balance))));
  const spend = payload?.spend_control?.individual_limit;
  if (spend && number(spend.used_percent) !== null) rows.push(row('spend', 'Credits', spend.used_percent, null, null));
  if (!rows.length) throw new Error('Keine Nutzungslimits gemeldet.');
  return rows;
}

function positionPopup(workArea, trayBounds, width, height) {
  const margin = 8;
  width = Math.min(width, workArea.width);
  height = Math.min(height, workArea.height);
  const hasAnchor = trayBounds && trayBounds.width > 0;
  const wantedX = hasAnchor ? trayBounds.x + trayBounds.width / 2 - width / 2 : workArea.x + workArea.width - width - margin;
  const wantedY = hasAnchor && trayBounds.y < workArea.y
    ? workArea.y + margin
    : hasAnchor && trayBounds.y >= workArea.y && trayBounds.y < workArea.y + workArea.height
      ? trayBounds.y + trayBounds.height - height
      : workArea.y + workArea.height - height - margin;
  return {
    x: Math.round(Math.max(workArea.x, Math.min(wantedX, workArea.x + workArea.width - width))),
    y: Math.round(Math.max(workArea.y, Math.min(wantedY, workArea.y + workArea.height - height))),
    width, height,
  };
}

module.exports = { number, timestamp, parseClaude, parseCodex, positionPopup };
