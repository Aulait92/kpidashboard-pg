-- Ruhendes Konto nach Vertragsende (Ole, 15.11.2026): Aufbewahrung 24 Monate (Standard), 3 Monate oder sofort,
-- Erinnerungen vor der Löschung, endgültige Löschung, Lebenszyklus für die Statistik (lib/ruhend.ts).

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "dataDeletedAt" TIMESTAMP(3),
ADD COLUMN     "deleteAfter" TIMESTAMP(3),
ADD COLUMN     "dormantSince" TIMESTAMP(3),
ADD COLUMN     "retentionChoice" TEXT,
ADD COLUMN     "retentionReminder30At" TIMESTAMP(3),
ADD COLUMN     "retentionReminder7At" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CustomerLifecycleEvent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "mrr" DECIMAL(12,2),
    "reason" TEXT,
    "churnReason" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerLifecycleEvent_customerId_at_idx" ON "CustomerLifecycleEvent"("customerId", "at");

-- CreateIndex
CREATE INDEX "CustomerLifecycleEvent_kind_at_idx" ON "CustomerLifecycleEvent"("kind", "at");

-- AddForeignKey
ALTER TABLE "CustomerLifecycleEvent" ADD CONSTRAINT "CustomerLifecycleEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
