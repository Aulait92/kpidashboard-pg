-- Nutzungsanalyse (Sentry Session Replay, Inhalte maskiert) nur mit Einwilligung je Nutzer (Ole, 17.11.2026;
-- § 25 TDDDG). ja | nein, Zeitpunkt und Textversion als Nachweis (lib/nutzungsanalyse.ts).
ALTER TABLE "User" ADD COLUMN "analyseEinwilligung" TEXT;
ALTER TABLE "User" ADD COLUMN "analyseEinwilligungAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "analyseEinwilligungVersion" TEXT;
