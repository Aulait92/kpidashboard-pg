-- Eigenes Produkt bei Sparte „Sonstiges“ mit eigenen Provisionssätzen (Ole, 14.11.2026)
ALTER TABLE "LeadContract" ADD COLUMN "productName" TEXT;
ALTER TABLE "LeadContract" ADD COLUMN "rateAbschluss" DECIMAL(7,4);
ALTER TABLE "LeadContract" ADD COLUMN "rateBestand" DECIMAL(7,4);
ALTER TABLE "Customer" ADD COLUMN "customProducts" JSONB;
