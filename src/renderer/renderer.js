/* The browser preview uses the same renderer with explicit demo data only. */
const api = window.usageBar;
const views = window.UsageViews;
const elements = Object.fromEntries(['toggle', 'refresh', 'headline', 'providers', 'demo-note', 'mode-switch', 'hero', 'alert', 'timeline', 'footer'].map((id) => [id, document.getElementById(id)]));
let state = { providers: [], loading: true, settings: { expanded: true, displayMode: 'usage', providers: ['claude', 'codex'], headlineProvider: 'claude', theme: 'compact' } };

function headlineEntry() {
  const selected = state.providers.find((provider) => provider.id === state.settings.headlineProvider && state.settings.providers.includes(provider.id));
  const candidates = (selected?.rows ?? []).filter((row) => row.windowSeconds > 0 && typeof row.usedPercent === 'number');
  const row = candidates.reduce((best, item) => !best || item.windowSeconds < best.windowSeconds ? item : best, null) ?? selected?.rows?.[0];
  return row ? { provider: selected, row } : null;
}

function renderHeadline(ctx, entry) {
  elements.headline.replaceChildren();
  if (entry) {
    const { provider, row } = entry;
    elements.headline.append(views.make('span', 'headline-label', row.label), views.make('span', views.toneOf(row), views.valueOf(ctx, row)));
    elements.headline.title = `${provider.name}: ${state.settings.displayMode === 'remaining' ? 'verbleibend' : 'verbraucht'}${provider.status === 'stale' ? ' · Daten veraltet' : ''}`;
  } else {
    elements.headline.textContent = state.loading ? 'Lädt…' : state.settings.displayMode === 'remaining' ? 'Verbleibend' : 'Verbraucht';
    elements.headline.title = '';
  }
}

function visibleProviders() {
  return state.settings.providers.map((id) => state.providers.find((provider) => provider.id === id)
    ?? { id, name: state.catalog?.find((provider) => provider.id === id)?.name || id, rows: [], status: 'loading' });
}

function renderProviders(ctx, providers) {
  const ranked = Boolean(state.settings.sortByUsage) && providers.length > 0;
  elements.providers.classList.toggle('ranked', ranked);
  elements.providers.replaceChildren(...(ranked ? views.rankedView(ctx, providers) : providers.map((provider) => views.providerSection(ctx, provider))));
  if (!providers.length) elements.providers.append(views.make('p', 'provider-status', 'Provider über das Tray-Menü auswählen.'));
}

function renderExtras(ctx, providers, entry, expanded) {
  const fill = (element, parts) => { element.replaceChildren(...parts); element.hidden = !expanded || !parts.length; };
  fill(elements.hero, views.heroView(ctx, providers, entry));
  fill(elements.timeline, state.settings.showTimeline ? views.timelineView(ctx, providers) : []);
  const alert = views.alertText(ctx, providers);
  fill(elements.alert, alert ? [alert] : []);
  // The oldest reading is the honest one; a single fresh provider must not hide a stale one.
  const fetched = providers.map((provider) => provider.fetchedAt).filter(Boolean);
  const stale = providers.some((provider) => provider.status === 'stale') ? ' · teils veraltet' : '';
  const stamp = fetched.length ? `Stand ${new Date(Math.min(...fetched)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${stale}` : state.loading ? 'Lädt…' : '';
  fill(elements.footer, [views.make('span', '', stamp), views.make('span', '', 'F5 · Esc')]);
  elements['mode-switch'].hidden = !expanded;
  // Designs with a hero hide the header status only while the hero replaces it.
  document.documentElement.toggleAttribute('data-hero', !elements.hero.hidden);
  for (const button of elements['mode-switch'].querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.mode === state.settings.displayMode));
}

function applyDocumentFlags(settings) {
  const root = document.documentElement;
  root.dataset.theme = settings.theme || 'compact';
  root.toggleAttribute('data-pace', Boolean(settings.showPace));
}

function render(next) {
  state = next;
  const { settings } = state;
  const expanded = settings.expanded;
  const ctx = { state, settings, now: Date.now(), api };
  applyDocumentFlags(settings);
  elements.toggle.setAttribute('aria-expanded', String(expanded));
  elements.providers.hidden = !expanded;
  elements.providers.setAttribute('aria-busy', String(state.loading));
  elements.refresh.disabled = state.loading;
  elements['demo-note'].hidden = !state.demo || !expanded;
  const entry = headlineEntry();
  renderHeadline(ctx, entry);
  const providers = visibleProviders();
  renderProviders(ctx, providers);
  renderExtras(ctx, providers, entry, expanded);
  document.body.dataset.ready = 'true';
  sizeToContent();
}

function sizeToContent() {
  // scrollHeight is rounded and can drop a fraction of a pixel; measure the visible children instead.
  const panel = document.querySelector('.usage-panel');
  const top = panel.getBoundingClientRect().top - panel.scrollTop;
  const bottom = Math.max(0, ...[...panel.children].map((child) => child.getBoundingClientRect().bottom - top));
  const needed = Math.max(panel.scrollHeight, bottom + parseFloat(getComputedStyle(panel).paddingBottom));
  // Allow scrolling only when the content is clearly taller than the window (720 px cap or a small screen).
  panel.classList.toggle('scrollable', needed > window.innerHeight + 1);
  api?.setHeight(Math.ceil(needed));
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
elements['mode-switch'].addEventListener('click', (event) => {
  const mode = event.target.closest('button')?.dataset.mode;
  if (!mode || mode === state.settings.displayMode) return;
  render({ ...state, settings: { ...state.settings, displayMode: mode } });
  void api?.setDisplayMode(mode);
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
window.addEventListener('resize', sizeToContent);
if (api) {
  api.onState(render);
  void api.getState().then(render);
} else if (window.usageBarPreview) render(window.usageBarPreview);
else render({ ...state, loading: false, providers: [], demo: false });
