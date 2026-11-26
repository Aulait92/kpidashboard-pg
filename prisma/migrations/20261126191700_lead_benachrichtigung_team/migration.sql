-- Benachrichtigung bei neuen Leads je Login (Ole, 26.11.2026): nur meine / alle im Team, getrennt für E-Mail und Push.
-- NULL = Standard nach Rolle (lib/lead-benachrichtigung-shared.ts). Nur additiv.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "leadMailScope" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "leadPushScope" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "teamMailAt" TIMESTAMP(3);
