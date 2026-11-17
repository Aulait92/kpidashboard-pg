-- Assistent: nur Videotermine (Standard an) und Anrede des Vermittlers in den Anbieterangaben (Ole, 17.11.2026). Additiv.
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "videoOnly" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "anrede" TEXT;
