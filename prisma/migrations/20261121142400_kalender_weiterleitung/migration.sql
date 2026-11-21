-- Termine per Weiterleitung blockieren (Ole, 21.11.2026, lib/calendar/termin-weiterleitung.ts): persönliche
-- Termin-Adresse je Kalender und Herkunft der Blockierung (nur Hash der UID, SEQUENCE, Vorkommen; kein Betreff).

-- AlterTable
ALTER TABLE "CalendarBlock" ADD COLUMN "quelle" TEXT,
ADD COLUMN "uidHash" TEXT,
ADD COLUMN "sequence" INTEGER,
ADD COLUMN "vorkommen" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "KalenderWeiterleitung" (
    "calendarKey" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KalenderWeiterleitung_pkey" PRIMARY KEY ("calendarKey")
);

-- CreateIndex
CREATE INDEX "CalendarBlock_calendarKey_uidHash_idx" ON "CalendarBlock"("calendarKey", "uidHash");

-- CreateIndex
CREATE UNIQUE INDEX "KalenderWeiterleitung_token_key" ON "KalenderWeiterleitung"("token");

-- CreateIndex
CREATE INDEX "KalenderWeiterleitung_customerId_idx" ON "KalenderWeiterleitung"("customerId");

-- AddForeignKey
ALTER TABLE "KalenderWeiterleitung" ADD CONSTRAINT "KalenderWeiterleitung_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
