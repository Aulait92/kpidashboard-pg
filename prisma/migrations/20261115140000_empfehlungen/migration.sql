-- Zusatzmodul „Empfehlungen & Bewertungen“ (12.11.2026). Nur hinzufügend, Modul standardmäßig aus.
-- Kunde: Modulstand (Testphase, Preis, Kündigung), weggeklickte Hinweise; Angebot: Modulpreis;
-- Lead: Herkunft aus einer Empfehlung, Dank verschickt; neue Tabellen ReviewSettings,
-- ReviewRequest, ReferralLink, ModuleAnnouncement.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "empfehlungCancelAt" TIMESTAMP(3),
ADD COLUMN     "empfehlungEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "empfehlungFree" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "empfehlungMonthly" DECIMAL(10,2),
ADD COLUMN     "empfehlungSince" TIMESTAMP(3),
ADD COLUMN     "empfehlungTrialEndsAt" TIMESTAMP(3),
ADD COLUMN     "empfehlungTrialReminded" TIMESTAMP(3),
ADD COLUMN     "moduleHintsDismissed" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "referralLinkId" TEXT,
ADD COLUMN     "referralThankedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "empfehlungMonthly" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "ReviewSettings" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "googleReviewUrl" TEXT,
    "reviewDelayDays" INTEGER NOT NULL DEFAULT 7,
    "referralDelayDays" INTEGER NOT NULL DEFAULT 21,
    "reviewText" TEXT,
    "thanksText" TEXT,
    "unhappyText" TEXT,
    "referralText" TEXT,
    "referralThanksText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "reviewDueAt" TIMESTAMP(3) NOT NULL,
    "reviewSentAt" TIMESTAMP(3),
    "sendMode" TEXT,
    "conversationId" TEXT,
    "sentiment" TEXT,
    "comment" TEXT,
    "answeredAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "googleClicks" INTEGER NOT NULL DEFAULT 0,
    "googleClickAt" TIMESTAMP(3),
    "referralStatus" TEXT NOT NULL DEFAULT 'waiting',
    "referralDueAt" TIMESTAMP(3),
    "referralSentAt" TIMESTAMP(3),
    "referralViews" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralLink" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "leadId" TEXT,
    "existingCustomerId" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleAnnouncement" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "sentBy" TEXT,

    CONSTRAINT "ModuleAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewSettings_customerId_key" ON "ReviewSettings"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_leadId_key" ON "ReviewRequest"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_token_key" ON "ReviewRequest"("token");

-- CreateIndex
CREATE INDEX "ReviewRequest_customerId_createdAt_idx" ON "ReviewRequest"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewRequest_status_reviewDueAt_idx" ON "ReviewRequest"("status", "reviewDueAt");

-- CreateIndex
CREATE INDEX "ReviewRequest_referralStatus_referralDueAt_idx" ON "ReviewRequest"("referralStatus", "referralDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralLink_token_key" ON "ReferralLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralLink_leadId_key" ON "ReferralLink"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralLink_existingCustomerId_key" ON "ReferralLink"("existingCustomerId");

-- CreateIndex
CREATE INDEX "ReferralLink_customerId_idx" ON "ReferralLink"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleAnnouncement_key_key" ON "ModuleAnnouncement"("key");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_referralLinkId_fkey" FOREIGN KEY ("referralLinkId") REFERENCES "ReferralLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSettings" ADD CONSTRAINT "ReviewSettings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralLink" ADD CONSTRAINT "ReferralLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralLink" ADD CONSTRAINT "ReferralLink_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralLink" ADD CONSTRAINT "ReferralLink_existingCustomerId_fkey" FOREIGN KEY ("existingCustomerId") REFERENCES "ExistingCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
