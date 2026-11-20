-- Eigener PKV-Funnel (lib/funnel): Besucher und Ereignisse je Schritt, ohne Personendaten
CREATE TABLE "FunnelBesuch" (
    "id" TEXT NOT NULL,
    "funnel" TEXT NOT NULL,
    "quelle" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poolLeadId" TEXT,
    "leadAt" TIMESTAMP(3),
    "metaEventId" TEXT,
    "metaEinwilligung" BOOLEAN NOT NULL DEFAULT false,
    "metaFbc" TEXT,
    "metaFbp" TEXT,
    "reifGeprueftAt" TIMESTAMP(3),
    "reif" BOOLEAN,
    "reifUmsatzCent" INTEGER,
    "rueckmeldungMoeglich" BOOLEAN,
    "rueckmeldung" BOOLEAN,
    "erreicht" BOOLEAN,
    "termin" BOOLEAN,
    "abschluss" BOOLEAN,
    "qualitaetGesendetAt" TIMESTAMP(3),

    CONSTRAINT "FunnelBesuch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FunnelBesuch_poolLeadId_key" ON "FunnelBesuch"("poolLeadId");
CREATE INDEX "FunnelBesuch_funnel_createdAt_idx" ON "FunnelBesuch"("funnel", "createdAt");
CREATE INDEX "FunnelBesuch_reifGeprueftAt_leadAt_idx" ON "FunnelBesuch"("reifGeprueftAt", "leadAt");

CREATE TABLE "FunnelEreignis" (
    "id" TEXT NOT NULL,
    "besuchId" TEXT NOT NULL,
    "funnel" TEXT NOT NULL,
    "schritt" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "variante" TEXT,
    "grund" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunnelEreignis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FunnelEreignis_besuchId_schritt_art_key" ON "FunnelEreignis"("besuchId", "schritt", "art");
CREATE INDEX "FunnelEreignis_funnel_createdAt_idx" ON "FunnelEreignis"("funnel", "createdAt");
