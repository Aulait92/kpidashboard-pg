-- Beiträge rechnen (Pilot, Ole 16.11.2026, docs/preise-pilot.md): Schalter je Gesellschaft und Sparte, Standard aus.
CREATE TABLE IF NOT EXISTS "PreisPilot" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "aktiv" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreisPilot_pkey" PRIMARY KEY ("id")
);
