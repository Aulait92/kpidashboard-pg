-- Testlead (Ole, 16.11.2026): Lead.isTest. Additiv und wiederholbar. Testleads laufen durch den echten Ablauf,
-- zählen aber nirgends (lib/testlead.ts).
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT false;
