const fs = require('node:fs/promises');
const path = require('node:path');
const { validToken } = require('./credentials.cjs');
const { validGitHubLogin } = require('./github-accounts.cjs');
const MANAGED_PROVIDERS = ['copilot', 'cursor', 'openrouter'];

class CredentialVault {
  constructor(directory, encryption) { this.directory = directory; this.encryption = encryption; }
  file(id) {
    if (!MANAGED_PROVIDERS.includes(id)) throw new Error('Für diesen Provider werden keine Tokens gespeichert.');
    return path.join(this.directory, `${id}.bin`);
  }
  async read(id) {
    if (!MANAGED_PROVIDERS.includes(id)) return null;
    try {
      const file = this.file(id);
      if ((await fs.stat(file)).size > 65536) return null;
      const decrypted = await this.encryption.decryptStringAsync(await fs.readFile(file));
      return JSON.parse(decrypted.result);
    } catch { return null; }
  }
  async save(id, credential) {
    const file = this.file(id);
    if (!this.encryption.isEncryptionAvailable()) throw new Error('Windows-Verschlüsselung ist nicht verfügbar. Es wurde nichts gespeichert.');
    const record = id === 'copilot' && credential?.mode === 'github-cli'
      ? { mode: 'github-cli', login: validGitHubLogin(credential.login) ? credential.login : null }
      : id === 'cursor' && credential?.mode === 'local-cursor'
      ? { mode: 'local-cursor' }
      : { token: validToken(credential?.token) };
    if (!record.mode && !record.token) throw new Error('Bitte einen gültigen Token ohne Zeilenumbrüche eingeben.');
    if (record.mode === 'github-cli' && !record.login) throw new Error('Bitte ein gültiges GitHub-Konto auswählen.');
    await fs.mkdir(this.directory, { recursive: true });
    const temporary = `${file}.tmp`;
    await fs.writeFile(temporary, await this.encryption.encryptStringAsync(JSON.stringify(record)), { mode: 0o600 });
    await fs.rename(temporary, file);
  }
  async remove(id) { await fs.rm(this.file(id), { force: true }); }
}
module.exports = { CredentialVault };
