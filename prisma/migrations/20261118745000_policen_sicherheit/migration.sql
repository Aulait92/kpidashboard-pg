-- Sicherheit vor dem breiten Start der Policen (Ole, 18.11.2026): Virenprüfung, Crypto-Shredding, Löschprotokoll.
-- Nur hinzufügend.
ALTER TABLE "LeadDocument" ADD COLUMN "dateiSchluessel" TEXT;
ALTER TABLE "LeadDocument" ADD COLUMN "virenStatus" TEXT;
ALTER TABLE "LeadFile" ADD COLUMN "virenStatus" TEXT;

CREATE TABLE "Loeschprotokoll" (
    "id" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "customerId" TEXT,
    "ref" TEXT,
    "grund" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Loeschprotokoll_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Loeschprotokoll_art_entityId_key" ON "Loeschprotokoll"("art", "entityId");
CREATE INDEX "Loeschprotokoll_createdAt_idx" ON "Loeschprotokoll"("createdAt");
