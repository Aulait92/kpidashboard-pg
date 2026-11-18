-- Datenkorrektur (Ole, 18.11.2026): PG-2026-0150 stand auf „Vom Interessenten geöffnet 16.11., 19:38“. Laut HTTP-Log
-- war das die Link-Vorschau von Skype/Teams (SkypeUriPreview), kein Mensch. Erster Aufruf aus einem Browser ohne
-- Sitzung: 18.11.2026, 08:52 Berliner Zeit (07:52:02 UTC), nach der Link-Prüfung von Outlook. Nur wenn der Eintrag
-- noch der falsche ist.
UPDATE "Offer"
SET "viewedAt" = TIMESTAMP '2026-11-18 07:52:02.984'
WHERE "number" = 'PG-2026-0150'
  AND "viewedAt" >= TIMESTAMP '2026-11-16 18:38:00'
  AND "viewedAt" < TIMESTAMP '2026-11-16 18:40:00';
