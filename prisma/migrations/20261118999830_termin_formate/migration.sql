-- Terminarten (Ole, 18.11.2026): Video immer, Telefon und vor Ort nur auf ausdrücklichen Wunsch des Leads und nur,
-- wenn der Vermittler es freigibt. Bestehende Kunden: beides aus (frühere Antworten im Fragebogen werden nicht übernommen).
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "allowPhone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "allowOnsite" BOOLEAN NOT NULL DEFAULT false;
-- Ort eines Termins vor Ort (Agentur-Adresse zum Zeitpunkt der Buchung)
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "ort" TEXT;
