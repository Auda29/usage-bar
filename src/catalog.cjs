const PROVIDERS = [
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/settings/usage', help: 'Mit Claude Code anmelden. Die vorhandene Anmeldung wird automatisch gelesen.' },
  { id: 'codex', name: 'Codex', url: 'https://chatgpt.com/settings/usage', help: 'Mit Codex anmelden. Die vorhandene Anmeldung wird automatisch gelesen.' },
  { id: 'gemini', name: 'Gemini', url: 'https://geminicli.com/docs/get-started/authentication/', help: 'Gemini CLI starten und mit Google anmelden. Ein Gemini-API-Key liefert diese Kontingente nicht.' },
  { id: 'copilot', name: 'GitHub Copilot', url: 'https://github.com/settings/copilot', help: 'Vorhandene Copilot-Anmeldung oder GitHub CLI verwenden. Alternativ einen GitHub-Token mit Zugriff auf die Copilot-Nutzung speichern.', tokenLabel: 'GitHub-Token' },
  { id: 'cursor', name: 'Cursor', url: 'https://cursor.com/dashboard', help: 'In Cursor anmelden und die Desktop-Anmeldung importieren. Alternativ einen Cursor-Access-Token speichern.', tokenLabel: 'Cursor-Access-Token', canImport: true },
  { id: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai/settings/keys', help: 'Einen normalen OpenRouter-API-Key speichern oder OPENROUTER_API_KEY setzen. Angezeigt werden Verbrauch und Budget dieses Keys.', tokenLabel: 'OpenRouter-API-Key' },
];
const PROVIDER_IDS = PROVIDERS.map(({ id }) => id);
const DEFAULT_SETTINGS = { displayMode: 'usage', expanded: true, providers: ['claude', 'codex'], headlineProvider: 'claude', hasLaunched: false };
function normalizeSettings(saved = {}) {
  return {
    displayMode: saved.displayMode === 'remaining' ? 'remaining' : 'usage',
    expanded: saved.expanded !== false,
    providers: Array.isArray(saved.providers) ? PROVIDER_IDS.filter((id) => saved.providers.includes(id)) : [...DEFAULT_SETTINGS.providers],
    headlineProvider: PROVIDER_IDS.includes(saved.headlineProvider) ? saved.headlineProvider : 'claude',
    hasLaunched: saved.hasLaunched === true,
  };
}
module.exports = { PROVIDERS, PROVIDER_IDS, DEFAULT_SETTINGS, normalizeSettings };
