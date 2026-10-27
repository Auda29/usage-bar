const { createHash } = require('node:crypto');
const { loadCredential } = require('./credentials.cjs');
const { PROVIDERS } = require('./catalog.cjs');
const { fetchProvider } = require('./provider-requests.cjs');
const { CLAUDE_SIGN_IN_REQUIRED } = require('./claude-session.cjs');

class ProviderService {
  constructor({ fetchImpl = fetch, credentialLoader = loadCredential, now = Date.now } = {}) {
    this.fetch = fetchImpl;
    this.loadCredential = credentialLoader;
    this.now = now;
    this.cache = new Map();
    this.pending = new Map();
  }

  read(id) {
    if (this.pending.has(id)) return this.pending.get(id);
    const pending = this.readOnce(id).finally(() => this.pending.delete(id));
    this.pending.set(id, pending);
    return pending;
  }

  async readOnce(id) {
    const meta = PROVIDERS.find((provider) => provider.id === id);
    if (!meta) throw new Error('Unknown provider');
    let entry = null;
    try {
      const credential = await this.loadCredential(id);
      if (!credential) {
        this.cache.delete(id);
        return { id: meta.id, name: meta.name, rows: [], status: 'unconfigured', error: `${meta.name} einrichten`, fetchedAt: null };
      }
      const fingerprint = createHash('sha256').update(JSON.stringify([credential.token, credential.refreshToken, credential.accountId, credential.projectId])).digest('hex');
      entry = this.cache.get(id);
      if (entry?.fingerprint !== fingerprint) {
        entry = { fingerprint, rows: [], fetchedAt: null, retryAt: 0 };
        this.cache.set(id, entry);
      }
      if (typeof credential.expiresAt === 'number' && credential.expiresAt <= this.now() && !(id === 'gemini' && credential.refreshToken)) {
        throw new Error(id === 'claude' ? CLAUDE_SIGN_IN_REQUIRED : `Anmeldung abgelaufen. ${meta.name} öffnen.`);
      }
      if (entry.retryAt > this.now()) throw new Error('Zu viele Abfragen. Neuer Versuch nach der Wartezeit.');
      if (entry.profileError) throw new Error(entry.profileError);
      const request = async (url, options = {}) => {
        const response = await this.fetch(url, {
        method: 'GET', ...options,
        signal: AbortSignal.timeout(20000),
        redirect: 'error',
      });
      if (response.status === 429) {
        const raw = response.headers.get('retry-after');
        const seconds = Number(raw);
        const wait = seconds > 0 ? seconds * 1000 : raw && Number.isFinite(Date.parse(raw)) ? Date.parse(raw) - this.now() : 300000;
        entry.retryAt = this.now() + Math.max(1000, Math.min(wait, 3600000));
        throw new Error('Zu viele Abfragen. Neuer Versuch nach der Wartezeit.');
      }
      if (response.status === 401 || response.status === 403) {
        const errorPayload = await response.json().catch(() => null);
        if (id === 'claude' && response.status === 403 && url === 'https://api.anthropic.com/api/oauth/profile' && typeof errorPayload?.error?.message === 'string' && errorPayload.error.message.includes('scope requirement')) {
          entry.profileError = 'OAuth-Token hat keine Profilberechtigung für Usage. Mit „claude auth login --claudeai“ anmelden.';
          throw new Error(entry.profileError);
        }
        if (id === 'codex' && errorPayload?.error?.type === 'rejected_by_access_enforcement') {
          throw new Error('Diese Anmeldung erlaubt keine Usage-Abfrage. ChatGPT-Usage öffnen.');
        }
        if (id === 'gemini' && response.status === 403) {
          throw new Error('Google gibt für diese Anmeldung keine Gemini-CLI-Kontingente frei. Gemini CLI mit diesem Konto einrichten.');
        }
        throw new Error(id === 'copilot' ? 'GitHub-Anmeldung erlaubt keine Copilot-Nutzung. Passenden Token einrichten.' : `Anmeldung erneuern. ${meta.name === 'Claude' ? 'Claude Code' : meta.name} öffnen.`);
      }
      if (!response.ok) throw new Error(`Abruf fehlgeschlagen (HTTP ${response.status}).`);
      try { return await response.json(); } catch { throw new Error('Ungültige Antwort des Providers.'); }
      };
      if (id === 'claude' && credential.requiresProfileCheck && !entry.profileChecked) {
        await request('https://api.anthropic.com/api/oauth/profile', { headers: { Authorization: `Bearer ${credential.token}`, 'anthropic-beta': 'oauth-2025-04-20' } });
        entry.profileChecked = true;
      }
      const rows = await fetchProvider(id, credential, entry, request, this.now);
      if (this.cache.get(id) !== entry) {
        entry = null;
        throw new Error('Anmeldung geändert. Neuer Abruf folgt.');
      }
      entry.rows = rows;
      entry.fetchedAt = this.now();
      entry.retryAt = 0;
      return { id: meta.id, name: meta.name, rows: entry.rows, status: 'ok', error: null, fetchedAt: entry.fetchedAt, source: credential.source };
    } catch (error) {
      const message = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'Zeitüberschreitung beim Abruf.'
        : error instanceof TypeError ? 'Provider nicht erreichbar. Verbindung prüfen.'
          : error?.message || 'Abruf fehlgeschlagen.';
      return { id: meta.id, name: meta.name, rows: entry?.rows ?? [], status: entry?.rows.length ? 'stale' : 'error', error: message, fetchedAt: entry?.fetchedAt ?? null, retryAt: entry?.retryAt || null };
    }
  }

  readAll(ids = PROVIDERS.map(({ id }) => id)) { return Promise.all(ids.map((id) => this.read(id))); }
  forget(id) { this.cache.delete(id); }
}

module.exports = { ProviderService, PROVIDERS };
