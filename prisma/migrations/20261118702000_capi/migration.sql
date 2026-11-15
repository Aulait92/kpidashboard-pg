-- Rückmeldung an Meta (Conversions API für CRM, Ole 15.11.2026): Schalter und Dataset je Kunde, Postausgang je Lead und Stufe
-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "capiEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "metaDatasetCheckedAt" TIMESTAMP(3),
ADD COLUMN     "metaDatasetError" TEXT,
ADD COLUMN     "metaDatasetId" TEXT,
ADD COLUMN     "metaDatasetSource" TEXT;

-- CreateTable
CREATE TABLE "CapiEvent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapiEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CapiEvent_customerId_status_createdAt_idx" ON "CapiEvent"("customerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CapiEvent_status_nextAttemptAt_idx" ON "CapiEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "CapiEvent_leadId_stage_key" ON "CapiEvent"("leadId", "stage");

-- AddForeignKey
ALTER TABLE "CapiEvent" ADD CONSTRAINT "CapiEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapiEvent" ADD CONSTRAINT "CapiEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

