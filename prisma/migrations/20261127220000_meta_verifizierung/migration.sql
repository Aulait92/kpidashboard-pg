-- Unternehmensverifizierung bei Meta je WhatsApp-Konto (Cache aus 360dialog) und Backoff für den Policen-Flow
-- bei der Integritätssperre (Ole, 27.11.2026)
ALTER TABLE "WhatsAppAccount" ADD COLUMN "metaBusinessStatus" TEXT;
ALTER TABLE "WhatsAppAccount" ADD COLUMN "metaBusinessName" TEXT;
ALTER TABLE "WhatsAppAccount" ADD COLUMN "metaBusinessCheckedAt" TIMESTAMP(3);
ALTER TABLE "PolicenFlow" ADD COLUMN "naechsterVersuchAt" TIMESTAMP(3);
