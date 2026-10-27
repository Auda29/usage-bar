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
// The design tour adds a few seconds per design; CI runners are slower than a desktop.
const timeout = setTimeout(() => { child.kill(); console.error('Smoke test timed out'); process.exitCode = 1; }, 90000);
// A timeout or a signal is a failure; never let the exit event overwrite an earlier one.
child.on('exit', (code, signal) => { clearTimeout(timeout); if (!process.exitCode) process.exitCode = signal ? 1 : (code ?? 1); });
child.on('error', (error) => { clearTimeout(timeout); console.error(error.message); process.exitCode = 1; });
