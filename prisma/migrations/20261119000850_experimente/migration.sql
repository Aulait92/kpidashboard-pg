-- Splittests der Lead-Reise (Ole, 19.11.2026: „konstant Splittests fahren und Conversion-Rates hochtesten“,
-- lib/experimente.ts). Additiv: drei neue Tabellen, nichts Bestehendes ändert sich. Ohne Personendaten
-- (Einheit = Lead-, Chat-, Termin- bzw. Seitenaufruf-ID).

CREATE TABLE IF NOT EXISTS "Experiment" (
    "key" TEXT NOT NULL,
    "ziel" TEXT NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "winner" TEXT,
    "decidedAt" TIMESTAMP(3),
    "stats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "ExperimentZuteilung" (
    "id" TEXT NOT NULL,
    "experiment" TEXT NOT NULL,
    "einheit" TEXT NOT NULL,
    "variante" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentZuteilung_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExperimentEreignis" (
    "id" TEXT NOT NULL,
    "experiment" TEXT NOT NULL,
    "einheit" TEXT NOT NULL,
    "ziel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentEreignis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExperimentZuteilung_experiment_variante_idx" ON "ExperimentZuteilung"("experiment", "variante");
CREATE UNIQUE INDEX IF NOT EXISTS "ExperimentZuteilung_experiment_einheit_key" ON "ExperimentZuteilung"("experiment", "einheit");
CREATE INDEX IF NOT EXISTS "ExperimentEreignis_experiment_ziel_idx" ON "ExperimentEreignis"("experiment", "ziel");
CREATE UNIQUE INDEX IF NOT EXISTS "ExperimentEreignis_experiment_einheit_ziel_key" ON "ExperimentEreignis"("experiment", "einheit", "ziel");
