# Usage Bar

A small Windows tray app for usage limits across Claude and Codex. Its compact view follows OpenChamber's Usage section.

![Usage Bar showing Claude and Codex usage](docs/images/usage-bar.png)

The screenshot uses clearly labeled sample data.

- Hourly and weekly limits, reset times, and Codex credits in one compact view.
- Automatic updates every 3 minutes and manual refresh.
- Light or dark tray icon to match the taskbar, with a dark context menu.
- Provider selection, used or remaining quota display, and optional startup with Windows.

## Download

Get the portable Windows version from [Releases](https://github.com/Auda29/usage-bar/releases/latest).

1. Download `Usage-Bar-v1.0.0-windows-x64.zip`.
2. Extract the entire ZIP to a permanent folder.
3. Run `Usage Bar.exe` from that folder.

Requires Windows 10 or 11 on an x64 processor and an existing Claude Code or Codex sign-in. Node.js and OpenChamber are not required to run the download. The files next to the EXE are part of the application and must stay in the folder.

## Using the app

The `Usage Bar.lnk` shortcut in the project folder launches the built app. After `npm run build`, the application is located at `dist/Usage Bar-win32-x64/Usage Bar.exe`. The entire folder is required and can be copied to a permanent location. Node.js and OpenChamber are not required to run the built app.

The interface currently uses German labels; their English meanings are included below.

- Left-click the bar icon next to the clock to open the usage view.
- Click "Usage" to collapse or expand the list.
- Click the refresh button or press F5 to update the values. Updates also run automatically every 3 minutes.
- Press Escape, click outside the window, or click the tray icon again to close the view.
- Right-click to open the menu with provider selection, used/remaining display, header status, and optional startup with Windows.
- Choose "Beenden" (Quit) in the tray menu to exit the app.

Windows may initially place new tray icons in the overflow area under the arrow next to the clock. Drag the icon from there into the visible area.

The tray icon switches between dark and light bars to match the Windows system theme. The context menu stays dark, like the usage panel. Windows theme changes take effect while the app is running.

## Authentication and data

Usage Bar reads existing local sign-ins. Credentials are never passed to the renderer, logged, or copied into app settings.

**Claude:** Uses the `claudeAiOauth` section in `~/.claude/.credentials.json` by default. Respects `CLAUDE_CONFIG_DIR`. Falls back to OpenCode OAuth credentials and `CLAUDE_CODE_OAUTH_TOKEN`. Usage data comes from `https://api.anthropic.com/api/oauth/usage`.

**Codex:** Uses the `tokens` section in `~/.codex/auth.json` by default, including `account_id`. Respects `CODEX_HOME`. Falls back to OpenCode OAuth credentials. Usage data comes from `https://chatgpt.com/backend-api/wham/usage`. An OpenAI API key alone does not provide ChatGPT subscription limits.

If a sign-in is missing or expired, open Claude Code or Codex and sign in there. Use `claude auth login` or `codex login` for CLI authentication if needed. Usage Bar rereads the files on every refresh. It does not rotate shared refresh tokens or modify authentication files. Some Codex sign-in methods do not allow direct usage queries; the app displays an explanation and a link to the usage page in those cases.

Percentages show the **used** quota by default. Select "Verbleibend" (Remaining) in the tray menu to switch the display. Warning colors reflect usage: yellow at 50% and red at 80%. Codex credits are a credit count, not a dollar amount. Reset times use the local time zone.

On network errors, the last successful values remain visible with an error message and timestamp. Switching accounts discards old values. Rate limits respect `Retry-After`; manual refresh does not bypass the waiting period. The cache is kept in memory only.

Settings are stored in `%APPDATA%/usage-bar/settings.json`. Startup with Windows is off by default. If you move the portable app folder after enabling startup, turn it off and on again at the new location.

## Development

Requires Node.js 22.12 or later and Windows 10/11 x64:

```powershell
npm ci
npm start
```

```powershell
npm run demo             # Preview with sample data; quit the running app first
npm test                 # Parsers, credentials, errors, rate limits, and window positioning
npm run check:providers  # Check real local sign-ins; output usage data only
npm run smoke            # Electron with isolated test settings and demo data
node scripts/smoke.cjs --packaged  # Run the same checks with the built EXE
npm run preview          # Browser preview at 127.0.0.1:4317, demo data only
npm run build            # Build the portable Windows application
```

The smoke test checks the actual Electron tray, IPC, logos, row dimensions, window height, collapsing/expanding, refresh, and Escape. Its screenshot is saved to `artifacts/usage-bar-demo.png`. The browser preview uses the same HTML/CSS/JS files. It does not expose real data or credentials.

## Credits

The layout, row dimensions, and provider queries are based on [OpenChamber](https://github.com/openchamber/openchamber), examined at commit `8e2db38a63ac56575aa1519acc49f19ba4d8fddb`. The small provider logos come from that repository. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for license notices. Usage Bar is an independent project.

## License and contributions

Usage Bar is licensed under the [MIT License](LICENSE). Notices for reused components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Report bugs and suggestions through [GitHub Issues](https://github.com/Auda29/usage-bar/issues). Do not attach credentials or authentication files to issues. Run `npm test` and `npm run smoke` to check changes locally.

See the [Changelog](CHANGELOG.md) for changes in published versions.
