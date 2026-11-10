# Notfall: Datenbank wiederherstellen

Die Produktionsdatenbank (Railway-Service „Postgres“) sichert fortlaufend in
einen Speicher (Point-in-Time-Recovery, ca. 4 Wochen zurück). Eine
Wiederherstellung legt immer einen **neuen** Datenbank-Service an. Die
bestehende Datenbank wird dabei nicht verändert.

## Ablauf (ca. 15–30 Minuten; das Nachspielen dauert je nach Abstand zur letzten Vollsicherung)

1. **Zeitpunkt festlegen**: letzter Zeitpunkt, an dem die Daten noch stimmten
   (Uhrzeit in UTC; deutsche Zeit minus 1 Stunde im Winter, minus 2 im Sommer).
2. Railway → Projekt „PG Dashboard“ → Service **Postgres** → **Backups** →
   **Restore to point in time** → Zeitpunkt wählen, neuer Service-Name z. B.
   `postgres-restore-<datum>`.
3. Warten, bis der neue Service „Active“ ist (Log endet mit „database system is
   ready to accept connections“).
4. **Prüfen**: Im neuen Service unter „Data“ stichprobenartig Tabellen ansehen
   (z. B. `Lead`, `Customer`, `SalesContact`: Anzahl Zeilen, neueste Einträge).
5. **Umschalten**: Service `kpidashboard-pg` → Variables → `DATABASE_URL` auf die
   Referenz des neuen Services setzen: `${{postgres-restore-<datum>.DATABASE_URL}}`.
   Railway startet die App neu.
6. **Kurztest**: Login, Kunden, Leads; `https://kpi.performancegrowth.de/api/status`.
7. Die alte Datenbank **nicht sofort löschen** – erst nach ein paar Tagen, wenn
   klar ist, dass nichts mehr fehlt.

Alles, was zwischen dem gewählten Zeitpunkt und jetzt passiert ist (neue Leads,
Chats), fehlt in der wiederhergestellten Datenbank. Leads aus Meta lassen sich
über Lead-Eingang erneut abrufen; Airtable-Leads kommen mit dem nächsten Sync.

## Test

| Datum | Ergebnis |
|---|---|
| 10.11.2026 | Erfolgreich. Ziel 06:58 UTC, Wiederherstellung dauerte ca. 10 Min. (Vollsicherung vom Vortag + Nachspielen). Alle 27 Tabellen mit identischen Zeilenzahlen (geprüft mit `scripts/db-compare.mjs`). Kopie danach gelöscht. |
