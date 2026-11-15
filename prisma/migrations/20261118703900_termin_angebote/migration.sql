-- Angebote zum Termin (für Präsentation)
ALTER TABLE "Appointment" ADD COLUMN "offersJson" JSONB;
ALTER TABLE "Appointment" ADD COLUMN "offersConfirmedAt" TIMESTAMP(3);
