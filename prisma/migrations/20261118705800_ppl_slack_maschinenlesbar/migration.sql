-- Pay-per-Lead: Slack-Schalter je Bezug, maschinenlesbare Lead-Mail, Einwilligungstext (additiv)
ALTER TABLE "LeadSubscription" ADD COLUMN IF NOT EXISTS "emailFormat" TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE "LeadSubscription" ADD COLUMN IF NOT EXISTS "consentText" TEXT;
ALTER TABLE "LeadSubscription" ADD COLUMN IF NOT EXISTS "slackNotify" BOOLEAN NOT NULL DEFAULT true;
