-- Dankeschön für Empfehlende (§ 48b VAG, Anwalts-Memo 15.11.2026): höchstens 15 € je Empfehler und Kalenderjahr,
-- nicht an einen Abschluss gekoppelt. Betrag je vorgemerktem Dankeschön für die Jahresgrenze.
ALTER TABLE "Lead" ADD COLUMN "referralRewardAmount" INTEGER;

-- Bisherige Einstellungen anpassen: über 15 € → 15 €, Fälligkeit „Abschluss“ → „Gespräch hat stattgefunden“
UPDATE "ReviewSettings" SET "rewardAmount" = 15 WHERE "rewardAmount" > 15;
UPDATE "ReviewSettings" SET "rewardTrigger" = 'termin' WHERE "rewardTrigger" <> 'termin';
