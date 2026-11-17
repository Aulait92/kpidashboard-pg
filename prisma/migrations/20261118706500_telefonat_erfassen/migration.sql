-- Telefonate sauber erfassen (lib/telefonat.ts): laufender Anruf (Assistent pausiert), Erinnerung, Bedarf aus dem
-- Telefonat und geplante Nachfrage der offenen Punkte. Nur neue, leere Spalten.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "callStartedAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "callReminderAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "needData" JSONB;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "needState" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "needAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "openQuestionsAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Lead_callStartedAt_idx" ON "Lead"("callStartedAt");
CREATE INDEX IF NOT EXISTS "Lead_openQuestionsAt_idx" ON "Lead"("openQuestionsAt");
