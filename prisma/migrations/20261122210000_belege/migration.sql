-- Belege aus GetMyInvoices (Buchhaltung automatisieren)
CREATE TABLE "Beleg" (
    "id" TEXT NOT NULL,
    "gmiUid" INTEGER NOT NULL,
    "typ" TEXT NOT NULL,
    "firma" TEXT,
    "nummer" TEXT,
    "datum" DATE,
    "netto" DECIMAL(12,2),
    "ustSatz" DECIMAL(5,2),
    "brutto" DECIMAL(12,2),
    "waehrung" TEXT NOT NULL DEFAULT 'EUR',
    "dateiname" TEXT,
    "ocrFertig" BOOLEAN NOT NULL DEFAULT false,
    "bankTransactionId" TEXT,
    "zuordnung" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Beleg_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Beleg_gmiUid_key" ON "Beleg"("gmiUid");
CREATE UNIQUE INDEX "Beleg_bankTransactionId_key" ON "Beleg"("bankTransactionId");
CREATE INDEX "Beleg_datum_idx" ON "Beleg"("datum");
ALTER TABLE "Beleg" ADD CONSTRAINT "Beleg_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
