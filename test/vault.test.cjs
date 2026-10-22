const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { CredentialVault } = require('../src/vault.cjs');

test('managed tokens are encrypted, scoped to a provider, removable, and reject invalid input', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-bar-vault-test-'));
  t.after(() => { assert(directory.startsWith(path.join(os.tmpdir(), 'usage-bar-vault-test-'))); return fs.rm(directory, { recursive: true, force: true }); });
  const key = crypto.randomBytes(32);
  const encryption = {
    isEncryptionAvailable: () => true,
    encryptStringAsync: async (value) => { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const encrypted = Buffer.concat([cipher.update(value), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), encrypted]); },
    decryptStringAsync: async (value) => { const cipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); cipher.setAuthTag(value.subarray(12, 28)); return { result: Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString('utf8'), shouldReEncrypt: false }; },
  };
  const vault = new CredentialVault(directory, encryption);
  await vault.save('openrouter', { token: 'private-example-token' });
  assert(!(await fs.readFile(path.join(directory, 'openrouter.bin'))).includes('private-example-token'));
  assert.equal((await vault.read('openrouter')).token, 'private-example-token');
  assert.equal(await vault.read('copilot'), null);
  await vault.save('copilot', { mode: 'github-cli', login: 'work', token: 'must-not-copy-cli-token' });
  assert.deepEqual(await vault.read('copilot'), { mode: 'github-cli', login: 'work' });
  await assert.rejects(() => vault.save('copilot', { mode: 'github-cli', login: '--invalid' }));
  assert.deepEqual(await vault.read('copilot'), { mode: 'github-cli', login: 'work' });
  await vault.save('copilot', { token: 'manual-token' });
  assert.deepEqual(await vault.read('copilot'), { token: 'manual-token' });
  await vault.remove('copilot');
  assert.equal(await vault.read('copilot'), null);
  await assert.rejects(() => vault.save('../outside', { token: 'invalid-provider' }));
  await assert.rejects(() => vault.save('copilot', { token: 'bad\nheader' }));
  await vault.remove('openrouter');
  assert.equal(await vault.read('openrouter'), null);
  const unavailable = new CredentialVault(directory, { isEncryptionAvailable: () => false });
  await assert.rejects(() => unavailable.save('openrouter', { token: 'example' }), /Verschlüsselung/);
});
