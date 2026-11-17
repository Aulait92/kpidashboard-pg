-- Policen mit Gesundheitsbezug (Ole, 17.11.2026, lib/policen, docs/recht-gesundheitsunterlagen.md Abschnitt b).
-- Rein additiv: Einwilligungsprotokoll mit Lead, Wortlaut-Version und WhatsApp-ID der Knopf-Antwort; Unterlagen mit
-- Erinnerung vor der Löschung nach Abschluss und Kennzeichen „Beratungsdokumentation behalten“.
ALTER TABLE "BestandConsentLog" ADD COLUMN "leadId" TEXT;
ALTER TABLE "BestandConsentLog" ADD COLUMN "version" TEXT;
ALTER TABLE "BestandConsentLog" ADD COLUMN "waMessageId" TEXT;
CREATE INDEX "BestandConsentLog_leadId_idx" ON "BestandConsentLog"("leadId");

ALTER TABLE "LeadDocument" ADD COLUMN "erinnertAt" TIMESTAMP(3);
ALTER TABLE "LeadDocument" ADD COLUMN "behaltenAt" TIMESTAMP(3);
ALTER TABLE "LeadDocument" ADD COLUMN "behaltenVonId" TEXT;
ALTER TABLE "LeadDocument" ADD COLUMN "behaltenVermerk" TEXT;
