# Sicherheits-Advisories: bewertet, nicht behebbar

Liste von Advisories aus `npm audit`/Websuche, die geprüft wurden, aber (noch) nicht behoben werden können.
Der automatische Sicherheits-Dienst sucht vor dem Melden per `git log` nach der Advisory-ID – ein Eintrag hier verhindert Mehrfachmeldungen.

| Datum | Advisory | Paket | Schwere | Einschätzung | Maßnahme |
|---|---|---|---|---|---|
| 2026-11-17 | GHSA-fc5q-39xc-vjpf | picomatch ≤ 4.0.7 (transitiv über @sentry/nextjs → @rollup/plugin-commonjs, @rollup/pluginutils, vite/tinyglobby/fdir) | high (ReDoS, CVSS 7.5) | Keine gepatchte Version veröffentlicht (neueste 4.0.7). picomatch läuft nur im Build-Werkzeug von Sentry mit festen Mustern aus der Konfiguration, nie mit Nutzereingaben; unser Code nutzt es nicht. Zur Laufzeit nicht ausnutzbar. `npm audit fix` schlägt nur ein Downgrade auf @sentry/nextjs 8 vor (sinnlos). | Beobachten; sobald picomatch > 4.0.7 erscheint, per `npm update`/Override anheben. |
