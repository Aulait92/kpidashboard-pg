-- Garantiefälle (Lead-Garantie, Break-even-Garantie), nur hinzufügend.
CREATE TABLE "GarantieFall" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "monat" TEXT NOT NULL,
    "periodeVon" TIMESTAMP(3) NOT NULL,
    "periodeBis" TIMESTAMP(3) NOT NULL,
    "kennzahlen" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offen',
    "grund" TEXT,
    "entschiedenVon" TEXT,
    "entschiedenAm" TIMESTAMP(3),
    "stripeRef" TEXT,
    "betrag" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GarantieFall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GarantieFall_status_idx" ON "GarantieFall"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GarantieFall_customerId_art_monat_key" ON "GarantieFall"("customerId", "art", "monat");

-- AddForeignKey
ALTER TABLE "GarantieFall" ADD CONSTRAINT "GarantieFall_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
