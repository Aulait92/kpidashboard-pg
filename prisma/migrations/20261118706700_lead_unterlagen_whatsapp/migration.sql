-- Unterlagen vom Lead per WhatsApp (Ole, 17.11.2026, lib/policen): Policen vor dem Termin, verschlüsselt gespeichert.
-- Rein additiv.
CREATE TABLE "LeadDocument" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'gespeichert',
    "waMediaId" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA,
    "kind" TEXT NOT NULL DEFAULT 'police',
    "sparte" TEXT,
    "gesundheitsbezug" BOOLEAN NOT NULL DEFAULT false,
    "consentId" TEXT,
    "consentAt" TIMESTAMP(3),
    "extracted" JSONB,
    "extractedAt" TIMESTAMP(3),
    "deleteAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadDocument_leadId_idx" ON "LeadDocument"("leadId");
CREATE INDEX "LeadDocument_customerId_idx" ON "LeadDocument"("customerId");
CREATE INDEX "LeadDocument_status_createdAt_idx" ON "LeadDocument"("status", "createdAt");

ALTER TABLE "LeadDocument" ADD CONSTRAINT "LeadDocument_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
