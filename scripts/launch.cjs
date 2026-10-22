const { spawn } = require('node:child_process');
const path = require('node:path');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.USAGE_BAR_SMOKE;
const child = spawn(require('electron'), [path.resolve(__dirname, '..'), ...process.argv.slice(2)], { env, stdio: 'inherit', windowsHide: true });
child.on('exit', (code) => { process.exitCode = code || 0; });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
