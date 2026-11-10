-- Neue Oberfläche (Vertreter-A) pro Kunde einschaltbar; Standard bleibt die bisherige Oberfläche.
ALTER TABLE "Customer" ADD COLUMN "newUi" BOOLEAN NOT NULL DEFAULT false;
