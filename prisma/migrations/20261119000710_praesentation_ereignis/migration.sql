-- Messung der Beratungspräsentation (Ole, 19.11.2026): Folie erreicht und Zusage je Termin, Quelle und Splittest-Variante.
CREATE TABLE IF NOT EXISTS "PraesentationEreignis" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "quelle" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "folie" TEXT NOT NULL DEFAULT '',
    "variante" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PraesentationEreignis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PraesentationEreignis_appointmentId_quelle_art_folie_key" ON "PraesentationEreignis"("appointmentId", "quelle", "art", "folie");
CREATE INDEX IF NOT EXISTS "PraesentationEreignis_customerId_createdAt_idx" ON "PraesentationEreignis"("customerId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "PraesentationEreignis" ADD CONSTRAINT "PraesentationEreignis_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PraesentationEreignis" ADD CONSTRAINT "PraesentationEreignis_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
