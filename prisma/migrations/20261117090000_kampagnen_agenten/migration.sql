-- Kampagnen-Agenten: Läufe je Kunde und Facebook-Seite des Kunden (nur hinzufügend)
ALTER TABLE "Customer" ADD COLUMN "metaPageId" TEXT;

-- CreateTable
CREATE TABLE "CampaignRun" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "wish" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "autoBuild" BOOLEAN NOT NULL DEFAULT true,
    "steps" JSONB NOT NULL,
    "context" JSONB,
    "plan" JSONB,
    "angles" JSONB,
    "copies" JSONB,
    "creatives" JSONB,
    "form" JSONB,
    "review" JSONB,
    "built" JSONB,
    "error" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CampaignRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignRun_customerId_createdAt_idx" ON "CampaignRun"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignRun_status_idx" ON "CampaignRun"("status");

-- AddForeignKey
ALTER TABLE "CampaignRun" ADD CONSTRAINT "CampaignRun_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
