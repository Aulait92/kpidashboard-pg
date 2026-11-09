-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "token" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "street" TEXT,
    "zip" TEXT,
    "city" TEXT,
    "term" TEXT NOT NULL,
    "products" JSONB NOT NULL,
    "setupFee" DECIMAL(10,2) NOT NULL,
    "monthlyFee" DECIMAL(10,2) NOT NULL,
    "softwareFee" DECIMAL(10,2) NOT NULL,
    "introMonthlyFee" DECIMAL(10,2),
    "introMonths" INTEGER,
    "specialTerms" TEXT,
    "startDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedName" TEXT,
    "acceptedIp" TEXT,
    "acceptedAgent" TEXT,
    "termsUrl" TEXT,
    "dpaUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_number_key" ON "Offer"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_token_key" ON "Offer"("token");

-- CreateIndex
CREATE INDEX "Offer_dealId_idx" ON "Offer"("dealId");

-- CreateIndex
CREATE INDEX "Offer_status_idx" ON "Offer"("status");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
