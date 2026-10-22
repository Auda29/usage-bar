const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadCredential } = require('../src/credentials.cjs');

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
