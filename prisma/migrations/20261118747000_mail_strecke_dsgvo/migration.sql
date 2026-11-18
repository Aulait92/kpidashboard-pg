-- Mail-Strecke für Leads ohne WhatsApp (E1) und Betroffenenrechte (D0), Ole 18.11.2026. Nur hinzufügend.
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "bookedVia" TEXT;

-- CreateTable
CREATE TABLE "LeadMailStrecke" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "ausloeser" TEXT NOT NULL,
    "schritt" TEXT NOT NULL DEFAULT 'neu',
    "antworten" JSONB,
    "zeiten" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "erstmailAt" TIMESTAMP(3),
    "erstmailGrund" TEXT,
    "antwortAt" TIMESTAMP(3),
    "appointmentId" TEXT,
    "gebuchtAt" TIMESTAMP(3),
    "buchungAt" TIMESTAMP(3),
    "stufe" INTEGER NOT NULL DEFAULT 0,
    "stufeAt" TIMESTAMP(3),
    "smsZahl" INTEGER NOT NULL DEFAULT 0,
    "smsAt" TIMESTAMP(3),
    "reaktionAt" TIMESTAMP(3),
    "stopGrund" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadMailStrecke_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DsgvoAnfrage" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT,
    "art" TEXT NOT NULL,
    "kanal" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offen',
    "eingangAt" TIMESTAMP(3) NOT NULL,
    "fristBis" TIMESTAMP(3) NOT NULL,
    "bestaetigtAt" TIMESTAMP(3),
    "auszug" TEXT,
    "quelleId" TEXT,
    "erledigtAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DsgvoAnfrage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DsgvoAnfrageLog" (
    "id" TEXT NOT NULL,
    "anfrageId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "aktion" TEXT NOT NULL,
    "details" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loeschenAb" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DsgvoAnfrageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSperre" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "umfang" TEXT NOT NULL,
    "anfrageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSperre_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadMailStrecke_leadId_key" ON "LeadMailStrecke"("leadId");

-- CreateIndex
CREATE INDEX "LeadMailStrecke_customerId_schritt_idx" ON "LeadMailStrecke"("customerId", "schritt");

-- CreateIndex
CREATE INDEX "LeadMailStrecke_schritt_erstmailAt_idx" ON "LeadMailStrecke"("schritt", "erstmailAt");

-- CreateIndex
CREATE UNIQUE INDEX "DsgvoAnfrage_quelleId_key" ON "DsgvoAnfrage"("quelleId");

-- CreateIndex
CREATE INDEX "DsgvoAnfrage_customerId_status_idx" ON "DsgvoAnfrage"("customerId", "status");

-- CreateIndex
CREATE INDEX "DsgvoAnfrage_leadId_idx" ON "DsgvoAnfrage"("leadId");

-- CreateIndex
CREATE INDEX "DsgvoAnfrageLog_anfrageId_idx" ON "DsgvoAnfrageLog"("anfrageId");

-- CreateIndex
CREATE INDEX "DsgvoAnfrageLog_loeschenAb_idx" ON "DsgvoAnfrageLog"("loeschenAb");

-- CreateIndex
CREATE INDEX "LeadSperre_customerId_idx" ON "LeadSperre"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSperre_customerId_kind_hash_umfang_key" ON "LeadSperre"("customerId", "kind", "hash", "umfang");

-- AddForeignKey
ALTER TABLE "LeadMailStrecke" ADD CONSTRAINT "LeadMailStrecke_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsgvoAnfrageLog" ADD CONSTRAINT "DsgvoAnfrageLog_anfrageId_fkey" FOREIGN KEY ("anfrageId") REFERENCES "DsgvoAnfrage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

