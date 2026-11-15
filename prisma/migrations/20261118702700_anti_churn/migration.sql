-- Anti-Churn beim Kündigen: Grund, gewählte Alternative, Ergebnis (Ole, 15.11.2026)
-- CreateTable
CREATE TABLE "ChurnIntent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "reason" TEXT,
    "note" TEXT,
    "offer" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'offen',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurnIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChurnIntent_customerId_createdAt_idx" ON "ChurnIntent"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ChurnIntent_outcome_createdAt_idx" ON "ChurnIntent"("outcome", "createdAt");

-- AddForeignKey
ALTER TABLE "ChurnIntent" ADD CONSTRAINT "ChurnIntent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

