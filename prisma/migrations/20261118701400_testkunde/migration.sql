-- Testangebot und Testkunde (Ole, 15.11.2026)
ALTER TABLE "Customer" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Offer" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
