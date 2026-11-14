-- Bestandskampagnen: E-Mail als zweiter Kanal, Einwilligung je Kanal, Sperrliste, Protokoll,
-- Zustellstatus je Empfänger und Drosselung je Postfach (Ole, 14.11.2026). Nur hinzufügend.

-- AlterTable
ALTER TABLE "CampaignRecipient" ADD COLUMN     "basis" TEXT,
ADD COLUMN     "bouncedAt" TIMESTAMP(3),
ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'whatsapp',
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "mailMessageId" TEXT,
ADD COLUMN     "optOutAt" TIMESTAMP(3),
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "waMessageId" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "bestandAgentConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "bestandAgentConfirmedById" TEXT,
ADD COLUMN     "bestandLegacyConsentReviewedAt" TIMESTAMP(3),
ADD COLUMN     "bestandMailImprint" TEXT,
ADD COLUMN     "bestandUwgConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "bestandUwgConfirmedById" TEXT;

-- AlterTable
ALTER TABLE "CustomerCampaign" ADD COLUMN     "channelMode" TEXT NOT NULL DEFAULT 'whatsapp_first',
ADD COLUMN     "mailBody" TEXT,
ADD COLUMN     "mailSubject" TEXT,
ADD COLUMN     "senderUserId" TEXT;

-- AlterTable
ALTER TABLE "ExistingCustomer" ADD COLUMN     "emailConsent" TEXT,
ADD COLUMN     "emailConsentAt" TIMESTAMP(3),
ADD COLUMN     "emailConsentSource" TEXT,
ADD COLUMN     "emailOptOutAt" TIMESTAMP(3),
ADD COLUMN     "whatsappConsent" TEXT,
ADD COLUMN     "whatsappConsentAt" TIMESTAMP(3),
ADD COLUMN     "whatsappConsentSource" TEXT;

-- AlterTable
ALTER TABLE "MailConnection" ADD COLUMN     "campaignBackoff" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "campaignErrors" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "campaignIssueAt" TIMESTAMP(3),
ADD COLUMN     "campaignNextAt" TIMESTAMP(3),
ADD COLUMN     "campaignPausedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BestandConsentLog" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "existingCustomerId" TEXT,
    "channel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "source" TEXT,
    "text" TEXT,
    "address" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "actorUserId" TEXT,
    "tokenHash" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BestandConsentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BestandOptOut" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BestandOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BestandConsentLog_tokenHash_key" ON "BestandConsentLog"("tokenHash");

-- CreateIndex
CREATE INDEX "BestandConsentLog_customerId_createdAt_idx" ON "BestandConsentLog"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "BestandConsentLog_existingCustomerId_idx" ON "BestandConsentLog"("existingCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "BestandOptOut_customerId_kind_hash_key" ON "BestandOptOut"("customerId", "kind", "hash");

-- CreateIndex
CREATE INDEX "CampaignRecipient_waMessageId_idx" ON "CampaignRecipient"("waMessageId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_mailMessageId_idx" ON "CampaignRecipient"("mailMessageId");

-- AddForeignKey
ALTER TABLE "BestandConsentLog" ADD CONSTRAINT "BestandConsentLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BestandConsentLog" ADD CONSTRAINT "BestandConsentLog_existingCustomerId_fkey" FOREIGN KEY ("existingCustomerId") REFERENCES "ExistingCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BestandOptOut" ADD CONSTRAINT "BestandOptOut_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

