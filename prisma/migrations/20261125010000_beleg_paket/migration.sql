-- Belegpaket per Download-Link (Ole, 24.11.2026). Nur hinzufügend.
CREATE TABLE "BelegPaket" (
    "id" TEXT NOT NULL,
    "titel" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "monat" TEXT,
    "belegIds" TEXT[],
    "empfaenger" TEXT,
    "gesendetAm" TIMESTAMP(3),
    "abgerufen" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BelegPaket_pkey" PRIMARY KEY ("id")
);
