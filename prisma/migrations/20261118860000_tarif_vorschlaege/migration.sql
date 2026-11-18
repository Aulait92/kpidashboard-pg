-- Tarifkatalog lernt aus Einträgen der Vermittler (Ole, 18.11.2026): Vorschläge zum Katalog und übernommene Werte
-- (Laufzeit-Überlagerung). Nur neue Tabellen, nichts wird geändert oder gelöscht.

-- CreateTable
CREATE TABLE "TarifVorschlag" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "gesellschaft" TEXT NOT NULL,
    "sparte" TEXT NOT NULL,
    "datei" TEXT NOT NULL,
    "tarifId" TEXT NOT NULL,
    "merkmal" TEXT NOT NULL,
    "alterWert" TEXT,
    "neuerWert" TEXT NOT NULL,
    "ungeprueft" BOOLEAN NOT NULL DEFAULT false,
    "quelle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offen',
    "entschiedenAm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarifVorschlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarifKatalogWert" (
    "id" TEXT NOT NULL,
    "tarifId" TEXT NOT NULL,
    "merkmal" TEXT NOT NULL,
    "wert" TEXT NOT NULL,
    "gesellschaft" TEXT NOT NULL,
    "sparte" TEXT NOT NULL,
    "datei" TEXT NOT NULL,
    "vermittler" INTEGER NOT NULL DEFAULT 0,
    "uebernommenAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uebernommenVon" TEXT,

    CONSTRAINT "TarifKatalogWert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TarifVorschlag_status_tarifId_merkmal_idx" ON "TarifVorschlag"("status", "tarifId", "merkmal");

-- CreateIndex
CREATE UNIQUE INDEX "TarifVorschlag_customerId_tarifId_merkmal_neuerWert_key" ON "TarifVorschlag"("customerId", "tarifId", "merkmal", "neuerWert");

-- CreateIndex
CREATE UNIQUE INDEX "TarifKatalogWert_tarifId_merkmal_key" ON "TarifKatalogWert"("tarifId", "merkmal");

-- AddForeignKey
ALTER TABLE "TarifVorschlag" ADD CONSTRAINT "TarifVorschlag_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
