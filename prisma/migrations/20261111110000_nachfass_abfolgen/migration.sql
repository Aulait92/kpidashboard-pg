-- AlterTable
ALTER TABLE "AgentConfig" ADD COLUMN     "followUpSequencesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LeadSequence" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "nextAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "log" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "LeadSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadSequence_stoppedAt_nextAt_idx" ON "LeadSequence"("stoppedAt", "nextAt");

-- CreateIndex
CREATE INDEX "LeadSequence_leadId_idx" ON "LeadSequence"("leadId");

-- AddForeignKey
ALTER TABLE "LeadSequence" ADD CONSTRAINT "LeadSequence_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

