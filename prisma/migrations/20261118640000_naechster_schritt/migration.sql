-- Nächster Schritt und Verloren-Schutz (Ole, 14.11.2026): Verloren-Grund, dokumentierte Anrufversuche,
-- tägliche Erinnerung je Login. Nur additiv; danach Altbestand übernehmen.

ALTER TABLE "Lead" ADD COLUMN "lostReason" TEXT;
ALTER TABLE "Lead" ADD COLUMN "lostNote" TEXT;
ALTER TABLE "Lead" ADD COLUMN "lostAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "lostEarly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "callAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "lastCallAttemptAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "callPlanStartedAt" TIMESTAMP(3);

ALTER TABLE "User" ADD COLUMN "nextStepReminder" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "nextStepReminderDay" TEXT;

-- Dokumentierte Anrufversuche bisher nie erreichter Leads: „Anruf: nicht erreicht“ im Verlauf, mindestens die
-- gepflegten Kontaktversuche ohne das automatische WhatsApp-Erstanschreiben.
UPDATE "Lead" l SET "callAttempts" = GREATEST(
  COALESCE((SELECT COUNT(*) FROM "LeadHistory" h WHERE h."leadId" = l.id AND h.kind = 'anruf' AND h.text LIKE 'Anruf: nicht erreicht%'), 0),
  l."contactAttempts" - CASE WHEN l."outreachAt" IS NOT NULL THEN 1 ELSE 0 END,
  0
)
WHERE l."contactAttempts" > 0 AND l.reached = false;

-- Verloren-Gründe aus den bisherigen Status bzw. Gründen (gleiche Abbildung wie LEGACY_REASON_MAP in lib/lead-lost.ts)
UPDATE "Lead" SET "lostReason" = CASE "disqualifyReason"
    WHEN 'falsche_nummer' THEN 'falsche_daten'
    WHEN 'fake' THEN 'falsche_daten'
    WHEN 'kein_bedarf' THEN 'passt_nicht'
    WHEN 'doppelt' THEN 'sonstiges'
    WHEN 'region' THEN 'sonstiges'
    WHEN 'sonstiges' THEN 'sonstiges'
  END,
  "lostNote" = CASE "disqualifyReason" WHEN 'doppelt' THEN 'Doppelt eingetragen' WHEN 'region' THEN 'Außerhalb der Region' END,
  "lostAt" = "statusChangedAt"
WHERE status IN ('Disqualifiziert', 'Disqualified', 'Nicht qualifiziert') AND "disqualifyReason" IS NOT NULL AND "lostReason" IS NULL;

UPDATE "Lead" SET "lostReason" = 'kein_interesse', "lostAt" = "statusChangedAt"
WHERE status = 'Kein Interesse' AND "lostReason" IS NULL;
