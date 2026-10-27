/* DOM builders for the popup. Every design shares this markup; the themes only restyle it. */
(function () {
  const { pace, riskiest, rankRows, timeline, axisPosition, relativeTime, isPercent, isExpired } = window.UsageInsights;
  const percentOf = (fraction) => `${(fraction * 100).toFixed(2)}%`;

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function toneOf(row) {
    return row.usedPercent >= 80 ? 'error' : row.usedPercent >= 50 ? 'warning' : '';
  }

  function displayedPercent(ctx, row) {
    if (!isPercent(row)) return null;
    return Math.round(ctx.settings.displayMode === 'remaining' ? 100 - row.usedPercent : row.usedPercent);
  }

  function valueOf(ctx, row) {
    const percent = displayedPercent(ctx, row);
    const label = ctx.settings.displayMode === 'remaining' ? row.remainingValueLabel ?? row.valueLabel : row.valueLabel;
    return label ?? (percent === null ? '—' : `${percent}%`);
  }

  function resetLabel(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return '';
    const sameDay = date.toDateString() === new Date().toDateString();
    return new Intl.DateTimeFormat(undefined, sameDay
      ? { hour: 'numeric', minute: '2-digit' }
      : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  }

  function logo(id) {
    const image = make('img', 'provider-logo');
    image.src = `../../assets/${id}.svg`;
    image.alt = '';
    return image;
  }

  function staleIndicator() {
    const indicator = make('span', 'stale-indicator');
    indicator.title = 'Letzter erfolgreicher Stand. Aktualisierung fehlgeschlagen.';
    return indicator;
  }

  function resetPhrase(ms) {
    // Keep number and unit together when a sentence wraps ("12 Tg").
    return ms > 0 ? `Reset in ${relativeTime(ms).replace(' ', '\u00a0')}` : 'Reset fällig';
  }

  function paceText(ctx, rowPace) {
    return `Über Plan: bei diesem Tempo leer in ~${relativeTime(rowPace.emptyAt - ctx.now)}`;
  }

  function meterElement(ctx, row, rowPace) {
    const meter = make('div', `meter ${toneOf(row)}`);
    meter.setAttribute('aria-hidden', 'true');
    meter.style.setProperty('--p', String(row.usedPercent));
    // --p drives the linear fill (always used); --shown and the label follow the display mode.
    meter.style.setProperty('--shown', String(displayedPercent(ctx, row)));
    meter.dataset.label = `${displayedPercent(ctx, row)}%`;
    const fill = make('i', 'meter-fill');
    fill.style.width = `${row.usedPercent}%`;
    meter.append(fill);
    if (rowPace) {
      const tick = make('span', 'pace-tick');
      tick.style.left = percentOf(rowPace.elapsed);
      meter.append(tick);
    }
    return meter;
  }

  function valueElement(ctx, row, rowPace) {
    const value = make('span', `row-value ${toneOf(row)}`);
    if (rowPace?.ahead) {
      const flag = make('span', 'pace-flag', '↗');
      flag.title = paceText(ctx, rowPace);
      value.append(flag);
    }
    value.append(valueOf(ctx, row));
    const mode = ctx.settings.displayMode === 'remaining' ? 'Verbleibend' : 'Verbraucht';
    value.title = [row.detail || (row.valueLabel ? row.label : `${mode}: ${valueOf(ctx, row)}`), rowPace?.ahead ? paceText(ctx, rowPace) : ''].filter(Boolean).join(' · ');
    return value;
  }

  function providerTag(provider) {
    const tag = make('span', 'row-provider');
    tag.append(logo(provider.id), make('span', 'row-provider-name', provider.name));
    if (provider.status === 'stale') tag.append(staleIndicator());
    return tag;
  }

  function resetElements(row, now) {
    const reset = resetLabel(row.resetAt);
    if (!reset) return [];
    const time = make('time', 'reset-label', reset);
    time.dateTime = new Date(row.resetAt).toISOString();
    time.title = `Reset: ${new Date(row.resetAt).toLocaleString()}`;
    const due = row.resetAt <= now;
    const relative = make('span', `reset-relative${due ? ' due' : ''}`, due ? 'fällig' : relativeTime(row.resetAt - now));
    relative.title = time.title;
    return [time, relative];
  }

  function buildRow(ctx, provider, row, options = {}) {
    const rowPace = ctx.settings.showPace ? pace(row, ctx.now) : null;
    const line = make('div', `usage-row${row.valueLabel ? ' text-value' : ''}${options.primary ? ' primary' : ''}${rowPace ? ' has-pace' : ''}`);
    line.dataset.key = row.key;
    const label = make('span', 'row-label');
    if (options.withProvider) label.append(providerTag(provider));
    const windowLabel = make('span', 'window-label', row.label);
    windowLabel.title = row.label;
    const [time, relative] = resetElements(row, ctx.now);
    label.append(...[windowLabel, time].filter(Boolean));
    line.append(label, valueElement(ctx, row, rowPace));
    if (relative) line.append(relative);
    if (isPercent(row)) line.append(meterElement(ctx, row, rowPace));
    line.title = [provider.fetchedAt ? `Stand: ${new Date(provider.fetchedAt).toLocaleString()}` : '', row.resetAt ? `Reset: ${new Date(row.resetAt).toLocaleString()}` : ''].filter(Boolean).join(' · ');
    return line;
  }

  function statusLine(ctx, provider) {
    const status = make('p', 'provider-status');
    const lastGood = provider.status === 'stale' && provider.fetchedAt ? ` Letzter Stand: ${new Date(provider.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : '';
    status.append(make('span', 'status-message', `${provider.error || (ctx.state.loading ? 'Wird geladen…' : 'Keine Limits verfügbar.')}${lastGood}`));
    if (provider.status !== 'loading') {
      const link = make('button', 'status-link', 'Einrichten');
      link.type = 'button';
      link.addEventListener('click', () => ctx.api?.openSetup());
      status.append(link);
    }
    return status;
  }

  function providerSection(ctx, provider, { rows = provider.rows } = {}) {
    const section = make('section', 'provider');
    section.dataset.provider = provider.id;
    section.setAttribute('aria-label', provider.name);
    const heading = make('h2', 'provider-heading');
    heading.append(logo(provider.id), make('span', 'provider-name', provider.name));
    if (provider.status === 'stale') heading.append(staleIndicator());
    section.append(heading);
    const primary = rows.find((row) => isPercent(row));
    section.append(...rows.map((row) => buildRow(ctx, provider, row, { primary: row === primary })));
    if (provider.error || !provider.rows.length) section.append(statusLine(ctx, provider));
    return section;
  }

  function rankedView(ctx, providers) {
    const { limits, values } = rankRows(providers, ctx.now);
    const list = make('div', 'ranked-list');
    list.append(...limits.map(({ provider, row }) => buildRow(ctx, provider, row, { withProvider: true })));
    const parts = [list];
    if (values.length) {
      const extra = make('div', 'ranked-values');
      extra.append(...values.map(({ provider, row }) => buildRow(ctx, provider, row, { withProvider: true })));
      parts.push(extra);
    }
    const problems = providers.filter((provider) => provider.error || !provider.rows.length);
    return [...parts, ...problems.map((provider) => providerSection(ctx, provider, { rows: [] }))];
  }

  function axisTick(text, x) {
    const tick = make('span', 'tl-tick', text);
    tick.style.left = percentOf(x);
    return tick;
  }

  function timelineMarker(ctx, point) {
    const stem = make('span', `tl-stem lane-${point.lane}`);
    const chip = make('span', `tl-chip lane-${point.lane}${point.maxPercent >= 50 ? ' warning' : ''}`);
    stem.style.left = chip.style.left = percentOf(point.x);
    chip.title = `${point.name} ${point.labels.join(', ')} · in ${relativeTime(point.resetAt - ctx.now)}${point.maxPercent >= 50 ? ` · ${Math.round(point.maxPercent)} % verbraucht` : ''}`;
    chip.append(logo(point.providerId));
    return [stem, chip];
  }

  function timelineView(ctx, providers) {
    const { points, later } = timeline(providers, ctx.now);
    if (!points.length) return [];
    const head = make('div', 'timeline-head');
    head.append(make('h2', 'timeline-title', 'Nächste Resets'));
    const next = points[0];
    head.append(make('span', 'timeline-next', `${next.name} ${next.labels[0]} · ${relativeTime(next.resetAt - ctx.now)}${later ? ` · +${later} später` : ''}`));
    const track = make('div', 'timeline-track');
    track.append(...points.flatMap((point) => timelineMarker(ctx, point)));
    const brk = make('span', 'tl-break');
    brk.style.left = percentOf(axisPosition(24));
    track.append(make('span', 'tl-axis'), make('span', 'tl-now'), brk,
      axisTick('jetzt', 0), axisTick('24 h', axisPosition(24)), axisTick('1 Wo', axisPosition(168)), axisTick('2 Wo', 1));
    return [head, track];
  }

  function heroEntry(ctx, providers, headline) {
    const risky = ctx.settings.showPace ? riskiest(providers, ctx.now) : null;
    const racing = risky && pace(risky.row, ctx.now)?.ahead ? risky : null;
    return racing ? { ...racing, eyebrow: 'Knappstes Limit' } : headline ? { ...headline, eyebrow: 'Kurzstatus' } : null;
  }

  function heroView(ctx, providers, headline) {
    const entry = heroEntry(ctx, providers, headline);
    if (!entry) return [];
    const { provider, row } = entry;
    const who = make('div', 'hero-who');
    who.append(logo(provider.id), make('span', '', `${provider.name} · ${row.label}`));
    const percent = displayedPercent(ctx, row);
    const value = make('div', `hero-value${row.valueLabel ? ' text' : ''}`, percent === null || row.valueLabel ? valueOf(ctx, row) : String(percent));
    if (percent !== null && !row.valueLabel) value.append(make('small', '', '%'));
    const rowPace = ctx.settings.showPace ? pace(row, ctx.now) : null;
    const detail = rowPace?.ahead ? paceText(ctx, rowPace) : row.resetAt ? `${resetPhrase(row.resetAt - ctx.now)} · ${resetLabel(row.resetAt)}` : '';
    const parts = [make('div', 'hero-eyebrow', entry.eyebrow), who, value, make('div', `hero-detail${rowPace?.ahead ? ' ahead' : ''}`, detail)];
    if (isPercent(row)) parts.push(meterElement(ctx, row, rowPace));
    if (rowPace) {
      const legend = make('div', 'hero-legend');
      legend.append(make('span', 'legend-fill', 'Verbraucht'), make('span', 'legend-tick', 'Zeit im Fenster vergangen'));
      parts.push(legend);
    }
    return parts;
  }

  function alertText(ctx, providers) {
    const top = rankRows(providers, ctx.now).limits[0];
    if (!top || top.row.usedPercent < 50 || isExpired(top.row, ctx.now)) return '';
    const reset = top.row.resetAt ? ` · ${resetPhrase(top.row.resetAt - ctx.now)}` : '';
    return `${top.provider.name} ${top.row.label}: ${Math.round(top.row.usedPercent)} % verbraucht${reset}`;
  }

  window.UsageViews = { make, toneOf, valueOf, providerSection, rankedView, timelineView, heroView, alertText };
}());
