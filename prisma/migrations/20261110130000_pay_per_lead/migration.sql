-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "creditAmount" DECIMAL(10,2),
ADD COLUMN     "creditedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "stornoDecidedAt" TIMESTAMP(3),
ADD COLUMN     "stornoNote" TEXT,
ADD COLUMN     "stornoReason" TEXT,
ADD COLUMN     "stornoRequestedAt" TIMESTAMP(3),
ADD COLUMN     "stornoState" TEXT,
ADD COLUMN     "subscriptionId" TEXT;

-- CreateTable
CREATE TABLE "LeadSubscription" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'live',
    "testQuantity" INTEGER,
    "testDays" INTEGER,
    "period" TEXT NOT NULL DEFAULT 'week',
    "goal" INTEGER,
    "startDate" TIMESTAMP(3),
    "price" DECIMAL(10,2) NOT NULL,
    "plzRanges" TEXT,
    "acceptWeak" BOOLEAN NOT NULL DEFAULT true,
    "weakThreshold" INTEGER,
    "acceptCivilServants" BOOLEAN NOT NULL DEFAULT true,
    "onlyWeak" BOOLEAN NOT NULL DEFAULT false,
    "scoreFloor" INTEGER,
    "insurerInclude" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "insurerExclude" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeRules" TEXT,
    "stornoDays" INTEGER,
    "stornoReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "delivery" TEXT NOT NULL DEFAULT 'app',
    "deliveryEmail" TEXT,
    "emailSubject" TEXT,
    "emailTemplate" TEXT,
    "webhookUrl" TEXT,
    "webhookFormat" TEXT NOT NULL DEFAULT 'standard',
    "webhookSecretEnc" TEXT,
    "airtableId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadOrder" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "stripeInvoiceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolLead" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "productKey" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "plz" TEXT,
    "insurer" TEXT,
    "contribution" INTEGER,
    "civilServant" BOOLEAN NOT NULL DEFAULT false,
    "weak" BOOLEAN NOT NULL DEFAULT false,
    "smsVerified" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER,
    "answers" JSONB,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "PoolLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadSubscription_airtableId_key" ON "LeadSubscription"("airtableId");

-- CreateIndex
CREATE INDEX "LeadSubscription_productKey_active_idx" ON "LeadSubscription"("productKey", "active");

-- CreateIndex
CREATE INDEX "LeadSubscription_customerId_idx" ON "LeadSubscription"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadOrder_stripeInvoiceId_key" ON "LeadOrder"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "LeadOrder_status_periodStart_idx" ON "LeadOrder"("status", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "LeadOrder_subscriptionId_periodStart_key" ON "LeadOrder"("subscriptionId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "PoolLead_externalId_key" ON "PoolLead"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PoolLead_leadId_key" ON "PoolLead"("leadId");

-- CreateIndex
CREATE INDEX "PoolLead_phone_createdAt_idx" ON "PoolLead"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "PoolLead_email_createdAt_idx" ON "PoolLead"("email", "createdAt");

-- CreateIndex
CREATE INDEX "PoolLead_status_productKey_idx" ON "PoolLead"("status", "productKey");

-- CreateIndex
CREATE INDEX "Lead_subscriptionId_deliveredAt_idx" ON "Lead"("subscriptionId", "deliveredAt");

-- CreateIndex
CREATE INDEX "Lead_stornoState_idx" ON "Lead"("stornoState");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "LeadSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "LeadOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSubscription" ADD CONSTRAINT "LeadSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOrder" ADD CONSTRAINT "LeadOrder_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "LeadSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

