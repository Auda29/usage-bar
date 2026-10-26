const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {renewClaudeSignIn} = require('../src/claude-session.cjs');

async function fixture(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-bar-claude-session-test-'));
  t.after(() => {
    assert(path.resolve(home).startsWith(path.join(path.resolve(os.tmpdir()), 'usage-bar-claude-session-test-')));
    return fs.rm(home, {recursive: true, force: true});
  });
  const file = path.join(home, '.claude', '.credentials.json');
  await fs.mkdir(path.dirname(file), {recursive: true});
  const oauth = {accessToken: 'expired-token', refreshToken: 'shared-refresh', expiresAt: 1, scopes: ['user:inference', 'user:profile']};
  const write = data => fs.writeFile(file, JSON.stringify({claudeAiOauth: data}));
  await write(oauth);
  return {home, file, oauth, write};
}

test('official CLI renews an expired profile login using private child environment and the saved file is reread', async t => {
  const f = await fixture(t);
  const env = {CLAUDE_CODE_OAUTH_TOKEN: 'inference-token', ANTHROPIC_API_KEY: 'api-key', ANTHROPIC_AUTH_TOKEN: 'auth-token'};
  let calls = 0;
  const fresh = {...f.oauth, accessToken: 'fresh-token', refreshToken: 'new-refresh', expiresAt: 9999999999999};
  const result = await renewClaudeSignIn(f.file, {home: f.home, env, run: async (_file, args, options) => {
    calls++;
    if (args[0] === '--version') return {stdout: '2.1.310 (Claude Code)'};
    assert.deepEqual(args, ['auth', 'login', '--claudeai']);
    assert.equal(options.env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
    assert.equal(options.env.ANTHROPIC_API_KEY, undefined);
    assert.equal(options.env.ANTHROPIC_AUTH_TOKEN, undefined);
    assert.equal(options.env.CLAUDE_CODE_OAUTH_REFRESH_TOKEN, 'shared-refresh');
    assert.equal(options.env.CLAUDE_CODE_OAUTH_SCOPES, 'user:inference user:profile');
    assert.equal(options.env.CLAUDE_CONFIG_DIR, path.dirname(f.file));
    assert.equal(options.windowsHide, true);
    assert(options.timeout <= 30000);
    await f.write(fresh);
    throw new Error('CLI setup failed after saving credentials; do not expose diagnostics');
  }});
  assert.deepEqual(result, fresh);
  assert.equal(calls, 2);
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 'inference-token');
  assert.equal(env.CLAUDE_CODE_OAUTH_REFRESH_TOKEN, undefined);
});

test('fresh or non-refreshable logins do not start the CLI', async t => {
  const f = await fixture(t);
  const options = {home: f.home, env: {}, run: async () => assert.fail('Must not start CLI')};
  for (const oauth of [
    {...f.oauth, expiresAt: 9999999999999},
    {...f.oauth, scopes: ['user:inference']},
    {...f.oauth, refreshToken: null},
  ]) {
    await f.write(oauth);
    const before = await fs.readFile(f.file, 'utf8');
    assert.deepEqual(await renewClaudeSignIn(f.file, options), oauth);
    assert.equal(await fs.readFile(f.file, 'utf8'), before);
  }
});

test('concurrent refresh and setup reads share a single renewal', async t => {
  const f = await fixture(t);
  let renewals = 0;
  const options = {home: f.home, env: {}, run: async (_file, args) => {
    if (args[0] === '--version') return {stdout: '2.1.310 (Claude Code)'};
    renewals++;
    await f.write({...f.oauth, accessToken: 'fresh-token', expiresAt: 9999999999999});
    return {stdout: 'Login successful'};
  }};
  const results = await Promise.all(Array.from({length: 5}, () => renewClaudeSignIn(f.file, options)));
  assert.equal(renewals, 1);
  assert(results.every(result => result.accessToken === 'fresh-token'));
});

test('failed renewal is throttled, while changed credentials and an elapsed cooldown allow retry', async t => {
  const f = await fixture(t);
  let now = 100000;
  let renewals = 0;
  const options = {home: f.home, env: {}, now: () => now, run: async (_file, args) => {
    if (args[0] === '--version') return {stdout: '2.1.310 (Claude Code)'};
    renewals++;
    throw new Error('private CLI diagnostics');
  }};
  assert.equal((await renewClaudeSignIn(f.file, options)).accessToken, 'expired-token');
  await renewClaudeSignIn(f.file, options);
  assert.equal(renewals, 1);
  await f.write({...f.oauth, refreshToken: 'changed-refresh'});
  await renewClaudeSignIn(f.file, options);
  assert.equal(renewals, 2);
  now += 300001;
  await renewClaudeSignIn(f.file, options);
  assert.equal(renewals, 3);
});

test('unsupported or missing CLIs never fall back to interactive browser login', async t => {
  const f = await fixture(t);
  let calls = 0;
  const result = await renewClaudeSignIn(f.file, {home: f.home, env: {}, run: async (_file, args) => {
    calls++;
    assert.deepEqual(args, ['--version']);
    return {stdout: '2.1.309 (Claude Code)'};
  }});
  assert.equal(result.accessToken, 'expired-token');
  assert.equal(calls, 2);
});
