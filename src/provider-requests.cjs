const { parseClaude, parseCodex } = require('./model.cjs');
const { parseGemini, parseCopilot, parseOpenRouter, parseCursor } = require('./additional-models.cjs');

const GOOGLE_BASE = 'https://cloudcode-pa.googleapis.com/v1internal:';

async function fetchProvider(id, credential, cache, request, now) {
  const bearer = { Authorization: `Bearer ${credential.token}` };
  if (id === 'claude') return parseClaude(await request('https://api.anthropic.com/api/oauth/usage', { headers: { ...bearer, 'anthropic-beta': 'oauth-2025-04-20' } }));
  if (id === 'codex') return parseCodex(await request('https://chatgpt.com/backend-api/wham/usage', { headers: { ...bearer, ...(credential.accountId ? { 'ChatGPT-Account-Id': credential.accountId } : {}) } }));
  if (id === 'copilot') return parseCopilot(await request('https://api.github.com/copilot_internal/user', {
    headers: { Authorization: `token ${credential.token}`, Accept: 'application/json', 'Editor-Version': 'vscode/1.96.2', 'X-Github-Api-Version': '2025-04-01' },
  }));
  if (id === 'openrouter') return parseOpenRouter(await request('https://openrouter.ai/api/v1/key', { headers: bearer }), now());
  if (id === 'cursor') return parseCursor(await request('https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage', {
    method: 'POST', headers: { ...bearer, 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1' }, body: '{}',
  }));
  if (id === 'gemini') {
    let token = cache.oauth && cache.oauth.expiresAt > now() + 30000 ? cache.oauth.token : credential.token;
    if ((!token || (credential.expiresAt && credential.expiresAt <= now() + 30000)) && !(cache.oauth?.expiresAt > now() + 30000)) {
      if (!credential.refreshToken) throw new Error('Gemini-Anmeldung abgelaufen. Bitte Gemini CLI öffnen.');
      if (!credential.oauthClient?.clientId || !credential.oauthClient?.clientSecret) throw new Error('Gemini-Anmeldung abgelaufen. Bitte mit Gemini CLI erneuern. Für automatische Erneuerung muss die CLI lokal installiert sein.');
      const refreshed = await request('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: credential.oauthClient.clientId, client_secret: credential.oauthClient.clientSecret, refresh_token: credential.refreshToken, grant_type: 'refresh_token' }).toString(),
      });
      if (typeof refreshed.access_token !== 'string' || !refreshed.access_token) throw new Error('Google hat keinen gültigen Zugriffstoken geliefert.');
      token = refreshed.access_token;
      cache.oauth = { token, expiresAt: now() + (Number(refreshed.expires_in) > 0 ? Number(refreshed.expires_in) : 3600) * 1000 };
    }
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    let projectId = credential.projectId || cache.projectId;
    if (!projectId) {
      const discovery = await request(`${GOOGLE_BASE}loadCodeAssist`, {
        method: 'POST', headers, body: JSON.stringify({ metadata: { ideType: 'IDE_UNSPECIFIED', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' }, mode: 'HEALTH_CHECK' }),
      });
      const project = discovery.cloudaicompanionProject;
      projectId = typeof project === 'string' ? project : project?.id;
      if (projectId) cache.projectId = projectId;
    }
    return parseGemini(await request(`${GOOGLE_BASE}retrieveUserQuota`, { method: 'POST', headers, body: JSON.stringify(projectId ? { project: projectId } : {}) }));
  }
  throw new Error('Unbekannter Provider.');
}
module.exports = { fetchProvider };
