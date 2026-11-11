-- Vorlagen automatisch einreichen: Abgleich-Zeitpunkt je WhatsApp-Konto,
-- Herkunft, Einreichungszeit und Ablehnungsgrund je Vorlage (nur hinzufügend).
ALTER TABLE "WhatsAppAccount" ADD COLUMN "templatesCheckedAt" TIMESTAMP(3);
ALTER TABLE "MessageTemplate" ADD COLUMN "auto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MessageTemplate" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "MessageTemplate" ADD COLUMN "rejectionReason" TEXT;
