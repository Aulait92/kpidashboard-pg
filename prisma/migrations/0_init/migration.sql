-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CostKind" AS ENUM ('LEAD', 'OTHER');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'BUYER');

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "airtableId" TEXT,
    "name" TEXT,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "value" DECIMAL(12,2),
    "status" TEXT,
    "owner" TEXT,
    "source" TEXT,
    "product" TEXT,
    "closeDate" TIMESTAMP(3),
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "notes" TEXT,
    "testCharge" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "rawFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealActivity" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "DealActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "region" TEXT,
    "retainerMonthly" DECIMAL(12,2),
    "retainerStart" TIMESTAMP(3),
    "metaAdAccountId" TEXT,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAdSpend" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAdSpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "airtableId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "displayName" TEXT,
    "keywords" TEXT,
    "poolKind" TEXT NOT NULL DEFAULT 'product',
    "sortOrder" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProduct" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "leadGoal" INTEGER,
    "leadPrice" DECIMAL(12,2),
    "startDate" TIMESTAMP(3),
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "testDurationDays" INTEGER,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPool" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "region" TEXT,
    "autopilot" BOOLEAN NOT NULL DEFAULT false,
    "maxDailyBudget" DECIMAL(12,2),
    "campaignKeyword" TEXT,
    "outbrainCampaignKeyword" TEXT,
    "tiktokCampaignKeyword" TEXT,
    "googleCampaignKeyword" TEXT,
    "outbrainMaxDailyBudget" DECIMAL(12,2),
    "tiktokMaxDailyBudget" DECIMAL(12,2),
    "googleMaxDailyBudget" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaBuyerAction" (
    "id" TEXT NOT NULL,
    "poolKey" TEXT NOT NULL,
    "poolLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "leadsMtd" INTEGER NOT NULL,
    "leadsGoal" INTEGER NOT NULL,
    "projected" INTEGER NOT NULL,
    "daysElapsed" INTEGER NOT NULL,
    "daysTotal" INTEGER NOT NULL,
    "prevBudget" DECIMAL(12,2),
    "newBudget" DECIMAL(12,2),
    "campaigns" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaBuyerAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "airtableId" TEXT,
    "source" TEXT,
    "customerId" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "formData" JSONB,
    "outreachAt" TIMESTAMP(3),
    "outreachStatus" TEXT,
    "callbackSnoozedUntil" TIMESTAMP(3),
    "followUpAt" TIMESTAMP(3),
    "followUpNote" TEXT,
    "bezugAirtableId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstContactAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reached" BOOLEAN NOT NULL DEFAULT false,
    "contactAttempts" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT,
    "adChannel" TEXT,
    "acquisitionCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "closeValue" DECIMAL(12,2),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revenue" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Revenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cost" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "kind" "CostKind" NOT NULL,
    "product" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "Cost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnmatchedCampaign" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "spend" DECIMAL(12,2) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnmatchedCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyGoal" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "product" TEXT NOT NULL DEFAULT '',
    "leadsGoal" INTEGER,
    "closedRateGoal" DECIMAL(5,4),
    "revenueGoal" DECIMAL(12,2),
    "marginGoal" DECIMAL(5,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeRequest" (
    "id" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "rawPrompt" TEXT NOT NULL,
    "parsedIntent" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeVariant" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "adText" TEXT NOT NULL DEFAULT '',
    "fbHeadline" TEXT NOT NULL DEFAULT '',
    "mechanic" TEXT NOT NULL DEFAULT '',
    "imagePrompt" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'image',
    "videoUrl" TEXT,
    "durationSec" INTEGER,
    "metaCampaignId" TEXT,
    "metaAdId" TEXT,
    "metaImageHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "telegramMsgId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "CreativeVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT '360dialog',
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "phoneNumber" TEXT,
    "displayName" TEXT,
    "apiKeyEnc" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleCalendarConnection" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "accountEmail" TEXT,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "bookingSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Assistent',
    "systemPrompt" TEXT NOT NULL DEFAULT '',
    "knowledge" TEXT NOT NULL DEFAULT '',
    "personality" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "outreachEnabled" BOOLEAN NOT NULL DEFAULT false,
    "outreachDelayMin" INTEGER NOT NULL DEFAULT 10,
    "videoRoomUrl" TEXT,
    "advisorEmail" TEXT,
    "availabilityIcsUrlEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "whatsAppAccountId" TEXT,
    "leadId" TEXT,
    "contactPhone" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "botActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedUserId" TEXT,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "qualificationSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "needsAttention" BOOLEAN NOT NULL DEFAULT false,
    "attentionReason" TEXT,
    "attentionAt" TIMESTAMP(3),
    "windowExpiresAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT,
    "waMessageId" TEXT,
    "status" TEXT,
    "sentBy" TEXT,
    "sentByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT,
    "conversationId" TEXT,
    "mode" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "calendarEventId" TEXT,
    "meetUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'booked',
    "reminderSentAt" TIMESTAMP(3),
    "advisorEventId" TEXT,
    "manageToken" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'de',
    "purpose" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentOptIn" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentOptIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "preview" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT,
    "meta" JSONB,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deal_airtableId_key" ON "Deal"("airtableId");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "Deal_owner_idx" ON "Deal"("owner");

-- CreateIndex
CREATE INDEX "Deal_wonAt_idx" ON "Deal"("wonAt");

-- CreateIndex
CREATE INDEX "Deal_createdAt_idx" ON "Deal"("createdAt");

-- CreateIndex
CREATE INDEX "DealActivity_dealId_createdAt_idx" ON "DealActivity"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "DealActivity_dealId_scheduledFor_idx" ON "DealActivity"("dealId", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_name_key" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "CustomerAdSpend_customerId_date_idx" ON "CustomerAdSpend"("customerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAdSpend_customerId_accountId_date_key" ON "CustomerAdSpend"("customerId", "accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Product_airtableId_key" ON "Product"("airtableId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "CustomerProduct_productId_idx" ON "CustomerProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProduct_customerId_productId_key" ON "CustomerProduct"("customerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPool_key_key" ON "DeliveryPool"("key");

-- CreateIndex
CREATE INDEX "MediaBuyerAction_poolKey_createdAt_idx" ON "MediaBuyerAction"("poolKey", "createdAt");

-- CreateIndex
CREATE INDEX "MediaBuyerAction_createdAt_idx" ON "MediaBuyerAction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_airtableId_key" ON "Lead"("airtableId");

-- CreateIndex
CREATE INDEX "Lead_customerId_createdAt_idx" ON "Lead"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_customerId_phone_idx" ON "Lead"("customerId", "phone");

-- CreateIndex
CREATE INDEX "Revenue_customerId_occurredAt_idx" ON "Revenue"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "Revenue_occurredAt_idx" ON "Revenue"("occurredAt");

-- CreateIndex
CREATE INDEX "Cost_customerId_occurredAt_idx" ON "Cost"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "Cost_kind_occurredAt_idx" ON "Cost"("kind", "occurredAt");

-- CreateIndex
CREATE INDEX "Cost_kind_product_occurredAt_idx" ON "Cost"("kind", "product", "occurredAt");

-- CreateIndex
CREATE INDEX "UnmatchedCampaign_channel_idx" ON "UnmatchedCampaign"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_customerId_idx" ON "User"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyGoal_monthKey_product_key" ON "MonthlyGoal"("monthKey", "product");

-- CreateIndex
CREATE INDEX "CreativeRequest_telegramChatId_createdAt_idx" ON "CreativeRequest"("telegramChatId", "createdAt");

-- CreateIndex
CREATE INDEX "CreativeVariant_requestId_status_idx" ON "CreativeVariant"("requestId", "status");

-- CreateIndex
CREATE INDEX "CreativeVariant_telegramMsgId_idx" ON "CreativeVariant"("telegramMsgId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAccount_customerId_key" ON "WhatsAppAccount"("customerId");

-- CreateIndex
CREATE INDEX "WhatsAppAccount_phoneNumberId_idx" ON "WhatsAppAccount"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarConnection_customerId_key" ON "GoogleCalendarConnection"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarConnection_bookingSlug_key" ON "GoogleCalendarConnection"("bookingSlug");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfig_customerId_key" ON "AgentConfig"("customerId");

-- CreateIndex
CREATE INDEX "Conversation_customerId_status_lastMessageAt_idx" ON "Conversation"("customerId", "status", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_customerId_contactPhone_key" ON "Conversation"("customerId", "contactPhone");

-- CreateIndex
CREATE UNIQUE INDEX "Message_waMessageId_key" ON "Message"("waMessageId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_manageToken_key" ON "Appointment"("manageToken");

-- CreateIndex
CREATE INDEX "Appointment_customerId_startsAt_idx" ON "Appointment"("customerId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_customerId_name_language_key" ON "MessageTemplate"("customerId", "name", "language");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentOptIn_customerId_contactPhone_key" ON "ConsentOptIn"("customerId", "contactPhone");

-- CreateIndex
CREATE INDEX "UsageEvent_customerId_at_idx" ON "UsageEvent"("customerId", "at");

-- CreateIndex
CREATE INDEX "UsageEvent_type_at_idx" ON "UsageEvent"("type", "at");

-- AddForeignKey
ALTER TABLE "DealActivity" ADD CONSTRAINT "DealActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealActivity" ADD CONSTRAINT "DealActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAdSpend" ADD CONSTRAINT "CustomerAdSpend_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProduct" ADD CONSTRAINT "CustomerProduct_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProduct" ADD CONSTRAINT "CustomerProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeVariant" ADD CONSTRAINT "CreativeVariant_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CreativeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppAccount" ADD CONSTRAINT "WhatsAppAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConfig" ADD CONSTRAINT "AgentConfig_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_whatsAppAccountId_fkey" FOREIGN KEY ("whatsAppAccountId") REFERENCES "WhatsAppAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentOptIn" ADD CONSTRAINT "ConsentOptIn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

