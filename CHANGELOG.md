# Changelog

## 1.1.5 - 2026-10-27

- Report empty or cleared Claude Code credentials as an expired or invalid login instead of "Claude einrichten".
- Skip background renewal when the saved refresh token has already expired.
- Add "Mit Claude Code anmelden" to provider setup. An explicit click starts the official CLI's browser login, strips conflicting authentication environment overrides in that child process, and reloads usage after sign-in.
- Read active provider credentials from OpenCode 2's local database in read-only mode, alongside support for legacy `auth.json`. Compare discovery with OpenChamber 2.5.2.

## 1.1.4 - 2026-10-26

- Added a Windows x64 installer to this release on 2026-10-27. Setup installs for the current user, adds a Start menu entry, and preserves settings and saved credentials on updates and uninstall.
- Renew expiring Claude profile sign-ins through the official native Claude CLI instead of falling back to an inference-only environment token after eight hours.
- Share concurrent renewal requests, throttle failed attempts, and leave the global environment unchanged.
- Automatic Claude renewal requires native Claude CLI 2.1.310 or later; unsupported or missing CLI installations do not trigger interactive login.

## 1.1.3 - 2026-10-23

- Prefer a current Claude Code sign-in with profile permission over an inference-only environment token for usage queries.
- Check environment-token profile access once per token and report missing permission with a sign-in instruction instead of repeatedly querying usage.

## 1.1.2 - 2026-10-23

- Match Claude Code's OAuth credential precedence so `CLAUDE_CODE_OAUTH_TOKEN` takes priority over an expired stored sign-in.

## 1.1.1 - 2026-10-22

- Keep the usage popup above the tray icon with a gap when the Windows taskbar auto-hides.

## 1.1.0 - 2026-10-22

- Read Gemini OAuth client parameters from the local CLI installation or explicit configuration instead of bundling them.
- Added a Copilot account selector with GitHub CLI accounts, visible account identity, and persistent selection independent of the CLI's active account.
- Report an unavailable selected Copilot account instead of silently falling back to a different account.
- Added Gemini, GitHub Copilot, Cursor, and OpenRouter as additional providers.
- Made all six providers individually selectable in the tray menu and setup window.
- Added persistent provider selection, with network requests only for enabled providers.
- Added Windows-encrypted storage for manually entered tokens and explicit, read-only Cursor sign-in import.
- Preserved existing provider selections during updates.

## 1.0.0 - 2026-10-22

First public release for Windows 10/11 x64.

- Compact, expandable tray view inspired by OpenChamber.
- Claude hourly and weekly limits, plus Codex limits and credit balance.
- Reset times in the local time zone.
- Automatic updates every 3 minutes and manual refresh.
- Used or remaining quota display and selectable providers.
- High-contrast tray icon for light and dark Windows taskbars.
- Dark context menu and optional startup with Windows.
- Existing local sign-ins, error messages, rate-limit waiting periods, and stale-value indicators.
- Portable Windows application with no separate Node.js installation required.
