-- Vorlagen verkaufsstärker (Ole, 15.11.2026): Zweck und A/B-Fassung je Nachricht, Kopfzeile und Knöpfe je Vorlage,
-- Terminbestätigung per Knopf, A/B-Test-Ergebnis je Zweck. Nur hinzufügend.
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "purpose" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "variant" TEXT;
CREATE INDEX IF NOT EXISTS "Message_purpose_createdAt_idx" ON "Message"("purpose", "createdAt");

ALTER TABLE "MessageTemplate" ADD COLUMN IF NOT EXISTS "headerFormat" TEXT;
ALTER TABLE "MessageTemplate" ADD COLUMN IF NOT EXISTS "buttons" JSONB;

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "TemplateAbTest" (
    "purpose" TEXT NOT NULL,
    "winner" TEXT,
    "decidedAt" TIMESTAMP(3),
    "stats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TemplateAbTest_pkey" PRIMARY KEY ("purpose")
);
