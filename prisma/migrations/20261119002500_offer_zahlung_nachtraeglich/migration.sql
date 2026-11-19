-- Zahlung nachträglich (Ole, 19.11.2026): Vergütung jeweils nachträglich für den abgelaufenen Leistungsmonat
ALTER TABLE "Offer" ADD COLUMN "paymentInArrears" BOOLEAN NOT NULL DEFAULT false;
