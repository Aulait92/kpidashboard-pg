-- Bedenkzeit zum Angebot (Paket P5, Ole 17.11.2026): Neustart der Angebots-Abfolge an einem Tag
ALTER TABLE "LeadSequence" ADD COLUMN IF NOT EXISTS "neustartAt" TIMESTAMP(3);
