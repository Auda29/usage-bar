const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { loadGeminiClient } = require('../src/gemini-client.cjs');

test('Gemini public client parameters are read from installed CLI source without executing it', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-bar-gemini-client-test-'));
  t.after(() => {
    assert(path.resolve(home).startsWith(path.join(path.resolve(os.tmpdir()), 'usage-bar-gemini-client-test-')));
    return fs.rm(home, { recursive: true, force: true });
  });
  const root = path.join(home, 'cli');
  const file = path.join(root, 'node_modules', '@google', 'gemini-cli-core', 'dist', 'src', 'code_assist', 'oauth2.js');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const source = `throw new Error('Must not execute');\nconst OAUTH_CLIENT_ID = 'example-client';\nconst OAUTH_CLIENT_SECRET = 'example-public-parameter';\n`;
  await fs.writeFile(file, source);
  // No system npm folders: a globally installed Gemini CLI must not leak into the test.
  const options = { home, env: { GEMINI_CLI_DIR: root }, npmRoots: [] };
  assert.deepEqual(await loadGeminiClient(options), { clientId: 'example-client', clientSecret: 'example-public-parameter' });
  assert.equal(await fs.readFile(file, 'utf8'), source);
  await fs.writeFile(file, 'Unexpected CLI format');
  assert.equal(await loadGeminiClient(options), null);
});

test('explicit Gemini client parameters must be a complete pair', async () => {
  assert.deepEqual(await loadGeminiClient({ env: { GEMINI_OAUTH_CLIENT_ID: 'custom-client', GEMINI_OAUTH_CLIENT_SECRET: 'custom-parameter' } }), { clientId: 'custom-client', clientSecret: 'custom-parameter' });
  assert.equal(await loadGeminiClient({ env: { GEMINI_OAUTH_CLIENT_ID: 'custom-client' } }), null);
});
