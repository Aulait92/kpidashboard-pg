-- E-Mail-Vorlagen in der Customer Journey, Paket M0 (Ole, 17.11.2026, docs/plan-mail-vorlagen.md): Stufen je Vorlage
-- und BCC je Kunde, Reservierung der Vorlagen-Mails je Lead (Idempotenz, Tageslimit). Nur additiv.
ALTER TABLE "Customer" ADD COLUMN "mailAblauf" JSONB;

CREATE TABLE "LeadMailVersand" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "vorlage" TEXT NOT NULL,
    "anlass" TEXT NOT NULL,
    "automatisch" BOOLEAN NOT NULL DEFAULT true,
    "tag" TEXT NOT NULL,
    "tagesSchluessel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'reserviert',
    "contactMailId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadMailVersand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadMailVersand_tagesSchluessel_key" ON "LeadMailVersand"("tagesSchluessel");
CREATE UNIQUE INDEX "LeadMailVersand_leadId_vorlage_anlass_key" ON "LeadMailVersand"("leadId", "vorlage", "anlass");
CREATE INDEX "LeadMailVersand_leadId_tag_idx" ON "LeadMailVersand"("leadId", "tag");

ALTER TABLE "LeadMailVersand" ADD CONSTRAINT "LeadMailVersand_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
