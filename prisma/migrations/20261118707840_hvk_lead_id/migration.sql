-- HvK-Abrechnung (Ole, 17.11.2026): Zuordnung HvK-Lead-ID → unser Lead dauerhaft speichern, damit Reklamationen
-- direkt über die ID zugeordnet werden. Dazu der Weg der automatischen Zuordnung je Reklamation. Additiv und wiederholbar.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "hvkLeadId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_hvkLeadId_key" ON "Lead"("hvkLeadId");

ALTER TABLE "HvkReklamation" ADD COLUMN IF NOT EXISTS "via" TEXT;
