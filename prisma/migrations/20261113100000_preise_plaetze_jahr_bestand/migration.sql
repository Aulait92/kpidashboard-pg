-- Preise (11.11.2026): Berater-Plätze, jährliche Vorauszahlung, Bestandskunden-Modul.
-- Nur hinzufügend. Alt-Angebote und -Kunden bleiben unverändert (NULL = alte Regeln).

-- Angebot: Zusätze als Snapshot
ALTER TABLE "Offer" ADD COLUMN "seats" INTEGER;
ALTER TABLE "Offer" ADD COLUMN "seatsIncluded" INTEGER;
ALTER TABLE "Offer" ADD COLUMN "seatMonthly" DECIMAL(10,2);
ALTER TABLE "Offer" ADD COLUMN "bestandMonthly" DECIMAL(10,2);
ALTER TABLE "Offer" ADD COLUMN "annualPrepay" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Offer" ADD COLUMN "annualFreeMonths" INTEGER;

-- Kunde: Abrechnungsstand
ALTER TABLE "Customer" ADD COLUMN "seatsIncluded" INTEGER;
ALTER TABLE "Customer" ADD COLUMN "seatMonthly" DECIMAL(10,2);
ALTER TABLE "Customer" ADD COLUMN "seatsBilled" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN "billingInterval" TEXT NOT NULL DEFAULT 'month';
ALTER TABLE "Customer" ADD COLUMN "bestandMonthly" DECIMAL(10,2);
ALTER TABLE "Customer" ADD COLUMN "bestandGrandfathered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN "bestandRequestedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "bestandMessageQuota" INTEGER;

-- Bestandsschutz: Wer das Modul schon freigeschaltet hat, behält es kostenlos.
UPDATE "Customer" SET "bestandGrandfathered" = true WHERE "existingCustomersEnabled" = true;
