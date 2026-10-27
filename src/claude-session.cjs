const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
const { executable } = require('./platform.cjs');
const pending = new Map();
const failures = new Map();
const signIns = new Map();
const CLAUDE_SIGN_IN_REQUIRED = 'Claude-Code-Anmeldung abgelaufen oder ungültig. Mit „claude auth login --claudeai“ erneut anmelden.';
class ClaudeSignInError extends Error {}

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
    !(typeof oauth.refreshTokenExpiresAt === 'number' && oauth.refreshTokenExpiresAt <= now) &&
    typeof oauth.refreshToken === 'string' && oauth.refreshToken.length > 0 && oauth.refreshToken.length <= 16384 && !/[\r\n]/.test(oauth.refreshToken);
}

function cliCandidates(home) {
  return [...new Set([
    executable('claude'),
    path.join(home, '.local', 'bin', executable('claude')),
  ])];
}

function loginEnvironment(env, directory) {
  const child = { ...env };
  if (env.CLAUDE_CONFIG_DIR) child.CLAUDE_CONFIG_DIR = directory;
  for (const name of ['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', 'CLAUDE_CODE_OAUTH_SCOPES', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']) delete child[name];
  return child;
}

async function signInClaude({ env = process.env, home = os.homedir(), run = execFileAsync, now = Date.now } = {}) {
  const directory = path.resolve(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'));
  const file = path.join(directory, '.credentials.json');
  if (signIns.has(file)) return signIns.get(file);
  const task = (async () => {
    // Do not run a browser login and a background renewal against the same file.
    try { await pending.get(file); } catch { /* An explicit login can recover a failed background renewal. */ }
    const childEnv = loginEnvironment(env, directory);
    let executable;
    for (const candidate of cliCandidates(home)) {
      try {
        const { stdout } = await run(candidate, ['--version'], { env: childEnv, windowsHide: true, timeout: 5000, maxBuffer: 4096 });
        if (/^\d+\.\d+\.\d+\b/.test(stdout.trim())) { executable = candidate; break; }
      } catch { /* Try the native installation when Explorer has an older PATH. */ }
    }
    if (!executable) throw new ClaudeSignInError('Claude Code nicht gefunden. Claude Code installieren und die Anmeldung erneut starten.');
    try {
      // Only an explicit click starts this browser login. Never expose CLI output.
      await run(executable, ['auth', 'login', '--claudeai'], { env: childEnv, cwd: home, windowsHide: true, timeout: 300000, maxBuffer: 65536 });
    } catch { /* The CLI can save the login before a later setup step fails. */ }
    const oauth = await readSignIn(file);
    if (!hasClaudeProfileScope(oauth) || !oauth?.accessToken || !(oauth.expiresAt > now())) {
      throw new ClaudeSignInError('Claude-Anmeldung fehlgeschlagen oder abgebrochen. Erneut anmelden und im Browser bestätigen.');
    }
    failures.delete(file);
    return oauth;
  })().finally(() => signIns.delete(file));
  signIns.set(file, task);
  return task;
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
  if (signIns.has(key)) return signIns.get(key);
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    // Another Claude process may have renewed the sign-in since the caller read it.
    const oauth = await readSignIn(key);
    if (!needsRenewal(oauth, now())) return oauth;
    const fingerprint = createHash('sha256').update(oauth.refreshToken).digest('hex');
    const failed = failures.get(key);
    if (failed?.fingerprint === fingerprint && failed.retryAt > now()) return oauth;
    let executable;
    for (const candidate of cliCandidates(home)) {
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

module.exports = { renewClaudeSignIn, signInClaude, ClaudeSignInError, hasClaudeProfileScope, CLAUDE_SIGN_IN_REQUIRED };
