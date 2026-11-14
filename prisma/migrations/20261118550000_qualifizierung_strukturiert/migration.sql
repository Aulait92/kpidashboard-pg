-- Qualifizierung des KI-Assistenten zusätzlich strukturiert (Punkte wie Lebenssituation, Interesse, Wunsch).
ALTER TABLE "Conversation" ADD COLUMN "qualificationData" JSONB;
