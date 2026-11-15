-- Erstinformation vollständig nach § 15 VersVermV (Ole, 15.11.2026): Name, Anschrift, Versicherer, Erlaubnisart
-- (Mehrfachvertreter), Beratung, Beteiligungen, Vergütung, Zuwendungen, IHK und Bestätigung der Angaben.
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "firma" TEXT;
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "anschrift" TEXT;
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "telefon" TEXT;
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "versicherer" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "erlaubnis" TEXT;
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "beratung" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "beteiligungen" TEXT;
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "verguetung" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "zuwendungen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "ihk" TEXT;
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "bestaetigtAt" TIMESTAMP(3);
