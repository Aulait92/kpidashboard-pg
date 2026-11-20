-- Media Buyer: Lernphase, Preisgrenze, selbst pausierte Kampagnen (Ole, 20.11.2026). Nur neue Spalten, keine Datenänderung.
ALTER TABLE "MediaBuyerAction" ADD COLUMN "learningStatus" TEXT;
ALTER TABLE "MediaBuyerAction" ADD COLUMN "learningSince" TIMESTAMP(3);
ALTER TABLE "MediaBuyerAction" ADD COLUMN "pausedCampaignIds" TEXT;
ALTER TABLE "MediaBuyerAction" ADD COLUMN "maxCpl" DECIMAL(12,2);
ALTER TABLE "MediaBuyerAction" ADD COLUMN "cplOverMax" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeliveryPool" ADD COLUMN "maxCpl" DECIMAL(12,2);
