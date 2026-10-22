const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { packager } = require('@electron/packager');

(async () => {
  const paths = await packager({
    dir: path.join(__dirname, '..'), out: path.join(__dirname, '..', 'dist'),
    name: 'Usage Bar', executableName: 'Usage Bar', platform: 'win32', arch: 'x64',
    icon: path.join(__dirname, '..', 'assets', 'app.ico'),
    asar: true, overwrite: true, prune: true,
    extraResource: ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md', 'docs'].map((file) => path.join(__dirname, '..', file)),
    ignore: [/^\/artifacts(?:\/|$)/, /^\/dist(?:\/|$)/, /^\/test(?:\/|$)/, /^\/scripts(?:\/|$)/, /^\/\.taste-skill(?:\/|$)/, /^\/Usage Bar\.lnk$/, /^\/\.env(?:\.|$)/],
    win32metadata: { CompanyName: 'Usage Bar', FileDescription: 'Claude and Codex usage in the notification area', ProductName: 'Usage Bar', InternalName: 'UsageBar' },
  });
  for (const output of paths) {
    const executable = path.join(output, 'Usage Bar.exe');
    console.log(`Ready: ${executable}`);
    if (process.platform === 'win32') {
      const quote = (value) => `'${value.replaceAll("'", "''")}'`;
      const shortcut = path.join(__dirname, '..', 'Usage Bar.lnk');
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut(${quote(shortcut)}); $shortcut.TargetPath = ${quote(executable)}; $shortcut.WorkingDirectory = ${quote(output)}; $shortcut.IconLocation = ${quote(executable)}; $shortcut.Save()`], { windowsHide: true });
      console.log(`Shortcut: ${shortcut}`);
    }
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
