-- Bestand Paket 4 (20.11.2026): ein automatisches Nachfassen je Kampagnen-Empfänger. Nur hinzufügend.
ALTER TABLE "CustomerCampaign" ADD COLUMN IF NOT EXISTS "followUp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "followUpAt" TIMESTAMP(3);
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "followUpChannel" TEXT;
