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
    { id: 'gemini', name: 'Gemini', status: 'ok', fetchedAt: now, rows: [
      { key: 'pro', label: 'gemini-pro', usedPercent: 24, resetAt: now + 8 * 3600000, windowSeconds: 86400 },
      { key: 'flash', label: 'gemini-flash', usedPercent: 8, resetAt: now + 8 * 3600000, windowSeconds: 86400 },
    ] },
    { id: 'copilot', name: 'GitHub Copilot', status: 'ok', fetchedAt: now, rows: [
      { key: 'credits', label: 'AI Credits', usedPercent: 35, resetAt: now + 10 * 86400000, windowSeconds: null },
    ] },
    { id: 'cursor', name: 'Cursor', status: 'ok', fetchedAt: now, rows: [
      { key: 'plan', label: 'Plan Usage', usedPercent: 52, resetAt: now + 12 * 86400000, windowSeconds: null },
    ] },
    { id: 'openrouter', name: 'OpenRouter', status: 'ok', fetchedAt: now, rows: [
      { key: 'budget', label: 'Monthly Budget', usedPercent: 25.5, resetAt: now + 10 * 86400000, windowSeconds: 2592000, valueLabel: '$25.50 / $100.00', remainingValueLabel: '$74.50 left' },
    ] },
  ];
}
module.exports = { demoProviders };
