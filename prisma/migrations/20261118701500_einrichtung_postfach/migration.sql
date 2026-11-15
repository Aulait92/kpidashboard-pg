-- Einrichtung: Schritt E-Mail-Postfach, „Gesellschaft erlaubt das nicht“, Überspringen mit Grund (Ole, 15.11.2026)
ALTER TABLE "Customer" ADD COLUMN "mailFeaturesOff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Onboarding" ADD COLUMN "stepSkips" JSONB;
