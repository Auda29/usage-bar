const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
const childEnv = { ...process.env, USAGE_BAR_SMOKE: '1', USAGE_BAR_ARTIFACT_DIR: path.join(root, 'artifacts') };
delete childEnv.ELECTRON_RUN_AS_NODE;
const packaged = process.argv.includes('--packaged');
const executable = packaged ? path.join(root, 'dist', 'Usage Bar-win32-x64', 'Usage Bar.exe') : require('electron');
const child = spawn(executable, packaged ? ['--show'] : [root, '--show'], {
  cwd: root, windowsHide: true,
  env: childEnv, stdio: 'inherit',
});
const timeout = setTimeout(() => { child.kill(); console.error('Smoke test timed out'); process.exitCode = 1; }, 30000);
child.on('exit', (code) => { clearTimeout(timeout); process.exitCode = code || 0; });
child.on('error', (error) => { clearTimeout(timeout); console.error(error.message); process.exitCode = 1; });
