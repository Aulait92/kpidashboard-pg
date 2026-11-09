-- AlterTable
ALTER TABLE "Onboarding" ADD COLUMN     "helpCallAt" TIMESTAMP(3),
ADD COLUMN     "helpCallEventId" TEXT,
ADD COLUMN     "helpCallUrl" TEXT;

-- CreateTable
CREATE TABLE "CustomerPause" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'planned',
    "reason" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'customer',
    "pausedCampaignIds" JSONB,
    "adsNote" TEXT,
    "billingNote" TEXT,
    "appliedAt" TIMESTAMP(3),
    "resumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPause_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerPause_customerId_status_idx" ON "CustomerPause"("customerId", "status");

-- CreateIndex
CREATE INDEX "CustomerPause_status_startsAt_idx" ON "CustomerPause"("status", "startsAt");

-- AddForeignKey
ALTER TABLE "CustomerPause" ADD CONSTRAINT "CustomerPause_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

