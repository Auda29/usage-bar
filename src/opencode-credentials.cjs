const fs = require('node:fs/promises');
const path = require('node:path');

// OpenCode 2 moved auth.json into the credential table. Read only the selected
// provider entry, never conversations or credentials belonging to other providers.
async function readOpenCodeEntry(base, aliases) {
  const file = path.join(base, 'opencode.db');
  try { await fs.access(file); } catch { return { available: false, entry: null }; }
  let database;
  try {
    const { DatabaseSync } = require('node:sqlite');
    database = new DatabaseSync(file, { readOnly: true });
    if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'credential'").get()) return { available: false, entry: null };
    const statement = database.prepare('SELECT value FROM credential WHERE integration_id = ? AND active = 1 AND length(value) <= 1048576 ORDER BY time_updated DESC LIMIT 1');
    for (const alias of aliases) {
      const row = statement.get(alias);
      if (!row) continue;
      try {
        const entry = JSON.parse(row.value);
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) return { available: true, entry };
      } catch { /* Ignore a malformed record without printing credential data. */ }
    }
    return { available: true, entry: null };
  } catch {
    throw new Error('OpenCode-Anmeldung konnte nicht gelesen werden. OpenCode oder OpenChamber prüfen und erneut aktualisieren.');
  } finally { database?.close(); }
}

module.exports = { readOpenCodeEntry };
