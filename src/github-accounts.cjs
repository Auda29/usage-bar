const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

function validGitHubLogin(value) {
  // Enterprise Managed Users include an underscore before the enterprise shortcode.
  return typeof value === 'string' && /^[a-z\d](?:[a-z\d_-]{0,37}[a-z\d])?$/i.test(value);
}

async function runGitHub(args, { env = process.env, run = execFileAsync } = {}) {
  const cliEnv = { ...env, GH_PROMPT_DISABLED: '1' };
  // Explicit account selection must use the CLI's stored account, not an environment token.
  delete cliEnv.GH_TOKEN;
  delete cliEnv.GITHUB_TOKEN;
  delete cliEnv.GH_HOST;
  return run(process.platform === 'win32' ? 'gh.exe' : 'gh', args, {
    env: cliEnv, windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024,
  });
}

async function listGitHubAccounts(options) {
  try {
    const { stdout } = await runGitHub(['auth', 'status', '--hostname', 'github.com', '--json', 'hosts'], options);
    const accounts = JSON.parse(stdout)?.hosts?.['github.com'];
    if (!Array.isArray(accounts)) return [];
    const seen = new Set();
    return accounts.filter((account) => {
      if (!validGitHubLogin(account.login) || seen.has(account.login.toLowerCase())) return false;
      seen.add(account.login.toLowerCase());
      return true;
    }).map(({ login, active, state }) => ({ login, active: active === true, available: state === 'success' }));
  } catch { return []; }
}

async function githubAccountToken(login, options) {
  if (!validGitHubLogin(login)) return null;
  try {
    const { stdout } = await runGitHub(['auth', 'token', '--hostname', 'github.com', '--user', login], options);
    const token = stdout.trim();
    return token && token.length <= 16384 && !/[\r\n]/.test(token) ? token : null;
  } catch { return null; }
}

async function githubAccountLogin(credential, { fetchImpl = fetch } = {}) {
  if (validGitHubLogin(credential?.login)) return credential.login;
  if (!credential?.token) return null;
  try {
    const response = await fetchImpl('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${credential.token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'usage-bar' },
      redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const { login } = await response.json();
    return validGitHubLogin(login) ? login : null;
  } catch { return null; }
}

module.exports = { validGitHubLogin, listGitHubAccounts, githubAccountToken, githubAccountLogin };
