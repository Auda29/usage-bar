const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { loadCredential } = require('../src/credentials.cjs');

async function fixture(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-bar-opencode-test-'));
  t.after(() => {
    assert(path.resolve(home).startsWith(path.join(path.resolve(os.tmpdir()), 'usage-bar-opencode-test-')));
    return fs.rm(home, { recursive: true, force: true });
  });
  const base = path.join(home, '.local', 'share', 'opencode');
  await fs.mkdir(base, { recursive: true });
  const file = path.join(base, 'opencode.db');
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE credential (id TEXT PRIMARY KEY, integration_id TEXT, active INTEGER, value TEXT, time_updated INTEGER)');
  const add = (id, integration, active, value, updated = 1) => db.prepare('INSERT INTO credential VALUES (?, ?, ?, ?, ?)').run(id, integration, active, JSON.stringify(value), updated);
  return {home, env: {}, base, file, db, add};
}

test('startup reads the selected OpenCode 2 login instead of legacy or inactive credentials without modifying the database', async t => {
  const f = await fixture(t);
  f.add('inactive', 'anthropic', 0, {type: 'oauth', access: 'inactive-login', expires: 9999999999999}, 3);
  f.add('active', 'anthropic', 1, {type: 'oauth', access: 'selected-login', expires: 9999999999999}, 2);
  f.add('other-provider', 'openai', 1, {type: 'oauth', access: 'other-token', expires: 9999999999999});
  f.db.close();
  await fs.writeFile(path.join(f.base, 'auth.json'), JSON.stringify({anthropic: {access: 'legacy-other-account'}}));
  const before = await fs.readFile(f.file);
  const first = await loadCredential('claude', f);
  assert.equal(first.source, 'OpenCode');
  assert.equal(first.token, 'selected-login');
  assert.deepEqual(await fs.readFile(f.file), before);
  const writer = new DatabaseSync(f.file);
  writer.prepare('UPDATE credential SET value = ? WHERE id = ?').run(JSON.stringify({type: 'oauth', access: 'rotated-login', expires: 9999999999999}), 'active');
  writer.close();
  assert.equal((await loadCredential('claude', f)).token, 'rotated-login', 'Every refresh must reread the active login');
});

test('OpenCode 2 does not resurrect an inactive legacy login or use a Claude Code plugin placeholder for usage', async t => {
  const f = await fixture(t);
  f.add('inactive', 'anthropic', 0, {type: 'oauth', access: 'signed-out-login'});
  f.add('plugin', 'claude-code', 1, {type: 'oauth', access: 'plugin-placeholder', expires: 0});
  f.db.close();
  await fs.writeFile(path.join(f.base, 'auth.json'), JSON.stringify({anthropic: {access: 'signed-out-login'}}));
  assert.equal(await loadCredential('claude', f), null);
});

test('a cleared Claude Code login can fall back to the OpenCode 2 OAuth login', async t => {
  const f = await fixture(t);
  f.add('active', 'anthropic', 1, {type: 'oauth', access: 'selected-login', expires: 9999999999999});
  f.db.close();
  const directory = path.join(f.home, '.claude');
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, '.credentials.json'), JSON.stringify({claudeAiOauth: {accessToken: '', refreshToken: '', expiresAt: 0, scopes: ['user:profile']}}));
  assert.equal((await loadCredential('claude', f)).token, 'selected-login');
});

test('OpenCode 2 preserves Codex account metadata and regular OpenRouter API keys', async t => {
  const f = await fixture(t);
  f.add('codex', 'openai', 1, {type: 'oauth', access: 'codex-login', expires: 9999999999999, metadata: {accountID: 'selected-account'}});
  f.add('router', 'openrouter', 1, {type: 'key', key: 'openrouter-key'});
  f.add('api-only', 'anthropic', 1, {type: 'key', key: 'not-a-subscription-login'});
  f.db.close();
  const codex = await loadCredential('codex', f);
  assert.equal(codex.token, 'codex-login');
  assert.equal(codex.accountId, 'selected-account');
  assert.equal((await loadCredential('openrouter', f)).token, 'openrouter-key');
  assert.equal(await loadCredential('claude', f), null);
});
