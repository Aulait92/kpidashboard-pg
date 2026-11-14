-- Später-Follow-ups: eigene Signatur (Instantly gibt die Postfach-Signatur nicht über die API heraus)
ALTER TABLE "SalesFollowupSettings" ADD COLUMN "signature" TEXT;
