-- Paket M2 „Antwortadresse mit Eingang“ (Ole, 18.11.2026): additiv.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "antwortCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_antwortCode_key" ON "Lead"("antwortCode");

ALTER TABLE "ContactMail" ADD COLUMN IF NOT EXISTS "richtung" TEXT NOT NULL DEFAULT 'ausgang';

CREATE TABLE IF NOT EXISTS "MailEingang" (
    "id" TEXT NOT NULL,
    "resendEmailId" TEXT NOT NULL,
    "customerId" TEXT,
    "leadId" TEXT,
    "contactMailId" TEXT,
    "zuordnung" TEXT NOT NULL DEFAULT 'keine',
    "ergebnis" TEXT NOT NULL DEFAULT 'in_arbeit',
    "grund" TEXT,
    "anhaenge" JSONB,
    "weitergeleitetAt" TIMESTAMP(3),
    "pushAt" TIMESTAMP(3),
    "versuche" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MailEingang_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MailEingang_resendEmailId_key" ON "MailEingang"("resendEmailId");
CREATE UNIQUE INDEX IF NOT EXISTS "MailEingang_contactMailId_key" ON "MailEingang"("contactMailId");
CREATE INDEX IF NOT EXISTS "MailEingang_customerId_createdAt_idx" ON "MailEingang"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "MailEingang_leadId_idx" ON "MailEingang"("leadId");
CREATE INDEX IF NOT EXISTS "MailEingang_createdAt_idx" ON "MailEingang"("createdAt");
DO $$ BEGIN
  ALTER TABLE "MailEingang" ADD CONSTRAINT "MailEingang_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MailEingang" ADD CONSTRAINT "MailEingang_contactMailId_fkey" FOREIGN KEY ("contactMailId") REFERENCES "ContactMail"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
