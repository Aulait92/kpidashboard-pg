-- Ole, 22.11.2026: Faxnummern werden im CRM nicht mehr gespeichert (bestehende werden gelöscht).
ALTER TABLE "SalesContact" DROP COLUMN IF EXISTS "fax";
