const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validGitHubLogin, listGitHubAccounts, githubAccountToken, githubAccountLogin } = require('../src/github-accounts.cjs');

test('enterprise managed account names with underscore are supported', () => {
  assert.equal(validGitHubLogin('NiklasW_Beckhoff'), true);
  assert.equal(validGitHubLogin('a'.repeat(40)), false);
  assert.equal(validGitHubLogin('account\nother'), false);
});

test('account listing exposes only safe metadata and preserves unavailable accounts', async () => {
  const accounts = await listGitHubAccounts({ run: async (_file, args) => {
    assert.deepEqual(args, ['auth', 'status', '--hostname', 'github.com', '--json', 'hosts']);
    return { stdout: JSON.stringify({ hosts: { 'github.com': [
      { login: 'personal', active: true, state: 'success', token: 'never-expose' },
      { login: 'work', active: false, state: 'failed', message: 'private diagnostics' },
      { login: 'PERSONAL', state: 'success' },
      { login: '--invalid', state: 'success' },
    ], 'other.example': [{ login: 'enterprise' }] } }) };
  } });
  assert.deepEqual(accounts, [
    { login: 'personal', active: true, available: true },
    { login: 'work', active: false, available: false },
  ]);
  assert.equal(JSON.stringify(accounts).includes('never-expose'), false);
});

test('explicit account lookup bypasses environment tokens without switching the CLI account', async () => {
  const env = { GH_TOKEN: 'wrong', GITHUB_TOKEN: 'wrong', GH_HOST: 'other.example', GH_CONFIG_DIR: 'custom-config', PATH: 'path' };
  const token = await githubAccountToken('work', { env, run: async (_file, args, options) => {
    assert.deepEqual(args, ['auth', 'token', '--hostname', 'github.com', '--user', 'work']);
    assert.equal(options.env.GH_TOKEN, undefined);
    assert.equal(options.env.GITHUB_TOKEN, undefined);
    assert.equal(options.env.GH_HOST, undefined);
    assert.equal(options.env.GH_CONFIG_DIR, 'custom-config');
    assert.equal(options.env.GH_PROMPT_DISABLED, '1');
    assert.equal(options.windowsHide, true);
    return { stdout: 'work-token\n' };
  } });
  assert.equal(token, 'work-token');
  assert.equal(env.GH_TOKEN, 'wrong');
});

test('missing CLI, malformed responses and invalid names fail without exposing diagnostics', async () => {
  const unavailable = { run: async () => { throw new Error('sensitive CLI diagnostics'); } };
  assert.deepEqual(await listGitHubAccounts(unavailable), []);
  assert.deepEqual(await listGitHubAccounts({ run: async () => ({ stdout: 'invalid json' }) }), []);
  assert.equal(await githubAccountToken('work', unavailable), null);
  assert.equal(await githubAccountToken('--user=other', { run: async () => { assert.fail('Must not run'); } }), null);
});

test('identity lookup returns a login only and never follows redirects with credentials', async () => {
  const result = await githubAccountLogin({ token: 'private' }, { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.github.com/user');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer private');
    return Response.json({ login: 'work', email: 'private@example.com', id: 123 });
  } });
  assert.equal(result, 'work');
  assert.equal(await githubAccountLogin({ token: 'expired' }, { fetchImpl: async () => new Response(null, { status: 401 }) }), null);
  assert.equal(await githubAccountLogin({ login: 'work' }, { fetchImpl: async () => { assert.fail('Known identity needs no request'); } }), 'work');
});
