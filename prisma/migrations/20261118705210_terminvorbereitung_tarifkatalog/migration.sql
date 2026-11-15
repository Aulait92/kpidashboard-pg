-- Neue Terminvorbereitung mit Tarifkatalog (Ole, 15.11.2026): Tarifauswahl und abgehakte Punkte je Termin,
-- Gesellschaft(en) je Kunde, eigene Tarife und „Meine Merkmale“. Nur Ergänzungen, nichts wird gelöscht.
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "klaerenErledigt" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tarifauswahl" JSONB;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "tarifGesellschaften" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "EigenerTarif" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "sparte" TEXT NOT NULL,
    "gesellschaft" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kurz" TEXT NOT NULL,
    "werte" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EigenerTarif_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeraterMerkmale" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userKey" TEXT NOT NULL DEFAULT '',
    "sparte" TEXT NOT NULL,
    "merkmalKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bausteinKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeraterMerkmale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EigenerTarif_customerId_sparte_idx" ON "EigenerTarif"("customerId", "sparte");

-- CreateIndex
CREATE UNIQUE INDEX "BeraterMerkmale_customerId_userKey_sparte_key" ON "BeraterMerkmale"("customerId", "userKey", "sparte");

-- AddForeignKey
ALTER TABLE "EigenerTarif" ADD CONSTRAINT "EigenerTarif_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeraterMerkmale" ADD CONSTRAINT "BeraterMerkmale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

