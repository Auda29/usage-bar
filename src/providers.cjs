const { createHash } = require('node:crypto');
const { loadCredential } = require('./credentials.cjs');
const { parseClaude, parseCodex } = require('./model.cjs');

const PROVIDERS = [{ id: 'claude', name: 'Claude' }, { id: 'codex', name: 'Codex' }];
const urls = { claude: 'https://api.anthropic.com/api/oauth/usage', codex: 'https://chatgpt.com/backend-api/wham/usage' };

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
        return { ...meta, rows: [], status: 'unconfigured', error: `${meta.name === 'Claude' ? 'Claude Code' : 'Codex'} anmelden`, fetchedAt: null };
      }
      const fingerprint = createHash('sha256').update(`${credential.token}\0${credential.accountId ?? ''}`).digest('hex');
      entry = this.cache.get(id);
      if (entry?.fingerprint !== fingerprint) {
        entry = { fingerprint, rows: [], fetchedAt: null, retryAt: 0 };
        this.cache.set(id, entry);
      }
      if (credential.expiresAt && credential.expiresAt <= this.now()) {
        throw new Error(`Anmeldung abgelaufen. ${id === 'claude' ? 'Claude Code' : 'Codex'} öffnen.`);
      }
      if (entry.retryAt > this.now()) throw new Error('Zu viele Abfragen. Neuer Versuch nach der Wartezeit.');
      const response = await this.fetch(urls[id], {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${credential.token}`,
          ...(id === 'claude' ? { 'anthropic-beta': 'oauth-2025-04-20' } : {}),
          ...(id === 'codex' && credential.accountId ? { 'ChatGPT-Account-Id': credential.accountId } : {}),
        },
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
        if (id === 'codex' && errorPayload?.error?.type === 'rejected_by_access_enforcement') {
          throw new Error('Diese Anmeldung erlaubt keine Usage-Abfrage. ChatGPT-Usage öffnen.');
        }
        throw new Error(`Anmeldung erneuern. ${id === 'claude' ? 'Claude Code' : 'Codex'} öffnen.`);
      }
      if (!response.ok) throw new Error(`Abruf fehlgeschlagen (HTTP ${response.status}).`);
      let payload;
      try { payload = await response.json(); } catch { throw new Error('Ungültige Antwort des Providers.'); }
      entry.rows = id === 'claude' ? parseClaude(payload) : parseCodex(payload);
      entry.fetchedAt = this.now();
      entry.retryAt = 0;
      return { ...meta, rows: entry.rows, status: 'ok', error: null, fetchedAt: entry.fetchedAt, source: credential.source };
    } catch (error) {
      const message = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'Zeitüberschreitung beim Abruf.'
        : error instanceof TypeError ? 'Provider nicht erreichbar. Verbindung prüfen.'
          : error?.message || 'Abruf fehlgeschlagen.';
      return { ...meta, rows: entry?.rows ?? [], status: entry?.rows.length ? 'stale' : 'error', error: message, fetchedAt: entry?.fetchedAt ?? null, retryAt: entry?.retryAt || null };
    }
  }

  readAll() { return Promise.all(PROVIDERS.map(({ id }) => this.read(id))); }
}

module.exports = { ProviderService, PROVIDERS };
