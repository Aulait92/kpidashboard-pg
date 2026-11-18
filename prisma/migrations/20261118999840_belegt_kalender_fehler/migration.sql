-- Weitere Kalender für „belegt“, die zuletzt nicht abrufbar waren (werden übersprungen, Hinweis in den Einstellungen).
-- Tabelle heißt aus Kompatibilität weiter „GoogleCalendarConnection“ (Modell CalendarConnection).
ALTER TABLE "GoogleCalendarConnection" ADD COLUMN IF NOT EXISTS "busyCalendarErrors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
