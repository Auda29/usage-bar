/* Pure usage calculations shared by the popup and the Node tests. No DOM access. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UsageInsights = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const HOUR = 3600000;
  const DAY = 24 * HOUR;
  // Early in a window a single request looks like a runaway rate. Wait for 5 % of the
  // window, at most 30 minutes, unless a quarter of the limit is already gone.
  const MIN_PACE_ELAPSED = 0.05;
  const MAX_PACE_WARMUP = 30 * 60000;
  const PACE_BYPASS_USED = 0.25;
  const TIMELINE = { horizonHours: 14 * 24, nearShare: 0.3, minGap: 0.09, lanes: 2 };

  const isPercent = (row) => typeof row.usedPercent === 'number' && Number.isFinite(row.usedPercent);

  function windowElapsed(row, now) {
    if (!(row.windowSeconds > 0) || !row.resetAt) return null;
    const left = row.resetAt - now;
    if (left < 0) return null;
    return Math.min(1, Math.max(0, 1 - left / (row.windowSeconds * 1000)));
  }

  function pace(row, now) {
    if (!isPercent(row)) return null;
    const elapsed = windowElapsed(row, now);
    if (elapsed === null) return null;
    const used = row.usedPercent / 100;
    const windowMs = row.windowSeconds * 1000;
    const elapsedMs = elapsed * windowMs;
    const warmedUp = elapsedMs >= Math.min(MIN_PACE_ELAPSED * windowMs, MAX_PACE_WARMUP) || used >= PACE_BYPASS_USED;
    let emptyAt = null;
    if (warmedUp && elapsedMs > 0 && used > 0 && used < 1) {
      const projected = now + (1 - used) * elapsedMs / used;
      if (projected < row.resetAt) emptyAt = projected;
    }
    return { elapsed, ahead: emptyAt !== null, emptyAt };
  }

  function entries(providers) {
    return providers.flatMap((provider) => (provider.rows ?? []).map((row) => ({ provider, row })));
  }

  // A reading whose reset already passed is outdated (the limit is back to zero), so it ranks last.
  const isExpired = (row, now) => now !== undefined && Boolean(row.resetAt) && row.resetAt <= now;

  function rankRows(providers, now) {
    const all = entries(providers);
    const limits = all.filter(({ row }) => isPercent(row))
      .sort((a, b) => isExpired(a.row, now) - isExpired(b.row, now) || b.row.usedPercent - a.row.usedPercent);
    return { limits, values: all.filter(({ row }) => !isPercent(row)) };
  }

  function riskiest(providers, now) {
    const limits = rankRows(providers, now).limits.filter(({ row }) => !isExpired(row, now));
    const racing = limits
      .map((entry) => ({ ...entry, pace: pace(entry.row, now) }))
      .filter((entry) => entry.pace?.ahead)
      .sort((a, b) => a.pace.emptyAt - b.pace.emptyAt);
    return racing[0] ?? limits[0] ?? null;
  }

  function axisPosition(hours) {
    const { horizonHours, nearShare } = TIMELINE;
    if (hours <= 24) return hours / 24 * nearShare;
    return nearShare + (hours - 24) / (horizonHours - 24) * (1 - nearShare);
  }

  function assignLanes(points) {
    const lastX = Array(TIMELINE.lanes).fill(-Infinity);
    return points.map((point) => {
      let lane = lastX.findIndex((x) => point.x - x >= TIMELINE.minGap);
      if (lane === -1) lane = lastX.indexOf(Math.min(...lastX));
      lastX[lane] = point.x;
      return { ...point, lane };
    });
  }

  function timeline(providers, now) {
    const horizon = now + TIMELINE.horizonHours * HOUR;
    const groups = new Map();
    let later = 0;
    for (const { provider, row } of entries(providers)) {
      if (!row.resetAt || row.resetAt <= now) continue;
      if (row.resetAt > horizon) { later += 1; continue; }
      // Rows of one provider resetting within the same minute share a marker.
      const key = `${provider.id}:${Math.round(row.resetAt / 60000)}`;
      const group = groups.get(key) ?? { providerId: provider.id, name: provider.name, labels: [], resetAt: row.resetAt, maxPercent: null };
      const maxPercent = isPercent(row) ? Math.max(group.maxPercent ?? 0, row.usedPercent) : group.maxPercent;
      groups.set(key, { ...group, labels: [...group.labels, row.label], maxPercent });
    }
    const points = [...groups.values()]
      .map((group) => ({ ...group, x: axisPosition((group.resetAt - now) / HOUR) }))
      .sort((a, b) => a.x - b.x);
    return { points: assignLanes(points), later };
  }

  function relativeTime(ms) {
    if (!(ms > 0)) return 'jetzt';
    if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60000))} Min`;
    if (Math.round(ms / HOUR) < 48) return `${Math.round(ms / HOUR)} Std`;
    return `${Math.round(ms / DAY)} Tg`;
  }

  return { windowElapsed, pace, rankRows, riskiest, timeline, axisPosition, relativeTime, isPercent, isExpired, TIMELINE };
}));
