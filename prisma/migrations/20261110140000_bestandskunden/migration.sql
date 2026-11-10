-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "existingCustomersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ExistingCustomer" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalNo" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "birthday" TIMESTAMP(3),
    "street" TEXT,
    "zip" TEXT,
    "city" TEXT,
    "lines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nextRenewal" TIMESTAMP(3),
    "consentAt" TIMESTAMP(3),
    "consentNote" TEXT,
    "optOutAt" TIMESTAMP(3),
    "lastCampaignAt" TIMESTAMP(3),
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExistingCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExistingContract" (
    "id" TEXT NOT NULL,
    "existingCustomerId" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "product" TEXT,
    "startDate" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),

    CONSTRAINT "ExistingContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCampaign" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "occasion" TEXT NOT NULL,
    "segment" JSONB NOT NULL,
    "topic" TEXT,
    "dailyLimit" INTEGER NOT NULL DEFAULT 150,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "existingCustomerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "reason" TEXT,
    "sentAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "conversationId" TEXT,
    "leadId" TEXT,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExistingCustomer_customerId_phone_idx" ON "ExistingCustomer"("customerId", "phone");

-- CreateIndex
CREATE INDEX "ExistingCustomer_customerId_email_idx" ON "ExistingCustomer"("customerId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ExistingCustomer_customerId_externalNo_key" ON "ExistingCustomer"("customerId", "externalNo");

-- CreateIndex
CREATE INDEX "ExistingContract_existingCustomerId_idx" ON "ExistingContract"("existingCustomerId");

-- CreateIndex
CREATE INDEX "CustomerCampaign_customerId_status_idx" ON "CustomerCampaign"("customerId", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_existingCustomerId_key" ON "CampaignRecipient"("campaignId", "existingCustomerId");

-- AddForeignKey
ALTER TABLE "ExistingCustomer" ADD CONSTRAINT "ExistingCustomer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingContract" ADD CONSTRAINT "ExistingContract_existingCustomerId_fkey" FOREIGN KEY ("existingCustomerId") REFERENCES "ExistingCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCampaign" ADD CONSTRAINT "CustomerCampaign_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CustomerCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_existingCustomerId_fkey" FOREIGN KEY ("existingCustomerId") REFERENCES "ExistingCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

