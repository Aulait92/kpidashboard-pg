-- Teams-Link fehlt (26.11.2026): Microsoft verbunden, aber ohne Teams-Lizenz kommt kein Videolink zurück.
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "teamsLinkFehltAt" TIMESTAMP(3);
