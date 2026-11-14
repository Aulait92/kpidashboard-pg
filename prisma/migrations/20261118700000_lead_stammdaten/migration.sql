-- Korrekturen der Lead-Stammdaten im Kontakt (Ole, 14.11.2026)
ALTER TABLE "Lead" ADD COLUMN "contactOverrides" JSONB;
ALTER TABLE "Lead" ADD COLUMN "contactEditedAt" TIMESTAMP(3);
