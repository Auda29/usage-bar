const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { executable, cursorStateFile, npmGlobalRoots, openCodeDataDirs, supportsLoginItems } = require('../src/platform.cjs');

const win = { platform: 'win32', home: 'C:\\Users\\ada', env: { APPDATA: 'C:\\Users\\ada\\AppData\\Roaming' } };
const mac = { platform: 'darwin', home: '/Users/ada', env: {} };
const linux = { platform: 'linux', home: '/home/ada', env: {} };

test('command-line tools carry .exe only on Windows', () => {
  assert.equal(executable('gh', 'win32'), 'gh.exe');
  assert.equal(executable('claude', 'darwin'), 'claude');
  assert.equal(executable('gh', 'linux'), 'gh');
});

test('Cursor keeps its login in each system\'s per-user application data', () => {
  assert.equal(cursorStateFile(win), path.win32.join(win.env.APPDATA, 'Cursor', 'User', 'globalStorage', 'state.vscdb'));
  assert.equal(cursorStateFile({ ...win, env: {} }), path.win32.join(win.home, 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'state.vscdb'));
  assert.equal(cursorStateFile(mac), '/Users/ada/Library/Application Support/Cursor/User/globalStorage/state.vscdb');
  assert.equal(cursorStateFile(linux), '/home/ada/.config/Cursor/User/globalStorage/state.vscdb');
  assert.equal(cursorStateFile({ ...linux, env: { XDG_CONFIG_HOME: '/data/config' } }), '/data/config/Cursor/User/globalStorage/state.vscdb');
});

test('global npm roots cover the usual installs and an explicit prefix first', () => {
  assert.deepEqual(npmGlobalRoots(win), [path.win32.join(win.env.APPDATA, 'npm', 'node_modules'), path.win32.join(win.home, '.npm-global', 'lib', 'node_modules')]);
  assert.deepEqual(npmGlobalRoots(mac), ['/opt/homebrew/lib/node_modules', '/usr/local/lib/node_modules', '/Users/ada/.npm-global/lib/node_modules']);
  assert.deepEqual(npmGlobalRoots(linux), ['/usr/local/lib/node_modules', '/usr/lib/node_modules', '/home/ada/.npm-global/lib/node_modules']);
  assert.equal(npmGlobalRoots({ ...linux, env: { npm_config_prefix: '/opt/node' } })[0], '/opt/node/lib/node_modules');
  assert.equal(npmGlobalRoots({ ...win, env: { ...win.env, NPM_CONFIG_PREFIX: 'D:\\node' } })[0], path.win32.join('D:\\node', 'node_modules'));
});

test('OpenCode data is searched in its override, XDG and Windows locations', () => {
  assert.deepEqual(openCodeDataDirs({ ...linux, env: { OPENCODE_DATA_DIR: '/x/opencode' } }), ['/x/opencode', '/home/ada/.local/share/opencode']);
  assert.deepEqual(openCodeDataDirs(win), [path.win32.join(win.home, '.local', 'share', 'opencode'), path.win32.join(win.env.APPDATA, 'opencode')]);
  assert.deepEqual(openCodeDataDirs({ ...mac, env: { XDG_DATA_HOME: '/Users/ada/data' } }), ['/Users/ada/data/opencode']);
});

test('start at login is offered where Electron supports it', () => {
  assert.equal(supportsLoginItems('win32'), true);
  assert.equal(supportsLoginItems('darwin'), true);
  assert.equal(supportsLoginItems('linux'), false);
});
