// Prints draft release notes for a tag from CHANGELOG.md: `node scripts/release-notes.cjs v1.2.1`.
const fs = require('node:fs');
const path = require('node:path');

function changelogSection(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`## ${version} `) || line === `## ${version}`);
  if (start === -1) throw new Error(`CHANGELOG.md has no section for ${version}.`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const section = lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim();
  if (!section) throw new Error(`CHANGELOG.md section for ${version} is empty.`);
  return section;
}

function releaseNotes(changelog, tag) {
  const version = tag.replace(/^v/, '');
  const base = `Usage-Bar-v${version}-windows-x64`;
  return `${changelogSection(changelog, version)}

Downloads:

- Download \`${base}-Setup.exe\` to update or install for your Windows user. Administrator rights are not required. The installer is unsigned.
- Or download \`${base}.zip\`, extract the entire archive, and run \`Usage Bar.exe\`. Keep all files next to the EXE.

Requires Windows 10/11 x64. Quit the previous app before updating. Settings and saved credentials are preserved. SHA-256 hashes are in \`SHA256SUMS.txt\`.

Built and tested by the release workflow: unit tests and the packaged Electron smoke test passed.
`;
}

if (require.main === module) {
  const tag = process.argv[2];
  if (!tag) throw new Error('Usage: node scripts/release-notes.cjs v<version>');
  process.stdout.write(releaseNotes(fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8'), tag));
}

module.exports = { changelogSection, releaseNotes };
