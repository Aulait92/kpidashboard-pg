-- Nachfrage nach dem Abschluss (Google-Bewertung, Empfehlung) nur mit Einwilligung, „STOPP“ wirkt dauerhaft
ALTER TABLE "Lead" ADD COLUMN "feedbackConsentAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "feedbackConsentSource" TEXT;
ALTER TABLE "Lead" ADD COLUMN "feedbackConsentText" TEXT;
ALTER TABLE "Lead" ADD COLUMN "feedbackOptOutAt" TIMESTAMP(3);
