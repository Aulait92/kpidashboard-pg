-- Annahme: Unternehmereigenschaft und Häkchen zum Startpreis; Kündigung im Kundenbereich
ALTER TABLE "Offer" ADD COLUMN "acceptedCompany" TEXT;
ALTER TABLE "Offer" ADD COLUMN "acceptedVatId" TEXT;
ALTER TABLE "Offer" ADD COLUMN "acceptedAsBusiness" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Offer" ADD COLUMN "acceptedPriceStep" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Customer" ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "cancelEffectiveAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "cancelRequestedBy" TEXT;
ALTER TABLE "Customer" ADD COLUMN "cancelReason" TEXT;
