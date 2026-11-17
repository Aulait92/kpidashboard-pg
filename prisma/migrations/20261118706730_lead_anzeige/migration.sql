-- Anzeige am Lead (Datenbasis Baustein 2, Ole 17.11.2026, lib/anzeige.ts): Plattform, Formular, Kampagne,
-- Anzeigengruppe und Anzeige an Lead und erneuter Einsendung, Funnel-Herkunft am Pool-Lead, Meta-Kosten je Anzeige
-- und Tag. Nur neue, leere Spalten und eine neue Tabelle.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "adPlatform" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "adFormId" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "adCampaignId" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "adCampaignName" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "adSetId" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "adSetName" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "adId" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "adName" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_adFormId_idx" ON "Lead"("adFormId");
CREATE INDEX IF NOT EXISTS "Lead_adCampaignId_idx" ON "Lead"("adCampaignId");
CREATE INDEX IF NOT EXISTS "Lead_adSetId_idx" ON "Lead"("adSetId");
CREATE INDEX IF NOT EXISTS "Lead_adId_idx" ON "Lead"("adId");

ALTER TABLE "LeadReentry" ADD COLUMN IF NOT EXISTS "adPlatform" TEXT;
ALTER TABLE "LeadReentry" ADD COLUMN IF NOT EXISTS "adFormId" TEXT;
ALTER TABLE "LeadReentry" ADD COLUMN IF NOT EXISTS "adCampaignId" TEXT;
ALTER TABLE "LeadReentry" ADD COLUMN IF NOT EXISTS "adCampaignName" TEXT;
ALTER TABLE "LeadReentry" ADD COLUMN IF NOT EXISTS "adSetId" TEXT;
ALTER TABLE "LeadReentry" ADD COLUMN IF NOT EXISTS "adSetName" TEXT;
ALTER TABLE "LeadReentry" ADD COLUMN IF NOT EXISTS "adId" TEXT;
ALTER TABLE "LeadReentry" ADD COLUMN IF NOT EXISTS "adName" TEXT;
CREATE INDEX IF NOT EXISTS "LeadReentry_adCampaignId_idx" ON "LeadReentry"("adCampaignId");
CREATE INDEX IF NOT EXISTS "LeadReentry_adId_idx" ON "LeadReentry"("adId");

ALTER TABLE "PoolLead" ADD COLUMN IF NOT EXISTS "adInfo" JSONB;

CREATE TABLE IF NOT EXISTS "AdSpendDaily" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT,
    "campaignName" TEXT,
    "adSetId" TEXT,
    "adSetName" TEXT,
    "adId" TEXT NOT NULL,
    "adName" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "spend" DECIMAL(12,2) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "metaLeads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdSpendDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdSpendDaily_adAccountId_adId_date_key" ON "AdSpendDaily"("adAccountId", "adId", "date");
CREATE INDEX IF NOT EXISTS "AdSpendDaily_customerId_date_idx" ON "AdSpendDaily"("customerId", "date");
CREATE INDEX IF NOT EXISTS "AdSpendDaily_campaignId_date_idx" ON "AdSpendDaily"("campaignId", "date");
CREATE INDEX IF NOT EXISTS "AdSpendDaily_adSetId_idx" ON "AdSpendDaily"("adSetId");
CREATE INDEX IF NOT EXISTS "AdSpendDaily_adId_idx" ON "AdSpendDaily"("adId");
DO $$ BEGIN
  ALTER TABLE "AdSpendDaily" ADD CONSTRAINT "AdSpendDaily_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
