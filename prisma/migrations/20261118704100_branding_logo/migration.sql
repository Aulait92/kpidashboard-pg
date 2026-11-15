-- Branding: Logo für Präsentationen
ALTER TABLE "Customer" ADD COLUMN "brandLogo" BYTEA;
ALTER TABLE "Customer" ADD COLUMN "brandLogoType" TEXT;
ALTER TABLE "Customer" ADD COLUMN "brandLogoSource" TEXT;
ALTER TABLE "Customer" ADD COLUMN "brandLogoConfirmedAt" TIMESTAMP(3);
