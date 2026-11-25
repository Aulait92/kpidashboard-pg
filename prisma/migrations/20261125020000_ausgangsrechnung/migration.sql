-- Ausgangsrechnungen aus Papierkram für die BWA (Ole, 25.11.2026). Nur hinzufügend.
CREATE TABLE "Ausgangsrechnung" (
    "id" TEXT NOT NULL,
    "nummer" TEXT NOT NULL,
    "datum" DATE NOT NULL,
    "kunde" TEXT NOT NULL,
    "kundennr" TEXT,
    "land" TEXT,
    "netto" DECIMAL(12,2) NOT NULL,
    "ust" DECIMAL(12,2) NOT NULL,
    "brutto" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL,
    "typ" TEXT NOT NULL,
    "notiz" TEXT,
    "quelle" TEXT NOT NULL DEFAULT 'papierkram',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Ausgangsrechnung_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Ausgangsrechnung_nummer_key" ON "Ausgangsrechnung"("nummer");
CREATE INDEX "Ausgangsrechnung_datum_idx" ON "Ausgangsrechnung"("datum");
