-- Erneut eingetragen (Ole, 16.11.2026, lib/lead-erneut.ts): weitere Einsendungen derselben Person beim selben Kunden
CREATE TABLE "LeadReentry" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalId" TEXT,
    "formId" TEXT,
    "productKey" TEXT,
    "consentData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadReentry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadReentry_externalId_key" ON "LeadReentry"("externalId");
CREATE INDEX "LeadReentry_leadId_idx" ON "LeadReentry"("leadId");
CREATE INDEX "LeadReentry_customerId_createdAt_idx" ON "LeadReentry"("customerId", "createdAt");

ALTER TABLE "LeadReentry" ADD CONSTRAINT "LeadReentry_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
