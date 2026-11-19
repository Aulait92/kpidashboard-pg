-- „Nie kontaktieren“ am Vertriebskontakt (Ole, 19.11.2026): Sperre für Kalt-Mails nach Austragung, Widerspruch,
-- Datenschutzfrage, hartem Bounce oder von Hand; Stand der Sperre in Instantly (Blocklist, Kampagnen). Nur additiv.
ALTER TABLE "SalesContact" ADD COLUMN IF NOT EXISTS "nieKontaktierenAt" TIMESTAMP(3);
ALTER TABLE "SalesContact" ADD COLUMN IF NOT EXISTS "nieKontaktierenGrund" TEXT;
ALTER TABLE "SalesContact" ADD COLUMN IF NOT EXISTS "instantlyGesperrtAt" TIMESTAMP(3);
ALTER TABLE "SalesContact" ADD COLUMN IF NOT EXISTS "instantlySperreVersuche" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesContact" ADD COLUMN IF NOT EXISTS "instantlySperreFehler" TEXT;
CREATE INDEX IF NOT EXISTS "SalesContact_nieKontaktierenAt_idx" ON "SalesContact"("nieKontaktierenAt");
