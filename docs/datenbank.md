# Datenbank-Änderungen (Migrationen)

Seit November 2026 wird das Schema über **versionierte Migrationen** geändert,
nicht mehr per `prisma db push --accept-data-loss`.

## Schema ändern

1. `prisma/schema.prisma` anpassen.
2. Lokal gegen eine Entwicklungs-Datenbank: `npm run db:migrate -- --name kurze-beschreibung`
   → erzeugt `prisma/migrations/<zeitstempel>_kurze-beschreibung/migration.sql`.
3. SQL prüfen (besonders `DROP`/Typänderungen) und mit dem Code committen.
4. Beim Deploy führt `scripts/migrate.mjs` automatisch `prisma migrate deploy` aus.

Löschende Änderungen (Spalte/Tabelle entfernen, Typ ändern) immer in zwei Schritten:
erst Code umstellen und deployen, dann in einer eigenen Migration entfernen –
nach einem Backup.

## Was beim Start passiert (`npm start`)

- Datenbank kennt noch keine Migrationen → einmalig „einmessen“: nur
  hinzufügende Änderungen werden in einer Transaktion angewendet, dann wird
  `0_init` als angewendet markiert. Würde etwas gelöscht, bricht der Start ab.
- Sonst: `prisma migrate deploy` (nur neue Migrationen).
- Schlägt das fehl, startet die App nicht. Mit Railway-Healthcheck
  (`/api/health`) bleibt die vorherige Version online.
