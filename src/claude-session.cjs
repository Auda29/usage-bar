const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
const pending = new Map();
const failures = new Map();

function hasClaudeProfileScope(oauth) {
  return Array.isArray(oauth?.scopes) && oauth.scopes.some(scope => scope === 'user:profile' || scope === 'user:office');
}

async function readSignIn(file) {
  try {
    if ((await fs.stat(file)).size > 1024 * 1024) return null;
    return JSON.parse(await fs.readFile(file, 'utf8')).claudeAiOauth || null;
  } catch { return null; }
}

function needsRenewal(oauth, now) {
  return hasClaudeProfileScope(oauth) && typeof oauth?.expiresAt === 'number' && oauth.expiresAt <= now + 60000 &&
    typeof oauth.refreshToken === 'string' && oauth.refreshToken.length > 0 && oauth.refreshToken.length <= 16384 && !/[\r\n]/.test(oauth.refreshToken);
}

function supportsRefresh(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)\b/.exec(version.trim());
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  // The noninteractive refresh environment is verified with this native CLI version.
  return major > 2 || major === 2 && (minor > 1 || minor === 1 && patch >= 310);
}

async function renewClaudeSignIn(file, { env = process.env, home = os.homedir(), now = Date.now, run = execFileAsync } = {}) {
  const key = path.resolve(file);
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    // Another Claude process may have renewed the sign-in since the caller read it.
    const oauth = await readSignIn(key);
    if (!needsRenewal(oauth, now())) return oauth;
    const fingerprint = createHash('sha256').update(oauth.refreshToken).digest('hex');
    const failed = failures.get(key);
    if (failed?.fingerprint === fingerprint && failed.retryAt > now()) return oauth;
    const candidates = [...new Set([
      process.platform === 'win32' ? 'claude.exe' : 'claude',
      path.join(home, '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude'),
    ])];
    let executable;
    for (const candidate of candidates) {
      try {
        const { stdout } = await run(candidate, ['--version'], { env, windowsHide: true, timeout: 5000, maxBuffer: 4096 });
        if (supportsRefresh(stdout)) { executable = candidate; break; }
      } catch { /* Try the native installation if it is not on PATH. */ }
    }
    if (executable) {
      const cliEnv = { ...env, CLAUDE_CONFIG_DIR: path.dirname(key), CLAUDE_CODE_OAUTH_REFRESH_TOKEN: oauth.refreshToken, CLAUDE_CODE_OAUTH_SCOPES: oauth.scopes.join(' ') };
      delete cliEnv.CLAUDE_CODE_OAUTH_TOKEN;
      delete cliEnv.ANTHROPIC_API_KEY;
      delete cliEnv.ANTHROPIC_AUTH_TOKEN;
      try {
        // The owning CLI performs and persists renewal. Never log its output or credentials.
        await run(executable, ['auth', 'login', '--claudeai'], { env: cliEnv, cwd: path.dirname(key), windowsHide: true, timeout: 30000, maxBuffer: 65536 });
      } catch { /* A CLI can save fresh credentials before a later setup step fails. Reread below. */ }
    }
    const renewed = await readSignIn(key);
    if (hasClaudeProfileScope(renewed) && renewed?.accessToken && renewed.expiresAt > now() + 60000) failures.delete(key);
    else failures.set(key, { fingerprint, retryAt: now() + 300000 });
    return renewed || oauth;
  })().finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}

module.exports = { renewClaudeSignIn, hasClaudeProfileScope };
