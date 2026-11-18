-- Maklervollmacht per WhatsApp und Entscheidung „Wer schickt sie?“ (18.11.2026). Additiv.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "vollmachtVersand" TEXT;
ALTER TABLE "Maklervollmacht" ADD COLUMN IF NOT EXISTS "waSentAt" TIMESTAMP(3);
ALTER TABLE "Maklervollmacht" ADD COLUMN IF NOT EXISTS "erinnerungAt" TIMESTAMP(3);
ALTER TABLE "Maklervollmacht" ADD COLUMN IF NOT EXISTS "erinnerungStatus" TEXT;
CREATE INDEX IF NOT EXISTS "Maklervollmacht_status_waSentAt_idx" ON "Maklervollmacht"("status", "waSentAt");
