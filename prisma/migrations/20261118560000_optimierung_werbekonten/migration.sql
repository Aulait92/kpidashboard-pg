-- Automatische Optimierung je Werbekonto: Konten, Maßnahmen-Protokoll, Meta-Änderungsprotokoll, Einstellungen. Nur hinzufügend.
-- CreateTable
CREATE TABLE "OptimizationAccount" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "customerId" TEXT,
    "poolProduct" TEXT,
    "label" TEXT NOT NULL,
    "adAccountId" TEXT,
    "autopilot" BOOLEAN,
    "targetCpl" DECIMAL(10,2),
    "agreedDailyBudget" DECIMAL(10,2),
    "campaignKeyword" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastRunNote" TEXT,
    "lastRunAds" INTEGER,
    "activitiesSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptimizationAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationMeasure" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'geplant',
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'automatik',
    "targetType" TEXT NOT NULL DEFAULT 'account',
    "targetId" TEXT,
    "targetName" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "data" JSONB,
    "params" JSONB,
    "major" BOOLEAN NOT NULL DEFAULT false,
    "dedupeKey" TEXT,
    "plannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "executedAt" TIMESTAMP(3),
    "result" TEXT,
    "campaignRunId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptimizationMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdActivity" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "customerId" TEXT,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "eventType" TEXT NOT NULL,
    "translatedEventType" TEXT,
    "objectId" TEXT,
    "objectName" TEXT,
    "objectType" TEXT,
    "actorName" TEXT,
    "applicationName" TEXT,
    "extraData" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaAdActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autopilot" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptimizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OptimizationAccount_customerId_key" ON "OptimizationAccount"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "OptimizationAccount_poolProduct_key" ON "OptimizationAccount"("poolProduct");

-- CreateIndex
CREATE INDEX "OptimizationAccount_kind_active_idx" ON "OptimizationAccount"("kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "OptimizationMeasure_dedupeKey_key" ON "OptimizationMeasure"("dedupeKey");

-- CreateIndex
CREATE INDEX "OptimizationMeasure_customerId_executedAt_idx" ON "OptimizationMeasure"("customerId", "executedAt");

-- CreateIndex
CREATE INDEX "OptimizationMeasure_accountId_status_idx" ON "OptimizationMeasure"("accountId", "status");

-- CreateIndex
CREATE INDEX "OptimizationMeasure_status_executedAt_idx" ON "OptimizationMeasure"("status", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdActivity_dedupeKey_key" ON "MetaAdActivity"("dedupeKey");

-- CreateIndex
CREATE INDEX "MetaAdActivity_customerId_eventTime_idx" ON "MetaAdActivity"("customerId", "eventTime");

-- CreateIndex
CREATE INDEX "MetaAdActivity_adAccountId_eventTime_idx" ON "MetaAdActivity"("adAccountId", "eventTime");

-- AddForeignKey
ALTER TABLE "OptimizationAccount" ADD CONSTRAINT "OptimizationAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationMeasure" ADD CONSTRAINT "OptimizationMeasure_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OptimizationAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationMeasure" ADD CONSTRAINT "OptimizationMeasure_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
