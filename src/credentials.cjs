const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

async function readJson(file) {
  try {
    const stat = await fs.stat(file);
    if (stat.size > 1024 * 1024) return null;
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch { return null; }
}

function jwtExpiry(token) {
  try {
    const exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch { return null; }
}

function validToken(value) { return typeof value === 'string' && value.length > 0 && !/[\r\n]/.test(value) ? value : null; }

async function openCodeCredential(provider, env, home) {
  const bases = [env.OPENCODE_DATA_DIR, path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'opencode'), env.APPDATA && path.join(env.APPDATA, 'opencode')].filter(Boolean);
  for (const base of bases) {
    const auth = await readJson(path.join(base, 'auth.json'));
    for (const alias of provider === 'claude' ? ['anthropic', 'claude'] : ['openai', 'codex', 'chatgpt']) {
      const entry = auth?.[alias];
      const token = validToken(entry?.access ?? entry?.token);
      if (token) return { token, accountId: validToken(entry.accountId), expiresAt: entry.expires ?? jwtExpiry(token), source: 'OpenCode' };
    }
  }
  return null;
}

async function loadCredential(provider, { env = process.env, home = os.homedir() } = {}) {
  if (provider === 'claude') {
    const auth = await readJson(path.join(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), '.credentials.json'));
    const oauth = auth?.claudeAiOauth;
    const token = validToken(oauth?.accessToken);
    if (token) return { token, expiresAt: oauth.expiresAt, source: 'Claude Code' };
    const fallback = await openCodeCredential(provider, env, home);
    if (fallback) return fallback;
    const envToken = validToken(env.CLAUDE_CODE_OAUTH_TOKEN);
    if (envToken) return { token: envToken, expiresAt: jwtExpiry(envToken), source: 'Claude Code OAuth' };
  } else if (provider === 'codex') {
    const auth = await readJson(path.join(env.CODEX_HOME || path.join(home, '.codex'), 'auth.json'));
    const token = validToken(auth?.tokens?.access_token);
    if (token) return { token, accountId: validToken(auth.tokens.account_id), expiresAt: jwtExpiry(token), source: 'Codex' };
    const fallback = await openCodeCredential(provider, env, home);
    if (fallback) return fallback;
  }
  return null;
}

module.exports = { loadCredential };
