const { test } = require('node:test');
const assert = require('node:assert/strict');
const { changelogSection, releaseNotes } = require('../scripts/release-notes.cjs');

const changelog = `# Changelog

## Unreleased

- Not yet released.

## 1.2.1 - 2026-10-27

- Make Kompakt the default.
- Mark Klassisch as legacy.

## 1.2.0 - 2026-10-27

- Add designs.
`;

test('the changelog section of a version is found without its neighbors', () => {
  assert.equal(changelogSection(changelog, '1.2.1'), '- Make Kompakt the default.\n- Mark Klassisch as legacy.');
  assert.equal(changelogSection(changelog, '1.2.0'), '- Add designs.');
});

test('a version missing from the changelog or without entries is an error', () => {
  assert.throws(() => changelogSection(changelog, '9.9.9'), /9\.9\.9/);
  assert.throws(() => changelogSection('# Changelog\n\n## 2.0.0 - 2026-11-01\n\n## 1.0.0\n\n- Old.\n', '2.0.0'), /empty/);
});

test('release notes add the download instructions with the versioned file names', () => {
  const notes = releaseNotes(changelog, 'v1.2.1');
  assert.match(notes, /^- Make Kompakt the default\./);
  assert.match(notes, /Usage-Bar-v1\.2\.1-windows-x64-Setup\.exe/);
  assert.match(notes, /Usage-Bar-v1\.2\.1-windows-x64\.zip/);
  assert.match(notes, /SHA256SUMS\.txt/);
});
