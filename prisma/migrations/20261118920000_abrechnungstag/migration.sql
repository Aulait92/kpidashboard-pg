-- Abrechnungstag im Angebot (Ole, 18.11.2026), nur additiv
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "billingDay" INTEGER;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "billingFreeStart" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "billingDay" INTEGER;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "billingStart" TIMESTAMP(3);
