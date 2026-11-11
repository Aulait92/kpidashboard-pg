-- Budget ändern im Kundenbereich: Tagesbudgets je Produkt und Änderungsprotokoll
-- CreateTable
CREATE TABLE "CustomerBudget" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "dailyBudget" DECIMAL(10,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "changeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetChange" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "changes" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "monthlyBudgetFrom" INTEGER NOT NULL,
    "monthlyBudgetTo" INTEGER NOT NULL,
    "feeFrom" DECIMAL(10,2),
    "feeTo" DECIMAL(10,2),
    "tierChange" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "reason" TEXT,
    "stripeStatus" TEXT NOT NULL DEFAULT 'none',
    "stripeNote" TEXT,
    "feeAppliedAt" TIMESTAMP(3),
    "note" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerBudget_customerId_validFrom_idx" ON "CustomerBudget"("customerId", "validFrom");

-- CreateIndex
CREATE INDEX "BudgetChange_customerId_createdAt_idx" ON "BudgetChange"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "BudgetChange_stripeStatus_effectiveFrom_idx" ON "BudgetChange"("stripeStatus", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "CustomerBudget" ADD CONSTRAINT "CustomerBudget_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetChange" ADD CONSTRAINT "BudgetChange_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
