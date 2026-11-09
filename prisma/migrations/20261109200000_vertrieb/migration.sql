-- CreateEnum
CREATE TYPE "SalesStage" AS ENUM ('NEU', 'NICHT_ERREICHT', 'WIEDERVORLAGE', 'INTERESSE', 'TERMIN', 'GEWONNEN', 'SPAETER', 'VERLOREN', 'UNGUELTIG');

-- CreateEnum
CREATE TYPE "SalesCustomerStage" AS ENUM ('VERTRAG', 'ONBOARDING', 'TEST', 'AKTIV', 'PAUSIERT', 'GEKUENDIGT');

-- CreateEnum
CREATE TYPE "SalesLossReason" AS ENUM ('KEIN_BEDARF', 'HAT_ANBIETER', 'UEBER_ALLIANZ', 'ZU_TEUER', 'KEIN_INTERESSE', 'SONSTIGES');

-- CreateEnum
CREATE TYPE "SalesActivityType" AS ENUM ('ANRUF', 'EMAIL', 'NOTIZ', 'STATUS', 'COLD_MAIL', 'LINKEDIN', 'TERMIN', 'IMPORT');

-- CreateEnum
CREATE TYPE "SalesTaskType" AS ENUM ('ANRUF', 'NACHFASSEN', 'UNTERLAGEN', 'TERMIN', 'SONSTIGES');

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "salesContactId" TEXT,
ALTER COLUMN "dealId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SalesContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "fax" TEXT,
    "street" TEXT,
    "zip" TEXT,
    "city" TEXT,
    "ratingValue" DOUBLE PRECISION,
    "ratingCount" INTEGER,
    "openingHours" TEXT,
    "url" TEXT,
    "description" TEXT,
    "salutation" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "leaderNames" TEXT,
    "agencyType" TEXT,
    "teamSize" INTEGER,
    "potentialScore" INTEGER,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "xingUrl" TEXT,
    "linkedinUrl" TEXT,
    "linkedinStatus" TEXT,
    "linkedinRequestAt" TIMESTAMP(3),
    "linkedinConnectedAt" TIMESTAMP(3),
    "linkedinMessageAt" TIMESTAMP(3),
    "linkedinReplyAt" TIMESTAMP(3),
    "linkedinList" TEXT,
    "linkedinTags" TEXT,
    "stage" "SalesStage" NOT NULL DEFAULT 'NEU',
    "lossReason" "SalesLossReason",
    "competitor" TEXT,
    "callAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastContactAt" TIMESTAMP(3),
    "legacyStatus" TEXT,
    "customerStage" "SalesCustomerStage",
    "products" TEXT,
    "monthlyValue" INTEGER,
    "contractStart" TIMESTAMP(3),
    "customerSince" TIMESTAMP(3),
    "customerSource" TEXT,
    "customerSourceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesActivity" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" "SalesActivityType" NOT NULL,
    "outcome" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTask" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "title" TEXT NOT NULL,
    "type" "SalesTaskType" NOT NULL DEFAULT 'SONSTIGES',
    "note" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesCampaign" (
    "id" TEXT NOT NULL,
    "instantlyId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesCampaignLead" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" TEXT,
    "sentAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "lastOpenAt" TIMESTAMP(3),
    "lastReplyAt" TIMESTAMP(3),
    "bounced" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "interest" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesCampaignLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesEmail" (
    "id" TEXT NOT NULL,
    "instantlyId" TEXT,
    "contactId" TEXT NOT NULL,
    "campaign" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'IN',
    "subject" TEXT,
    "text" TEXT,
    "html" TEXT,
    "fromEmail" TEXT,
    "threadId" TEXT,
    "isAutoReply" BOOLEAN NOT NULL DEFAULT false,
    "sentiment" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesLinkedInEvent" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "source" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "url" TEXT,
    "status" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesLinkedInEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesMeeting" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "calendlyUri" TEXT,
    "eventUri" TEXT,
    "title" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "location" TEXT,
    "joinUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'GEPLANT',
    "cancelReason" TEXT,
    "canceledBy" TEXT,
    "rescheduleUrl" TEXT,
    "cancelUrl" TEXT,
    "answers" TEXT,
    "utmSource" TEXT,
    "inviteeName" TEXT,
    "inviteeEmail" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInboundLead" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "source" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "campaign" TEXT,
    "ad" TEXT,
    "form" TEXT,
    "answers" TEXT,
    "created" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesInboundLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesContact_email_key" ON "SalesContact"("email");

-- CreateIndex
CREATE INDEX "SalesContact_stage_idx" ON "SalesContact"("stage");

-- CreateIndex
CREATE INDEX "SalesContact_customerStage_idx" ON "SalesContact"("customerStage");

-- CreateIndex
CREATE INDEX "SalesContact_linkedinStatus_idx" ON "SalesContact"("linkedinStatus");

-- CreateIndex
CREATE INDEX "SalesContact_zip_idx" ON "SalesContact"("zip");

-- CreateIndex
CREATE INDEX "SalesContact_city_idx" ON "SalesContact"("city");

-- CreateIndex
CREATE INDEX "SalesActivity_contactId_occurredAt_idx" ON "SalesActivity"("contactId", "occurredAt");

-- CreateIndex
CREATE INDEX "SalesTask_doneAt_dueAt_idx" ON "SalesTask"("doneAt", "dueAt");

-- CreateIndex
CREATE INDEX "SalesTask_contactId_idx" ON "SalesTask"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesCampaign_instantlyId_key" ON "SalesCampaign"("instantlyId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesCampaign_name_key" ON "SalesCampaign"("name");

-- CreateIndex
CREATE INDEX "SalesCampaignLead_campaignId_idx" ON "SalesCampaignLead"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesCampaignLead_contactId_campaignId_key" ON "SalesCampaignLead"("contactId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesEmail_instantlyId_key" ON "SalesEmail"("instantlyId");

-- CreateIndex
CREATE INDEX "SalesEmail_contactId_sentAt_idx" ON "SalesEmail"("contactId", "sentAt");

-- CreateIndex
CREATE INDEX "SalesLinkedInEvent_contactId_idx" ON "SalesLinkedInEvent"("contactId");

-- CreateIndex
CREATE INDEX "SalesLinkedInEvent_createdAt_idx" ON "SalesLinkedInEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SalesMeeting_calendlyUri_key" ON "SalesMeeting"("calendlyUri");

-- CreateIndex
CREATE INDEX "SalesMeeting_contactId_idx" ON "SalesMeeting"("contactId");

-- CreateIndex
CREATE INDEX "SalesMeeting_startAt_idx" ON "SalesMeeting"("startAt");

-- CreateIndex
CREATE INDEX "SalesInboundLead_createdAt_idx" ON "SalesInboundLead"("createdAt");

-- CreateIndex
CREATE INDEX "SalesInboundLead_contactId_idx" ON "SalesInboundLead"("contactId");

-- CreateIndex
CREATE INDEX "Offer_salesContactId_idx" ON "Offer"("salesContactId");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_salesContactId_fkey" FOREIGN KEY ("salesContactId") REFERENCES "SalesContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesActivity" ADD CONSTRAINT "SalesActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SalesContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTask" ADD CONSTRAINT "SalesTask_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SalesContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCampaignLead" ADD CONSTRAINT "SalesCampaignLead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SalesContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCampaignLead" ADD CONSTRAINT "SalesCampaignLead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SalesCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesEmail" ADD CONSTRAINT "SalesEmail_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SalesContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLinkedInEvent" ADD CONSTRAINT "SalesLinkedInEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SalesContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesMeeting" ADD CONSTRAINT "SalesMeeting_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SalesContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInboundLead" ADD CONSTRAINT "SalesInboundLead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SalesContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

