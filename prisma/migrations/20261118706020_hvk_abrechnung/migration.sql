-- HvK-Abrechnung (Ole, 16.11.2026): wöchentliche Gutschrift von Lead-Production (PDF), Reklamationen und das
-- nur lesende Postfach (Microsoft Graph, Mail.Read). Additiv und wiederholbar.

CREATE TABLE IF NOT EXISTS "HvkInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "invoiceDate" DATE,
    "brokerId" TEXT,
    "netCents" INTEGER NOT NULL,
    "vatCents" INTEGER,
    "grossCents" INTEGER,
    "boughtCount" INTEGER NOT NULL,
    "reklamationCount" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "stornoAuto" INTEGER NOT NULL DEFAULT 0,
    "stornoReview" INTEGER NOT NULL DEFAULT 0,
    "pdf" BYTEA NOT NULL,
    "pdfName" TEXT,
    "mailMessageId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'mail',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HvkInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HvkInvoice_invoiceNo_key" ON "HvkInvoice"("invoiceNo");
CREATE UNIQUE INDEX IF NOT EXISTS "HvkInvoice_mailMessageId_key" ON "HvkInvoice"("mailMessageId");
CREATE INDEX IF NOT EXISTS "HvkInvoice_periodStart_idx" ON "HvkInvoice"("periodStart");

CREATE TABLE IF NOT EXISTS "HvkReklamation" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "hvkLeadId" TEXT NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "plz" TEXT NOT NULL,
    "ort" TEXT NOT NULL,
    "cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "leadId" TEXT,
    "candidateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HvkReklamation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HvkReklamation_invoiceId_hvkLeadId_key" ON "HvkReklamation"("invoiceId", "hvkLeadId");
CREATE INDEX IF NOT EXISTS "HvkReklamation_status_idx" ON "HvkReklamation"("status");
DO $$ BEGIN
  ALTER TABLE "HvkReklamation" ADD CONSTRAINT "HvkReklamation_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "HvkInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AdminMailbox" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'microsoft',
    "email" TEXT NOT NULL,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "lastError" TEXT,
    "lastCheckAt" TIMESTAMP(3),
    "connectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminMailbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdminMailbox_purpose_key" ON "AdminMailbox"("purpose");
