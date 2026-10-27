const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { npmGlobalRoots } = require('./platform.cjs');

// Read the installed CLI's public OAuth client configuration instead of bundling it.
// Source files are parsed as text and never executed.
async function loadGeminiClient({ env = process.env, home = os.homedir(), npmRoots = npmGlobalRoots({ env, home }) } = {}) {
  const clean = (value) => typeof value === 'string' && value.length <= 4096 && value.trim() && !/[\r\n]/.test(value) ? value.trim() : null;
  const clientId = clean(env.GEMINI_OAUTH_CLIENT_ID);
  const clientSecret = clean(env.GEMINI_OAUTH_CLIENT_SECRET);
  if (clientId && clientSecret) return { clientId, clientSecret };
  // An explicit but incomplete override must not be mixed with a different client's parameters.
  if (clientId || clientSecret) return null;
  const roots = new Set([
    env.GEMINI_CLI_DIR,
    ...npmRoots.map((root) => path.join(root, '@google', 'gemini-cli')),
    ...Object.entries(env).filter(([key]) => key.toLowerCase() === 'path').flatMap(([, value]) => value.split(path.delimiter)).filter(Boolean).flatMap((base) => [
      path.join(base, 'node_modules', '@google', 'gemini-cli'),
      path.resolve(base, '..', 'lib', 'node_modules', '@google', 'gemini-cli'),
    ]),
  ].filter(Boolean));
  for (const root of roots) {
    const files = [
      path.join(root, 'node_modules', '@google', 'gemini-cli-core', 'dist', 'src', 'code_assist', 'oauth2.js'),
      path.resolve(root, '..', 'gemini-cli-core', 'dist', 'src', 'code_assist', 'oauth2.js'),
      path.join(root, 'dist', 'src', 'code_assist', 'oauth2.js'),
    ];
    for (const file of files) {
      try {
        if ((await fs.stat(file)).size > 2 * 1024 * 1024) continue;
        const source = await fs.readFile(file, 'utf8');
        const read = (name) => clean(source.match(new RegExp(`\\b${name}\\s*=\\s*(['\"])([^'\"\\r\\n]+)\\1`))?.[2]);
        const id = read('OAUTH_CLIENT_ID');
        const secret = read('OAUTH_CLIENT_SECRET');
        if (id && secret) return { clientId: id, clientSecret: secret };
      } catch { /* Not an installed, readable Gemini CLI module. */ }
    }
  }
  return null;
}

module.exports = { loadGeminiClient };
