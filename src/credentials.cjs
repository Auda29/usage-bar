const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
const { githubAccountToken, validGitHubLogin } = require('./github-accounts.cjs');
const { loadGeminiClient } = require('./gemini-client.cjs');

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

function validToken(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= 16384 && !/[\r\n]/.test(value) ? value.trim() : null; }

async function openCodeCredential(provider, env, home) {
  const bases = [env.OPENCODE_DATA_DIR, path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'opencode'), env.APPDATA && path.join(env.APPDATA, 'opencode')].filter(Boolean);
  for (const base of bases) {
    const auth = await readJson(path.join(base, 'auth.json'));
    const aliases = { claude: ['anthropic', 'claude'], codex: ['openai', 'codex', 'chatgpt'], gemini: ['google', 'google.oauth', 'gemini'], copilot: ['github-copilot', 'copilot'], openrouter: ['openrouter'] };
    for (const alias of aliases[provider] || []) {
      const entry = auth?.[alias];
      const token = validToken(entry?.access ?? entry?.token ?? (provider === 'openrouter' ? entry?.key : null));
      if (token) {
        const [refreshToken, projectId] = provider === 'gemini' ? (entry.refresh || '').split('|') : [];
        return { token, accountId: validToken(entry.accountId), expiresAt: entry.expires ?? jwtExpiry(token), source: 'OpenCode', ...(provider === 'gemini' ? { refreshToken: validToken(refreshToken), projectId: projectId || null, oauthClient: await loadGeminiClient({ env, home }) } : {}) };
      }
    }
  }
  return null;
}

async function readCursorCredential({ env = process.env, home = os.homedir() } = {}) {
  const file = path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  let database;
  try {
    // Only read after the user's explicit import action. The editor's database stays untouched.
    const { DatabaseSync } = require('node:sqlite');
    database = new DatabaseSync(file, { readOnly: true });
    const token = validToken(database.prepare('SELECT value FROM ItemTable WHERE key = ? LIMIT 1').get('cursorAuth/accessToken')?.value);
    if (token) return { token, expiresAt: jwtExpiry(token), source: 'Cursor Desktop' };
  } catch { /* Missing, locked, or encrypted Cursor storage is not a usable login. */ }
  finally { database?.close(); }
  return null;
}

async function githubCliToken() {
  try {
    const { stdout } = await execFileAsync(process.platform === 'win32' ? 'gh.exe' : 'gh', ['auth', 'token', '--hostname', 'github.com'], { windowsHide: true, timeout: 5000, maxBuffer: 32768 });
    return validToken(stdout.trim());
  } catch { return null; }
}

async function loadCredential(provider, { env = process.env, home = os.homedir(), managedCredential = null, githubTokenLoader = githubCliToken, githubAccountTokenLoader = githubAccountToken } = {}) {
  if (provider === 'copilot' && managedCredential?.mode === 'github-cli') {
    const login = managedCredential.login;
    if (!validGitHubLogin(login)) throw new Error('Ungültiges GitHub-Konto. Konto erneut auswählen.');
    const token = validToken(await githubAccountTokenLoader(login, { env }));
    if (!token) throw new Error(`GitHub-Konto ${login} nicht verfügbar. In der GitHub CLI erneut anmelden oder anderes Konto auswählen.`);
    return { token, login, source: 'GitHub CLI' };
  }
  if (managedCredential?.mode === 'local-cursor' && provider === 'cursor') return readCursorCredential({ env, home });
  if (validToken(managedCredential?.token)) return { token: validToken(managedCredential.token), expiresAt: provider === 'cursor' ? jwtExpiry(managedCredential.token) : null, source: 'Usage Bar' };
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
  } else if (provider === 'gemini') {
    const auth = await readJson(env.GEMINI_CREDENTIALS_FILE || path.join(home, '.gemini', 'oauth_creds.json'));
    const token = validToken(auth?.access_token);
    const refreshToken = validToken(auth?.refresh_token);
    if (token || refreshToken) return { token, refreshToken, expiresAt: auth.expiry_date, projectId: env.GOOGLE_CLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT_ID || null, oauthClient: await loadGeminiClient({ env, home }), source: 'Gemini CLI' };
    return openCodeCredential(provider, env, home);
  } else if (provider === 'openrouter') {
    const token = validToken(env.OPENROUTER_API_KEY);
    if (token) return { token, source: 'OPENROUTER_API_KEY' };
    return openCodeCredential(provider, env, home);
  } else if (provider === 'cursor') {
    const token = validToken(env.CURSOR_ACCESS_TOKEN || env.CURSOR_TOKEN);
    if (token) return { token, expiresAt: jwtExpiry(token), source: 'Cursor-Umgebungsvariable' };
  } else if (provider === 'copilot') {
    const token = validToken(env.COPILOT_GITHUB_TOKEN || env.GH_TOKEN || env.GITHUB_TOKEN);
    if (token) return { token, source: 'GitHub-Umgebungsvariable' };
    const base = path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'github-copilot');
    for (const name of ['hosts.json', 'apps.json']) {
      const auth = await readJson(path.join(base, name));
      for (const [host, entry] of Object.entries(auth || {})) {
        if (host !== 'github.com' && !host.startsWith('github.com:')) continue;
        const saved = validToken(entry?.oauth_token);
        if (saved) return { token: saved, source: 'GitHub Copilot' };
      }
    }
    const fallback = await openCodeCredential(provider, env, home);
    if (fallback) return fallback;
    const cliToken = await githubTokenLoader();
    if (cliToken) return { token: cliToken, source: 'GitHub CLI' };
  }
  return null;
}

module.exports = { loadCredential, readCursorCredential, validToken };
