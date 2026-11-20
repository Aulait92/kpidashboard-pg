-- Einwilligungsnachweis je Pay-per-Lead (Auflage L3, docs/recht/pkv-funnel.md, § 7a UWG): Wortlaut, Fassung,
-- Zeitpunkt, Kanäle, Knopftext und Funnel (lib/ppl/einwilligung-nachweis.ts)
ALTER TABLE "PoolLead" ADD COLUMN "consentData" JSONB;
