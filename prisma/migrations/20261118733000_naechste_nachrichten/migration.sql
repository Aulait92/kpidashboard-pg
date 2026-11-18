-- Nächste Nachrichten sichtbar (Paket P6, Ole 17.11.2026): Pause je Kontakt, übersprungene Schritte und Erinnerungen.
-- neustartAt teilt sich die Migration mit P5 (Bedenkzeit), daher IF NOT EXISTS.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "nachrichtenPausiertAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "erinnerungenUebersprungen" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LeadSequence" ADD COLUMN IF NOT EXISTS "neustartAt" TIMESTAMP(3);
ALTER TABLE "LeadSequence" ADD COLUMN IF NOT EXISTS "uebersprungen" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
