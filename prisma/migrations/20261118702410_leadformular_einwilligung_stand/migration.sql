-- Einwilligung beim letzten Lead je Formular (Warnung „Formular ohne Einwilligungs-Häkchen“ im Admin)
ALTER TABLE "LeadSource" ADD COLUMN "lastConsentState" TEXT;
