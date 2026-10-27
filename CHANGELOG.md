# Changelog

## Unreleased

- Show every design and the optional features as screenshots in the README. `npm run screenshots` regenerates them from sample data.
- Keep the number and unit of a reset time on one line when the Kacheln warning banner wraps.

## 1.2.1 - 2026-10-27

- Make Kompakt the default design for new installations and for settings without a saved design, including updates from 1.1.6 and earlier.
- Mark Klassisch as legacy: it is listed last in the "Design" menu as "Klassisch (Legacy)", stays selectable, and may be removed in a future version. An explicitly saved Klassisch choice is kept.

## 1.2.0 - 2026-10-27

- Add a "Design" tray submenu with seven popup designs: Klassisch (unchanged default), Fluent, Kacheln, Terminal, Fokus, Hell and Kompakt. The window background follows the selected design.
- Add a "Funktionen" tray submenu with optional views for every design: usage pace with a projected run-out warning, a two-week reset timeline, and a single list of all limits sorted by usage.
- Fluent, Kacheln and Hell include a used/remaining switch in the popup.
- The smoke test now switches through every design with all features on and off, and tolerates sub-pixel row and window heights on scaled displays.

## 1.1.6 - 2026-10-27

- Keep "Mit Windows starten" checked when changing display mode, provider selection, the headline provider, or the expanded view. Read the Windows startup registration using the same executable path and `--hidden` argument used when enabling startup.

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
