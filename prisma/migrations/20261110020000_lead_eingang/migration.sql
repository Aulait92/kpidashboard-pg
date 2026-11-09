-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "externalId" TEXT;

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "pageId" TEXT,
    "formName" TEXT,
    "customerId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "leadPrice" DECIMAL(12,2),
    "bezugAirtableId" TEXT,
    "questionLabels" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLeadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadSource_formId_key" ON "LeadSource"("formId");

-- CreateIndex
CREATE INDEX "LeadSource_customerId_idx" ON "LeadSource"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_externalId_key" ON "Lead"("externalId");

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "UnassignedLead" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "formId" TEXT,
    "pageId" TEXT,
    "via" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "UnassignedLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnassignedLead_externalId_key" ON "UnassignedLead"("externalId");

-- CreateIndex
CREATE INDEX "UnassignedLead_formId_resolvedAt_idx" ON "UnassignedLead"("formId", "resolvedAt");

