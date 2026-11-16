-- Weitere Telefonnummern und Herkunft weiterer E-Mail-Adressen (Spalte detectedData) von Vertriebskontakten (Ole, 16.11.2026).
-- Rein additiv: neue Tabelle und eine neue, leere Spalte. Hauptadresse und Hauptnummer bleiben unverändert.
ALTER TABLE "SalesContact" ADD COLUMN "detectedData" JSONB;

CREATE TABLE "SalesContactPhone" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FESTNETZ',
    "source" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesContactPhone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesContactPhone_contactId_phone_key" ON "SalesContactPhone"("contactId", "phone");
CREATE INDEX "SalesContactPhone_phone_idx" ON "SalesContactPhone"("phone");

ALTER TABLE "SalesContactPhone" ADD CONSTRAINT "SalesContactPhone_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SalesContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
