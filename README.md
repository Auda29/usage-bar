# Usage Bar

Eine kleine Windows-Tray-App für die Nutzungslimits von Claude und Codex. Die kompakte Ansicht folgt der Usage-Sektion von OpenChamber.

![Usage Bar mit Claude- und Codex-Nutzung](docs/images/usage-bar.png)

Die Abbildung zeigt ausdrücklich markierte Beispieldaten.

- Stunden- und Wochenlimits, Reset-Zeiten und Codex-Credits in einer kompakten Übersicht.
- Automatische Aktualisierung alle 3 Minuten und manueller Refresh.
- Helles oder dunkles Tray-Symbol passend zur Taskleiste, dunkles Kontextmenü.
- Provider-Auswahl, Anzeige von Verbrauch oder Rest und optionaler Windows-Autostart.

## Download

Die portable Windows-Version gibt es unter [Releases](https://github.com/Auda29/usage-bar/releases/latest).

1. `Usage-Bar-v1.0.0-windows-x64.zip` herunterladen.
2. Das gesamte ZIP in einen festen Ordner entpacken.
3. `Usage Bar.exe` im entpackten Ordner starten.

Voraussetzung ist Windows 10 oder 11 mit x64-Prozessor sowie eine vorhandene Claude-Code- oder Codex-Anmeldung. Node.js und OpenChamber werden zum Ausführen des Downloads nicht benötigt. Die Dateien neben der EXE gehören zur Anwendung und müssen im Ordner bleiben.

## Starten

Im Projektordner startet die Verknüpfung `Usage Bar.lnk` die gebaute App. Die Anwendung liegt nach `npm run build` unter `dist/Usage Bar-win32-x64/Usage Bar.exe`. Der gesamte Ordner gehört zur Anwendung und kann an einen festen Ort kopiert werden. Node.js und OpenChamber werden zum Ausführen der gebauten App nicht benötigt.

- Linksklick auf das Balken-Symbol neben der Uhr öffnet die Übersicht.
- Klick auf „Usage“ klappt die Liste ein oder aus.
- Der Refresh-Button oder F5 aktualisiert die Werte. Automatisch geschieht das alle 3 Minuten.
- Escape, ein Klick außerhalb oder ein weiterer Klick auf das Tray-Symbol schließt die Übersicht.
- Rechtsklick öffnet das Menü mit Provider-Auswahl, Verbrauch/Rest, Kurzstatus und optionalem Windows-Autostart.
- „Beenden“ im Tray-Menü beendet die App.

Windows kann neue Tray-Symbole zunächst im Überlauf unter dem Pfeil neben der Uhr anzeigen. Das Symbol lässt sich von dort in den sichtbaren Bereich ziehen.

Das Tray-Symbol wechselt passend zum Windows-Systemtheme zwischen dunklen und hellen Balken. Das Kontextmenü bleibt wie das Usage-Panel dunkel. Änderungen am Windows-Theme werden während des Betriebs übernommen.

## Anmeldung und Daten

Usage Bar liest vorhandene lokale Anmeldungen. Zugangsdaten werden nicht an die Oberfläche übergeben, nicht geloggt und nicht in die App-Einstellungen kopiert.

**Claude:** Standardmäßig `~/.claude/.credentials.json`, Abschnitt `claudeAiOauth`. `CLAUDE_CONFIG_DIR` wird berücksichtigt. Als Fallback dienen OpenCode-OAuth-Zugangsdaten und `CLAUDE_CODE_OAUTH_TOKEN`. Die Nutzungswerte kommen von `https://api.anthropic.com/api/oauth/usage`.

**Codex:** Standardmäßig `~/.codex/auth.json`, Abschnitt `tokens`, einschließlich `account_id`. `CODEX_HOME` wird berücksichtigt. OpenCode-OAuth-Zugangsdaten dienen als Fallback. Die Nutzungswerte kommen von `https://chatgpt.com/backend-api/wham/usage`. Ein reiner OpenAI-API-Key liefert keine ChatGPT-Abonnementlimits.

Bei fehlender oder abgelaufener Anmeldung Claude Code beziehungsweise Codex öffnen und dort anmelden. Die CLI-Anmeldung erfolgt bei Bedarf über `claude auth login` beziehungsweise `codex login`. Usage Bar liest die Dateien bei jeder Aktualisierung neu. Es rotiert keine gemeinsam genutzten Refresh-Tokens und verändert keine Anmeldedateien. Einige Codex-Anmeldearten erlauben keine direkte Usage-Abfrage; dafür zeigt die App einen Hinweis und einen Link zur Usage-Seite.

Prozentwerte zeigen standardmäßig den **verbrauchten** Anteil. „Verbleibend“ im Tray-Menü schaltet die Anzeige um. Warnfarben beziehen sich auf den Verbrauch, ab 50 % gelb, ab 80 % rot. Codex-Credits sind eine Anzahl von Credits, kein Dollarbetrag. Reset-Zeiten erscheinen in der lokalen Zeitzone.

Bei Netzwerkfehlern bleiben die letzten erfolgreichen Werte mit sichtbarem Fehlerhinweis und Uhrzeit erhalten. Bei einem Kontowechsel werden alte Werte verworfen. Rate-Limits respektieren `Retry-After`; manuelles Refresh umgeht die Wartezeit nicht. Der Cache lebt nur im Arbeitsspeicher.

Einstellungen liegen unter `%APPDATA%/usage-bar/settings.json`. Autostart ist anfangs aus. Wird der portable App-Ordner nach aktiviertem Autostart verschoben, Autostart am neuen Ort aus- und wieder einschalten.

## Entwicklung

Node.js ab 22.12 und Windows 10/11 x64:

```powershell
npm ci
npm start
```

```powershell
npm run demo             # Vorschau mit Beispieldaten, laufende App vorher beenden
npm test                 # Parser, Credentials, Fehler, Rate-Limits und Fensterposition
npm run check:providers  # Echte lokale Anmeldungen prüfen, nur Usage-Daten ausgeben
npm run smoke            # Electron mit isolierten Test-Einstellungen und Demo-Daten
node scripts/smoke.cjs --packaged  # Dieselben Prüfungen mit der gebauten EXE
npm run preview          # Browser-Vorschau auf 127.0.0.1:4317, ausschließlich Demo-Daten
npm run build            # Portable Windows-Anwendung bauen
```

Der Smoke-Test prüft das echte Electron-Tray, IPC, Logos, Zeilenmaße, Fensterhöhe, Ein-/Ausklappen, Refresh und Escape. Sein Screenshot wird unter `artifacts/usage-bar-demo.png` gespeichert. Die Browser-Vorschau verwendet dieselben HTML/CSS/JS-Dateien. Echte Daten und Zugangsdaten werden dort nicht bereitgestellt.

## Herkunft

Layout, Zeilenmaße und Provider-Abfrage orientieren sich an [OpenChamber](https://github.com/openchamber/openchamber), untersucht am Commit `8e2db38a63ac56575aa1519acc49f19ba4d8fddb`. Die kleinen Provider-Logos stammen aus diesem Repository. Lizenzhinweise stehen in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Usage Bar ist ein unabhängiges Projekt.

## Lizenz und Beiträge

Usage Bar steht unter der [MIT-Lizenz](LICENSE). Hinweise zu übernommenen Bestandteilen stehen in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Fehler und Vorschläge können über [GitHub Issues](https://github.com/Auda29/usage-bar/issues) gemeldet werden. Bitte keine Zugangsdaten oder Anmeldedateien an Issues anhängen. Änderungen lassen sich mit `npm test` und `npm run smoke` lokal prüfen.

Die Änderungen veröffentlichter Versionen stehen im [Changelog](CHANGELOG.md).
