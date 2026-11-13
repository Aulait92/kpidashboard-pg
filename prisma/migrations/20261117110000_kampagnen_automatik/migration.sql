-- AlterTable
ALTER TABLE "BudgetChange" ADD COLUMN     "metaNote" TEXT,
ADD COLUMN     "metaStatus" TEXT NOT NULL DEFAULT 'none';

-- AlterTable
ALTER TABLE "CampaignRun" ADD COLUMN     "fatigue" JSONB,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'neu',
ADD COLUMN     "refreshAdSetId" TEXT,
ADD COLUMN     "refreshCampaignId" TEXT,
ADD COLUMN     "sourceRunId" TEXT,
ADD COLUMN     "trigger" TEXT NOT NULL DEFAULT 'manuell';

-- CreateTable
CREATE TABLE "CampaignAutomationSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "budgetSync" BOOLEAN NOT NULL DEFAULT true,
    "autoLaunch" BOOLEAN NOT NULL DEFAULT true,
    "refresh" BOOLEAN NOT NULL DEFAULT true,
    "refreshMaxFrequency" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "refreshCtrDrop" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "refreshCplRise" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "refreshMinSpendEur" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignAutomationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignWish" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "problems" JSONB,
    "runId" TEXT,
    "taskId" TEXT,
    "bookingId" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignWish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignHealth" (
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "lastRefreshAt" TIMESTAMP(3),
    "lastResult" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignHealth_pkey" PRIMARY KEY ("campaignId")
);

-- CreateIndex
CREATE INDEX "CampaignWish_status_idx" ON "CampaignWish"("status");

-- CreateIndex
CREATE INDEX "CampaignWish_customerId_product_idx" ON "CampaignWish"("customerId", "product");

-- CreateIndex
CREATE INDEX "CampaignHealth_customerId_idx" ON "CampaignHealth"("customerId");

-- CreateIndex
CREATE INDEX "CampaignRun_refreshCampaignId_createdAt_idx" ON "CampaignRun"("refreshCampaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "CampaignWish" ADD CONSTRAINT "CampaignWish_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignHealth" ADD CONSTRAINT "CampaignHealth_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
