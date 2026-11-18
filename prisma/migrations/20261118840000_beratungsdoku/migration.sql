-- Paket B (Ole, 18.11.2026): Beratungsdokumentation als Angebot. Schalter je Vermittler (Standard aus) und je Fassung
-- eine Zeile mit Versand und Bestätigung per Klick. Nur additiv.
-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "beratungsdokuAn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "beratungsdokuAnAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Beratungsdoku" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "inhalt" JSONB NOT NULL,
    "ansprache" TEXT NOT NULL DEFAULT 'sie',
    "inhaltHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'abgelegt',
    "token" TEXT,
    "gesendetAt" TIMESTAMP(3),
    "gesendetAn" TEXT,
    "dateiId" TEXT,
    "bestaetigtAt" TIMESTAMP(3),
    "bestaetigtDateiId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beratungsdoku_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Beratungsdoku_token_key" ON "Beratungsdoku"("token");

-- CreateIndex
CREATE INDEX "Beratungsdoku_customerId_createdAt_idx" ON "Beratungsdoku"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Beratungsdoku_leadId_idx" ON "Beratungsdoku"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Beratungsdoku_appointmentId_inhaltHash_key" ON "Beratungsdoku"("appointmentId", "inhaltHash");

-- AddForeignKey
ALTER TABLE "Beratungsdoku" ADD CONSTRAINT "Beratungsdoku_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beratungsdoku" ADD CONSTRAINT "Beratungsdoku_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

