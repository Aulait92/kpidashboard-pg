-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'software';

-- AlterTable
ALTER TABLE "SalesContact" ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "Onboarding" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "offerId" TEXT,
    "salesContactId" TEXT,
    "package" TEXT NOT NULL DEFAULT 'software',
    "status" TEXT NOT NULL DEFAULT 'running',
    "startDate" TIMESTAMP(3),
    "welcomeSentAt" TIMESTAMP(3),
    "kickoffAt" TIMESTAMP(3),
    "questionnaire" JSONB,
    "questionnaireAt" TIMESTAMP(3),
    "metaAccessAt" TIMESTAMP(3),
    "websiteInfo" JSONB,
    "websiteCheckedAt" TIMESTAMP(3),
    "campaignReadyAt" TIMESTAMP(3),
    "testLeadAt" TIMESTAMP(3),
    "liveAt" TIMESTAMP(3),
    "lastReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Onboarding_customerId_key" ON "Onboarding"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Onboarding_offerId_key" ON "Onboarding"("offerId");

-- CreateIndex
CREATE INDEX "Onboarding_status_idx" ON "Onboarding"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesContact_customerId_key" ON "SalesContact"("customerId");

-- AddForeignKey
ALTER TABLE "SalesContact" ADD CONSTRAINT "SalesContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Onboarding" ADD CONSTRAINT "Onboarding_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

