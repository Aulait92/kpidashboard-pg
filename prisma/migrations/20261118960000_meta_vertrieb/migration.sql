-- Meta-Formulare des Vertriebs (Oles eigene Vermittler-Leads) und Dublettenschutz über die Meta-Lead-ID. Nur additiv.
ALTER TABLE "SalesInboundLead" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "SalesInboundLead_externalId_key" ON "SalesInboundLead"("externalId");
CREATE INDEX IF NOT EXISTS "SalesInboundLead_source_createdAt_idx" ON "SalesInboundLead"("source", "createdAt");

CREATE TABLE IF NOT EXISTS "VertriebLeadForm" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "pageId" TEXT,
    "formName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLeadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VertriebLeadForm_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VertriebLeadForm_formId_key" ON "VertriebLeadForm"("formId");
