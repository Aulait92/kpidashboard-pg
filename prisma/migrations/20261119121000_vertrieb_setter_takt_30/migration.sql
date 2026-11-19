-- Setter-Call alle halbe Stunde buchbar (Ole, 19.11.2026): Takt der Startzeiten im Vertriebskalender auf 30 Minuten,
-- Termindauer 15 Minuten (wie der Termintyp meta-leads-call). Zeiten je Wochentag bleiben unverändert.
-- Ohne gespeicherte Zeiten je Wochentag (schedule NULL) ohne Wirkung; dann im Admin unter Buchungsseite → Zeiten den Takt wählen.
UPDATE "CalendarLeadTimes"
SET "schedule" = jsonb_set("schedule"::jsonb, '{step}', '30'::jsonb),
    "durationMin" = 15,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "calendarKey" = 'cust_pg_vertrieb' AND "schedule" IS NOT NULL;
