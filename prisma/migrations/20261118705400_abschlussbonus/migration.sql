-- Abschlussbonus auf die Einrichtung bei Annahme und Zahlung am selben Tag (Ole, 16.11.2026)
ALTER TABLE "Offer" ADD COLUMN "abschlussBonus" DECIMAL(10,2);
ALTER TABLE "Offer" ADD COLUMN "abschlussBonusBis" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN "abschlussBonusGewaehrt" DECIMAL(10,2);
