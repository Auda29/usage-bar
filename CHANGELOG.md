# Changelog

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
