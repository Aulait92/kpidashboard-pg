-- „Ich habe keinen Online-Kalender“ (25.11.2026): Wahl des Vermittlers, zählt als Quelle für den App-Kalender.
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "ohneOnlineKalenderAt" TIMESTAMP(3);
