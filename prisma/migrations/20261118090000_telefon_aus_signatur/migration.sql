-- Telefonnummer aus E-Mail-Signaturen ergänzen: Merker, ob bisherige Antworten schon durchsucht wurden
ALTER TABLE "SalesContact" ADD COLUMN "phoneMailCheckedAt" TIMESTAMP(3);
