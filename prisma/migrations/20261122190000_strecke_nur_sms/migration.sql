-- Strecke nur mit SMS für Kunden mit ausgeschalteten E-Mail-Funktionen (Ole, 22.11.2026, lib/mail-strecke/nur-sms.ts)
ALTER TABLE "LeadMailStrecke" ADD COLUMN IF NOT EXISTS "nurSms" BOOLEAN NOT NULL DEFAULT false;
