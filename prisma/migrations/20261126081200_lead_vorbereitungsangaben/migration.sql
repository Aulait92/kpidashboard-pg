-- Angaben aus der Terminvorbereitung im Chat (Fragen-Engine, lib/vorbereitung/fragen.ts), additiv
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "vorbereitungsAngaben" JSONB;
