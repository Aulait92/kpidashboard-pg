-- Pilot (Ole, 20.11.2026): echter Kunde, kostenlos bis zu diesem Tag (einschließlich), statt Testkunde oder 0-€-Angebot.
ALTER TABLE "Customer" ADD COLUMN "pilotBis" TIMESTAMP(3);
