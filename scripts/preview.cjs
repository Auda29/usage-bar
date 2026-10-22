const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { demoProviders } = require('../src/demo.cjs');
const { PROVIDERS, PROVIDER_IDS } = require('../src/catalog.cjs');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4317);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') { res.writeHead(302, { Location: '/src/renderer/index.html' }); res.end(); return; }
  if (url.pathname === '/preview-data.js') {
    const data = { providers: demoProviders(), catalog: PROVIDERS, loading: false, demo: true, settings: { expanded: true, displayMode: 'usage', providers: PROVIDER_IDS, headlineProvider: 'claude' } };
    const setup = { catalog: PROVIDERS, settings: data.settings, demo: true, selectedCopilotAccount: 'automatic', copilotAccounts: [
      { login: 'usagebar-personal', active: true, available: true },
      { login: 'usagebar-work', active: false, available: true },
    ], credentials: Object.fromEntries(PROVIDER_IDS.map((id) => [id, { available: true, source: 'Beispieldaten', stored: false }])) };
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    res.end(`window.usageBarPreview = ${JSON.stringify(data)}; window.usageBarSetupPreview = ${JSON.stringify(setup)};`); return;
  }
  const requested = url.pathname;
  // The preview only serves UI assets. Credentials and backend source are never served.
  if (!(requested.startsWith('/src/renderer/') || requested.startsWith('/assets/'))) { res.writeHead(404); res.end(); return; }
  const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(`${root}${path.sep}`)) { res.writeHead(403); res.end(); return; }
  try {
    let data = fs.readFileSync(file);
    if (file.endsWith('.html')) data = data.toString('utf8').replace(/<script src="(renderer|setup)\.js"/, '<script src="/preview-data.js"></script><script src="$1.js"');
    res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(port, '127.0.0.1', () => console.log(`Demo preview: http://127.0.0.1:${port}`));
