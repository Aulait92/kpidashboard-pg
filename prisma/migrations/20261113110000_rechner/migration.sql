-- Break-even-Rechner: Einstellungen (Produkte, Texte, Garantien) als JSON, nur hinzufügend.
CREATE TABLE "RechnerConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RechnerConfig_pkey" PRIMARY KEY ("id")
);
