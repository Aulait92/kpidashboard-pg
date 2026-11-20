-- „Ihre erste Woche“ im Angebot Pay-per-Lead + Software (Ole, 20.11.2026). Nur neue Spalten, keine Datenänderung.
ALTER TABLE "Offer" ADD COLUMN "pplProductKey" TEXT;
ALTER TABLE "Offer" ADD COLUMN "pplLabel" TEXT;
ALTER TABLE "Offer" ADD COLUMN "pplPrice" DECIMAL(10,2);
ALTER TABLE "Offer" ADD COLUMN "pplQuantity" INTEGER;
ALTER TABLE "Offer" ADD COLUMN "pplAutoRenew" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Offer" ADD COLUMN "pplRegisterNr" TEXT;
