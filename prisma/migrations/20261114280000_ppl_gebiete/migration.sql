-- Pay-per-Lead: Gebiete je Bezug mit eigener Menge (Vorrang), Gebiet am Pool-Lead (nur hinzufügend)
CREATE TABLE "SubscriptionArea" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "label" TEXT,
    "plzRanges" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "period" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubscriptionArea_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SubscriptionArea_subscriptionId_idx" ON "SubscriptionArea"("subscriptionId");
ALTER TABLE "SubscriptionArea" ADD CONSTRAINT "SubscriptionArea_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "LeadSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PoolLead" ADD COLUMN "areaId" TEXT;
CREATE INDEX "PoolLead_areaId_deliveredAt_idx" ON "PoolLead"("areaId", "deliveredAt");
