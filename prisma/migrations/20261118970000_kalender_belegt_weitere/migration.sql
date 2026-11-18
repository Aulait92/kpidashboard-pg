-- Weitere Google-Kalender nur für die Belegt-Prüfung (Ole, 18.11.2026)
ALTER TABLE "GoogleCalendarConnection" ADD COLUMN "busyCalendarIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
