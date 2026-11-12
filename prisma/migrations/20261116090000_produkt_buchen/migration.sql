-- CreateTable
CREATE TABLE "ProductBooking" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "catalogKey" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "dailyBudget" DECIMAL(10,2) NOT NULL,
    "startWish" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'setup',
    "monthlyBudgetFrom" INTEGER NOT NULL,
    "monthlyBudgetTo" INTEGER NOT NULL,
    "feeFrom" DECIMAL(10,2),
    "feeTo" DECIMAL(10,2),
    "setupFee" DECIMAL(10,2) NOT NULL,
    "tierChange" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "pricing" TEXT NOT NULL DEFAULT 'list',
    "reason" TEXT,
    "setupStatus" TEXT NOT NULL DEFAULT 'none',
    "setupItemId" TEXT,
    "feeStatus" TEXT NOT NULL DEFAULT 'none',
    "stripeNote" TEXT,
    "note" TEXT,
    "decidedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "endRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCatalogItem" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "benefit" TEXT NOT NULL,
    "proven" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCatalogItem_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ProductBooking_customerId_createdAt_idx" ON "ProductBooking"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductBooking_status_idx" ON "ProductBooking"("status");

-- AddForeignKey
ALTER TABLE "ProductBooking" ADD CONSTRAINT "ProductBooking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
