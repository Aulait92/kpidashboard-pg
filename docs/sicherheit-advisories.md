# Sicherheits-Advisories: bewertet, nicht behebbar

Liste von Advisories aus `npm audit`/Websuche, die geprüft wurden, aber (noch) nicht behoben werden können.
Der automatische Sicherheits-Dienst sucht vor dem Melden per `git log` nach der Advisory-ID – ein Eintrag hier verhindert Mehrfachmeldungen.

| Datum | Advisory | Paket | Schwere | Einschätzung | Maßnahme |
|---|---|---|---|---|---|
| 2026-11-17 | GHSA-fc5q-39xc-vjpf | picomatch ≤ 4.0.7 (transitiv über @sentry/nextjs → @rollup/plugin-commonjs, @rollup/pluginutils, vite/tinyglobby/fdir) | high (ReDoS, CVSS 7.5) | Keine gepatchte Version veröffentlicht (neueste 4.0.7). picomatch läuft nur im Build-Werkzeug von Sentry mit festen Mustern aus der Konfiguration, nie mit Nutzereingaben; unser Code nutzt es nicht. Zur Laufzeit nicht ausnutzbar. `npm audit fix` schlägt nur ein Downgrade auf @sentry/nextjs 8 vor (sinnlos). | Beobachten; sobald picomatch > 4.0.7 erscheint, per `npm update`/Override anheben. **17.11.2026 abends erneut geprüft:** weiterhin keine gepatchte Version (npm: neueste 4.0.7, Advisory-Bereich `<=4.0.7`). Befristete CI-Ausnahme in `scripts/audit-check.mjs` bis **2026-12-15**; danach schlägt die CI wieder an und die Ausnahme muss neu bewertet (verlängert oder per Override behoben) werden. |

## CI-Ausnahmen (`scripts/audit-check.mjs`)

Die CI prüft mit `node scripts/audit-check.mjs` (wertet `npm audit --omit=dev --json` aus) und schlägt bei jeder
Advisory ab „high“ fehl. Ausnahmen gelten nur für einzelne Advisory-IDs, die hier bewertet sind, und nur bis zu ihrem
Ablaufdatum (Liste `AUSNAHMEN` im Skript, mit Begründung). Nach Ablauf meldet die CI die Advisory wieder.
Wird eine Ausnahme nicht mehr gemeldet, weist das Skript darauf hin; dann den Eintrag im Skript entfernen.

| Advisory | gültig bis |
|---|---|
| GHSA-fc5q-39xc-vjpf (picomatch) | 2026-12-15 |
