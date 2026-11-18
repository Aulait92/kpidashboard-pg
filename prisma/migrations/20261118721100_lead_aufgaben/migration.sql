-- P7 (Ole, 17.11.2026): Aufgaben nach dem Abschluss warten auf die Wiedervorlage statt sich zu verdrängen (lib/lead-aufgaben.ts).
CREATE TABLE IF NOT EXISTS "LeadTask" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'wartet',
    "requiresStatus" TEXT,
    "activatedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadTask_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LeadTask_leadId_kind_key" ON "LeadTask"("leadId", "kind");
CREATE INDEX IF NOT EXISTS "LeadTask_status_dueAt_idx" ON "LeadTask"("status", "dueAt");
DO $$ BEGIN
  ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
