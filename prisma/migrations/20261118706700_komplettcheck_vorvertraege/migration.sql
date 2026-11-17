-- Komplettcheck nach der Buchung und bestehende Verträge laut Lead (Ole, 17.11.2026). Additiv.
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "komplettcheck" BOOLEAN;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "vorvertraege" JSONB;
