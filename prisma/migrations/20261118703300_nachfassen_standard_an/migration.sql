-- Automatisch nachfassen: für neue Kunden standardmäßig an (bestehende Kunden unverändert)
ALTER TABLE "AgentConfig" ALTER COLUMN "followUpSequencesEnabled" SET DEFAULT true;
