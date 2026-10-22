function demoProviders(now = Date.now()) {
  return [
    { id: 'claude', name: 'Claude', status: 'ok', fetchedAt: now, rows: [
      { key: '5h', label: '5-Hour', usedPercent: 20, resetAt: now + 2 * 3600000, windowSeconds: 18000 },
      { key: '7d', label: '7-Day Limit', usedPercent: 28, resetAt: now + 2 * 86400000, windowSeconds: 604800 },
    ] },
    { id: 'codex', name: 'Codex', status: 'ok', fetchedAt: now, rows: [
      { key: 'secondary', label: 'Weekly', usedPercent: 41, resetAt: now + 6 * 86400000, windowSeconds: 604800 },
      { key: 'credits', label: 'Credits Balance', usedPercent: null, resetAt: null, windowSeconds: null, valueLabel: '109.0869435' },
    ] },
  ];
}
module.exports = { demoProviders };
