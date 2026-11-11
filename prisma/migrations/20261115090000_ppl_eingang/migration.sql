-- Pay-per-Lead-Eingang aus Airtable (alle Leads inkl. abgelehnter) für die Auswertung
CREATE TABLE "PplIntake" (
    "id" TEXT NOT NULL,
    "airtableId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "productKey" TEXT,
    "source" TEXT,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PplIntake_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PplIntake_airtableId_key" ON "PplIntake"("airtableId");
CREATE INDEX "PplIntake_receivedAt_idx" ON "PplIntake"("receivedAt");
CREATE INDEX "PplIntake_productKey_receivedAt_idx" ON "PplIntake"("productKey", "receivedAt");
