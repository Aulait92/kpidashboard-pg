-- Selbst-Einrichtung: Meta-Prüfung, Einwilligung im Leadformular, Erinnerungen Tag 1/3/7,
-- Einstellungen (Business-ID für den Partnerzugriff, Video je Schritt). Nur hinzufügend.
ALTER TABLE "Onboarding" ADD COLUMN "metaCheck" JSONB;
ALTER TABLE "Onboarding" ADD COLUMN "metaCheckedAt" TIMESTAMP(3);
ALTER TABLE "Onboarding" ADD COLUMN "metaRequestedAt" TIMESTAMP(3);
ALTER TABLE "Onboarding" ADD COLUMN "consentAt" TIMESTAMP(3);
ALTER TABLE "Onboarding" ADD COLUMN "consentConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Onboarding" ADD COLUMN "setupReminders" JSONB;

-- CreateTable
CREATE TABLE "SetupSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "businessId" TEXT,
    "videos" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetupSettings_pkey" PRIMARY KEY ("id")
);
