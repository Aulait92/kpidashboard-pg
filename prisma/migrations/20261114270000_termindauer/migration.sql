-- Termindauer je Kalender (15/30/45/60 Min.), Standard 30 (nur hinzufügend)
ALTER TABLE "CalendarLeadTimes" ADD COLUMN "durationMin" INTEGER NOT NULL DEFAULT 30;
