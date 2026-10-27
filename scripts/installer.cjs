const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { build, Platform, Arch } = require('electron-builder');
const metadata = require('../package.json');

(async () => {
  if (process.platform !== 'win32') throw new Error('Build the installer on Windows.');
  const root = path.resolve(__dirname, '..');
  const prepackaged = path.resolve(process.argv[2] || path.join(root, 'dist', 'Usage Bar-win32-x64'));
  const { extractFile } = await import('@electron/asar');
  const packaged = JSON.parse(extractFile(path.join(prepackaged, 'resources', 'app.asar'), 'package.json').toString('utf8'));
  if (packaged.name !== metadata.name || packaged.version !== metadata.version) {
    throw new Error(`Expected ${metadata.name} ${metadata.version}; found ${packaged.name} ${packaged.version}. Run npm run build first.`);
  }
  const output = path.join(root, 'dist', `release-v${metadata.version}`);
  const base = `Usage-Bar-v${metadata.version}-windows-x64`;
  const filename = `${base}-Setup.exe`;
  const archive = `${base}.zip`;
  await build({
    projectDir: root,
    prepackaged,
    targets: Platform.WINDOWS.createTarget(['nsis', 'zip'], Arch.x64),
    publish: 'never',
    config: {
      appId: 'dev.usagebar.desktop',
      productName: 'Usage Bar',
      // electron-builder expands ${ext}; the portable ZIP keeps the app files at the archive root.
      artifactName: `${base}.\${ext}`,
      directories: { output, buildResources: path.join(root, 'assets') },
      publish: null,
      win: { icon: 'assets/app.ico', executableName: 'Usage Bar', signAndEditExecutable: false },
      nsis: {
        artifactName: filename,
        oneClick: true,
        perMachine: false,
        deleteAppDataOnUninstall: false,
        createStartMenuShortcut: true,
        createDesktopShortcut: false,
        shortcutName: 'Usage Bar',
        runAfterFinish: true,
        differentialPackage: false,
        packElevateHelper: false,
      },
    },
  });
  const sums = [filename, archive].map((name) => `${createHash('sha256').update(fs.readFileSync(path.join(output, name))).digest('hex')}  ${name}`);
  fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
  console.log(`Release files in ${output}:`);
  for (const line of sums) console.log(`  ${line}`);
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
