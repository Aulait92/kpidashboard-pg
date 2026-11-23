CREATE TABLE "MonatsPaket" (
    "id" TEXT NOT NULL,
    "monat" TEXT NOT NULL,
    "gesendetAm" TIMESTAMP(3),
    "empfaenger" TEXT,
    "anzahl" INTEGER NOT NULL DEFAULT 0,
    "zahllast" DECIMAL(12,2),
    "erinnertAm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonatsPaket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MonatsPaket_monat_key" ON "MonatsPaket"("monat");
