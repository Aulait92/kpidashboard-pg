-- Zahlen-Seite: laufende Kosten mit Zweck und Einstellungen (nur hinzufügend).
CREATE TABLE "RecurringCost" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyAmount" DECIMAL(10,2) NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'ppl',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringCost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KpiSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "founderHoursPerWeek" INTEGER NOT NULL DEFAULT 20,
    "founderHourlyRate" DECIMAL(8,2) NOT NULL DEFAULT 60,
    "acquisitionCampaigns" TEXT NOT NULL DEFAULT 'Allianz Lead Ads',
    "updateChallenges" TEXT,
    "updateNext" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiSettings_pkey" PRIMARY KEY ("id")
);
