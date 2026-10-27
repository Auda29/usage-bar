// Operating-system differences in one place. Every helper takes { env, home, platform }
// so tests can check Windows, macOS and Linux behavior from any host.
const path = require('node:path');
const os = require('node:os');

const defaults = ({ env = process.env, home = os.homedir(), platform = process.platform } = {}) => ({ env, home, platform });
const pathFor = (platform) => platform === 'win32' ? path.win32 : path.posix;

function executable(name, platform = process.platform) {
  return platform === 'win32' ? `${name}.exe` : name;
}

// Per-user application data of Electron apps such as Cursor:
// %APPDATA% on Windows, ~/Library/Application Support on macOS, $XDG_CONFIG_HOME or ~/.config on Linux.
function userAppDataDir(options) {
  const { env, home, platform } = defaults(options);
  const p = pathFor(platform);
  if (platform === 'win32') return env.APPDATA || p.join(home, 'AppData', 'Roaming');
  if (platform === 'darwin') return p.join(home, 'Library', 'Application Support');
  return env.XDG_CONFIG_HOME || p.join(home, '.config');
}

function cursorStateFile(options) {
  const { platform } = defaults(options);
  return pathFor(platform).join(userAppDataDir(options), 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

// Global npm package directories, an explicit prefix first. PATH-based guesses stay with the caller.
function npmGlobalRoots(options) {
  const { env, home, platform } = defaults(options);
  const p = pathFor(platform);
  const prefix = env.npm_config_prefix || env.NPM_CONFIG_PREFIX;
  const fromPrefix = prefix ? [platform === 'win32' ? p.join(prefix, 'node_modules') : p.join(prefix, 'lib', 'node_modules')] : [];
  const system = {
    win32: [p.join(env.APPDATA || p.join(home, 'AppData', 'Roaming'), 'npm', 'node_modules')],
    darwin: ['/opt/homebrew/lib/node_modules', '/usr/local/lib/node_modules'],
  }[platform] ?? ['/usr/local/lib/node_modules', '/usr/lib/node_modules'];
  return [...new Set([...fromPrefix, ...system, p.join(home, '.npm-global', 'lib', 'node_modules')])];
}

function openCodeDataDirs(options) {
  const { env, home, platform } = defaults(options);
  const p = pathFor(platform);
  return [
    env.OPENCODE_DATA_DIR,
    p.join(env.XDG_DATA_HOME || p.join(home, '.local', 'share'), 'opencode'),
    env.APPDATA && p.join(env.APPDATA, 'opencode'),
  ].filter(Boolean);
}

// Electron's login item API covers Windows and macOS; Linux needs an autostart entry instead.
function supportsLoginItems(platform = process.platform) {
  return platform === 'win32' || platform === 'darwin';
}

module.exports = { executable, userAppDataDir, cursorStateFile, npmGlobalRoots, openCodeDataDirs, supportsLoginItems };
