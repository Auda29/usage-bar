/* The browser preview uses the same renderer with explicit demo data only. */
const api = window.usageBar;
const elements = Object.fromEntries(['toggle', 'refresh', 'headline', 'providers', 'demo-note'].map((id) => [id, document.getElementById(id)]));
let state = { providers: [], loading: true, settings: { expanded: true, displayMode: 'usage', providers: ['claude', 'codex'], headlineProvider: 'claude' } };

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function displayedPercent(row) {
  if (typeof row.usedPercent !== 'number' || !Number.isFinite(row.usedPercent)) return null;
  return Math.round(state.settings.displayMode === 'remaining' ? 100 - row.usedPercent : row.usedPercent);
}

function valueOf(row) {
  const percent = displayedPercent(row);
  return (state.settings.displayMode === 'remaining' ? row.remainingValueLabel ?? row.valueLabel : row.valueLabel) ?? (percent === null ? '—' : `${percent}%`);
}

function toneOf(row) {
  return row.usedPercent >= 80 ? 'error' : row.usedPercent >= 50 ? 'warning' : '';
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

function render(next) {
  state = next;
  const expanded = state.settings.expanded;
  elements.toggle.setAttribute('aria-expanded', String(expanded));
  elements.providers.hidden = !expanded;
  elements.providers.setAttribute('aria-busy', String(state.loading));
  elements.refresh.disabled = state.loading;
  elements['demo-note'].hidden = !state.demo || !expanded;
  elements.headline.replaceChildren();
  const selected = state.providers.find((provider) => provider.id === state.settings.headlineProvider && state.settings.providers.includes(provider.id));
  const candidates = (selected?.rows ?? []).filter((row) => row.windowSeconds > 0 && typeof row.usedPercent === 'number');
  const headlineRow = candidates.reduce((best, row) => !best || row.windowSeconds < best.windowSeconds ? row : best, null) ?? selected?.rows?.[0];
  if (headlineRow) {
    elements.headline.append(make('span', 'headline-label', headlineRow.label), make('span', toneOf(headlineRow), valueOf(headlineRow)));
    elements.headline.title = `${selected.name}: ${state.settings.displayMode === 'remaining' ? 'verbleibend' : 'verbraucht'}${selected.status === 'stale' ? ' · Daten veraltet' : ''}`;
  } else {
    elements.headline.textContent = state.loading ? 'Lädt…' : state.settings.displayMode === 'remaining' ? 'Verbleibend' : 'Verbraucht';
    elements.headline.title = '';
  }
  elements.providers.replaceChildren();
  const visibleProviders = state.settings.providers.map((id) => state.providers.find((provider) => provider.id === id) ?? { id, name: state.catalog?.find((provider) => provider.id === id)?.name || id, rows: [], status: 'loading' });
  for (const provider of visibleProviders) {
    const section = make('section', 'provider');
    section.setAttribute('aria-label', provider.name);
    const heading = make('h2', 'provider-heading');
    const logo = make('img', 'provider-logo');
    logo.src = `../../assets/${provider.id}.svg`;
    logo.alt = '';
    heading.append(logo, make('span', '', provider.name));
    if (provider.status === 'stale') {
      const indicator = make('span', 'stale-indicator');
      indicator.title = 'Letzter erfolgreicher Stand. Aktualisierung fehlgeschlagen.';
      heading.append(indicator);
    }
    section.append(heading);
    for (const row of provider.rows) {
      const line = make('div', `usage-row${row.valueLabel ? ' text-value' : ''}`);
      line.dataset.key = row.key;
      const label = make('span', 'row-label');
      const windowLabel = make('span', 'window-label', row.label);
      windowLabel.title = row.label;
      label.append(windowLabel);
      const reset = resetLabel(row.resetAt);
      if (reset) {
        const time = make('time', 'reset-label', reset);
        time.dateTime = new Date(row.resetAt).toISOString();
        time.title = `Reset: ${new Date(row.resetAt).toLocaleString()}`;
        label.append(time);
      }
      const value = make('span', `row-value ${toneOf(row)}`, valueOf(row));
      value.title = row.detail || (row.valueLabel ? row.label : `${state.settings.displayMode === 'remaining' ? 'Verbleibend' : 'Verbraucht'}: ${valueOf(row)}`);
      line.append(label, value);
      line.title = [provider.fetchedAt ? `Stand: ${new Date(provider.fetchedAt).toLocaleString()}` : '', row.resetAt ? `Reset: ${new Date(row.resetAt).toLocaleString()}` : ''].filter(Boolean).join(' · ');
      section.append(line);
    }
    if (provider.error || !provider.rows.length) {
      const status = make('p', 'provider-status');
      const lastGood = provider.status === 'stale' && provider.fetchedAt ? ` Letzter Stand: ${new Date(provider.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : '';
      status.append(make('span', 'status-message', `${provider.error || (state.loading ? 'Wird geladen…' : 'Keine Limits verfügbar.')}${lastGood}`));
      if (provider.status !== 'loading') {
        const link = make('button', 'status-link', 'Einrichten');
        link.type = 'button';
        link.addEventListener('click', () => api?.openSetup());
        status.append(link);
      }
      section.append(status);
    }
    elements.providers.append(section);
  }
  if (!visibleProviders.length) {
    const empty = make('p', 'provider-status', 'Provider über das Tray-Menü auswählen.');
    elements.providers.append(empty);
  }
  document.body.dataset.ready = 'true';
  sizeToContent();
}

function sizeToContent() {
  api?.setHeight(Math.ceil(document.querySelector('.usage-panel').scrollHeight));
}

elements.toggle.addEventListener('click', () => {
  const expanded = !state.settings.expanded;
  render({ ...state, settings: { ...state.settings, expanded } });
  void api?.setExpanded(expanded);
});
elements.refresh.addEventListener('click', async () => {
  if (!api) return;
  try { render(await api.refresh()); } catch { elements.refresh.disabled = false; }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') api?.hide();
  if (event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r')) {
    event.preventDefault();
    elements.refresh.click();
  }
});
document.addEventListener('contextmenu', (event) => { if (api) { event.preventDefault(); api.showMenu(); } });
new ResizeObserver(sizeToContent).observe(document.querySelector('.usage-panel'));
if (api) {
  api.onState(render);
  void api.getState().then(render);
} else if (window.usageBarPreview) render(window.usageBarPreview);
else render({ ...state, loading: false, providers: [], demo: false });
