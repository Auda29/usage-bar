const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadCredential, readCursorCredential } = require('../src/credentials.cjs');

async function fixture(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-bar-credentials-test-'));
  // Only this test-created temporary directory is removed.
  t.after(() => {
    assert(path.resolve(home).startsWith(path.join(path.resolve(os.tmpdir()), 'usage-bar-credentials-test-')));
    return fs.rm(home, { recursive: true, force: true });
  });
  return { home, env: {} };
}
async function write(file, value) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value)); }

test('reads only Claude OAuth data from the credentials file', async (t) => {
  const options = await fixture(t);
  await write(path.join(options.home, '.claude', '.credentials.json'), { mcpOAuth: { token: 'not-claude' }, claudeAiOauth: { accessToken: 'claude-token', expiresAt: 9999999999999 } });
  const result = await loadCredential('claude', options);
  assert.equal(result.token, 'claude-token');
  assert.equal(result.source, 'Claude Code');
});

test('Claude environment token remains available when the stored sign-in is expired or has unknown scope', async (t) => {
  const options = await fixture(t);
  options.env.CLAUDE_CODE_OAUTH_TOKEN = 'explicit-oauth-token';
  const file = path.join(options.home, '.claude', '.credentials.json');
  await write(file, { claudeAiOauth: { accessToken: 'expired-file-token', refreshToken: 'shared-refresh', expiresAt: 1 } });
  await write(path.join(options.home, '.local', 'share', 'opencode', 'auth.json'), { anthropic: { access: 'other-account-token' } });
  const before = await fs.readFile(file, 'utf8');
  assert.deepEqual(await loadCredential('claude', options), { token: 'explicit-oauth-token', expiresAt: null, source: 'Claude Code OAuth', requiresProfileCheck: true });
  await write(file, { claudeAiOauth: { accessToken: 'valid-file-token', expiresAt: 9999999999999 } });
  assert.equal((await loadCredential('claude', options)).token, 'explicit-oauth-token');
  await fs.writeFile(file, before);
  options.env.CLAUDE_CODE_OAUTH_TOKEN = 'invalid\nheader';
  assert.equal((await loadCredential('claude', options)).token, 'expired-file-token');
  assert.equal(await fs.readFile(file, 'utf8'), before);
});

test('fresh Claude profile login is preferred over an inference environment token without altering credentials', async (t) => {
  const options = await fixture(t);
  options.env.CLAUDE_CODE_OAUTH_TOKEN = 'inference-only-token';
  const file = path.join(options.home, '.claude', '.credentials.json');
  for (const scope of ['user:profile', 'user:office']) {
    await write(file, { claudeAiOauth: { accessToken: 'usage-enabled-token', expiresAt: 9999999999999, scopes: ['user:inference', scope] } });
    const before = await fs.readFile(file, 'utf8');
    const credential = await loadCredential('claude', options);
    assert.equal(credential.token, 'usage-enabled-token');
    assert.equal(credential.source, 'Claude Code');
    assert.equal(credential.requiresProfileCheck, undefined);
    assert.equal(await fs.readFile(file, 'utf8'), before);
  }
  await write(file, { claudeAiOauth: { accessToken: 'expired-usage-token', expiresAt: 1, scopes: ['user:profile'] } });
  assert.equal((await loadCredential('claude', options)).token, 'inference-only-token');
  await write(file, { claudeAiOauth: { accessToken: 'inference-file-token', expiresAt: 9999999999999, scopes: ['user:inference'] } });
  assert.equal((await loadCredential('claude', options)).token, 'inference-only-token');
});

test('expiring profile login is renewed through the owning CLI before considering an inference environment token', async t => {
  const options = await fixture(t);
  options.env.CLAUDE_CODE_OAUTH_TOKEN = 'inference-only-token';
  const file = path.join(options.home, '.claude', '.credentials.json');
  await write(file, {claudeAiOauth: {accessToken: 'old-token', refreshToken: 'refresh', expiresAt: 1, scopes: ['user:profile']}});
  let renewals = 0;
  const result = await loadCredential('claude', {...options, claudeSessionRenewer: async (requestedFile, config) => {
    renewals++;
    assert.equal(requestedFile, file);
    assert.equal(config.home, options.home);
    return {accessToken: 'renewed-profile-token', expiresAt: 9999999999999, scopes: ['user:profile']};
  }});
  assert.equal(renewals, 1);
  assert.equal(result.token, 'renewed-profile-token');
  assert.equal(result.source, 'Claude Code');
});
test('Codex token with account ID is read without altering the file', async (t) => {
  const options = await fixture(t);
  const file = path.join(options.home, '.codex', 'auth.json');
  await write(file, { tokens: { access_token: 'codex-token', account_id: 'account' } });
  const before = await fs.readFile(file, 'utf8');
  assert.equal((await loadCredential('codex', options)).accountId, 'account');
  assert.equal(await fs.readFile(file, 'utf8'), before);
});
test('explicit config directories and OpenCode fallback are supported', async (t) => {
  const options = await fixture(t);
  options.env.CLAUDE_CONFIG_DIR = path.join(options.home, 'custom-claude');
  await write(path.join(options.env.CLAUDE_CONFIG_DIR, '.credentials.json'), { claudeAiOauth: { accessToken: 'custom-token' } });
  assert.equal((await loadCredential('claude', options)).token, 'custom-token');
  await write(path.join(options.home, '.local', 'share', 'opencode', 'auth.json'), { openai: { access: 'opencode-token', accountId: 'account' } });
  assert.equal((await loadCredential('codex', options)).source, 'OpenCode');
});
test('API keys and malformed credential files do not masquerade as subscription logins', async (t) => {
  const options = await fixture(t);
  await write(path.join(options.home, '.codex', 'auth.json'), { OPENAI_API_KEY: 'api-key' });
  assert.equal(await loadCredential('codex', options), null);
  await fs.writeFile(path.join(options.home, '.codex', 'auth.json'), 'invalid-json');
  assert.equal(await loadCredential('codex', options), null);
});

test('Gemini reads only the existing OAuth login and project hint', async (t) => {
  const options = await fixture(t);
  options.env.GOOGLE_CLOUD_PROJECT = 'example-project';
  await write(path.join(options.home, '.gemini', 'oauth_creds.json'), { access_token: 'gemini-token', refresh_token: 'gemini-refresh', expiry_date: 9999999999999 });
  const credential = await loadCredential('gemini', options);
  assert.equal(credential.token, 'gemini-token');
  assert.equal(credential.refreshToken, 'gemini-refresh');
  assert.equal(credential.projectId, 'example-project');
});
test('OpenRouter accepts its key without using another provider credential', async (t) => {
  const options = await fixture(t);
  options.env.OPENROUTER_API_KEY = 'router-key';
  assert.equal((await loadCredential('openrouter', options)).token, 'router-key');
  options.env = {};
  await write(path.join(options.home, '.local', 'share', 'opencode', 'auth.json'), { openrouter: { type: 'api', key: 'stored-key' }, openai: { access: 'not-router' } });
  assert.equal((await loadCredential('openrouter', options)).token, 'stored-key');
});
test('Copilot accepts github.com login only and can fall back to GitHub CLI', async (t) => {
  const options = await fixture(t);
  await write(path.join(options.home, '.config', 'github-copilot', 'hosts.json'), { 'other.example': { oauth_token: 'wrong-host' } });
  assert.equal((await loadCredential('copilot', { ...options, githubTokenLoader: async () => 'cli-token' })).token, 'cli-token');
  await write(path.join(options.home, '.config', 'github-copilot', 'hosts.json'), { 'github.com': { oauth_token: 'copilot-token' } });
  assert.equal((await loadCredential('copilot', { ...options, githubTokenLoader: async () => null })).token, 'copilot-token');
});
test('Cursor desktop credentials are read only after explicit import and the database is unchanged', async (t) => {
  const options = await fixture(t);
  options.env.APPDATA = path.join(options.home, 'roaming');
  const file = path.join(options.env.APPDATA, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const { DatabaseSync } = require('node:sqlite');
  const database = new DatabaseSync(file);
  database.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)');
  database.prepare('INSERT INTO ItemTable VALUES (?, ?)').run('cursorAuth/accessToken', 'cursor-token');
  database.close();
  const before = await fs.readFile(file);
  assert.equal(await loadCredential('cursor', options), null);
  assert.equal((await readCursorCredential(options)).token, 'cursor-token');
  assert.equal((await loadCredential('cursor', { ...options, managedCredential: { mode: 'local-cursor' } })).source, 'Cursor Desktop');
  assert.deepEqual(await fs.readFile(file), before);
});

test('selected Copilot CLI account overrides automatic credentials and is read again on refresh', async (t) => {
  const options = await fixture(t);
  options.env.GH_TOKEN = 'wrong-environment-account';
  await write(path.join(options.home, '.config', 'github-copilot', 'hosts.json'), { 'github.com': { oauth_token: 'wrong-local-account' } });
  let calls = 0;
  const selected = { ...options, managedCredential: { mode: 'github-cli', login: 'work' }, githubAccountTokenLoader: async (login, config) => {
    assert.equal(login, 'work');
    assert.equal(config.env, options.env);
    return `work-token-${++calls}`;
  } };
  assert.deepEqual(await loadCredential('copilot', selected), { token: 'work-token-1', login: 'work', source: 'GitHub CLI' });
  assert.equal((await loadCredential('copilot', selected)).token, 'work-token-2');
  assert.equal((await loadCredential('copilot', options)).token, 'wrong-environment-account');
});

test('missing selected account fails explicitly without falling back to another account', async (t) => {
  const options = await fixture(t);
  options.env.GH_TOKEN = 'wrong-account';
  await assert.rejects(() => loadCredential('copilot', {
    ...options, managedCredential: { mode: 'github-cli', login: 'work' }, githubAccountTokenLoader: async () => null,
    githubTokenLoader: async () => { assert.fail('Must not fall back'); },
  }), /work nicht verfügbar/);
  await assert.rejects(() => loadCredential('copilot', { ...options, managedCredential: { mode: 'github-cli', login: '--invalid' } }), /Ungültiges GitHub-Konto/);
});
