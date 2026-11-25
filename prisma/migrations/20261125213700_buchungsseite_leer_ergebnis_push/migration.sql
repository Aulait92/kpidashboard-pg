-- Warnung „Buchungsseite ohne freie Zeiten“ (Admin „Heute“) und Push „Wie lief der Termin?“ (Ole, 25.11.2026). Nur additiv.
ALTER TABLE "GoogleCalendarConnection" ADD COLUMN IF NOT EXISTS "keineZeitenSeit" TIMESTAMP(3);
ALTER TABLE "GoogleCalendarConnection" ADD COLUMN IF NOT EXISTS "keineZeitenGrund" TEXT;
ALTER TABLE "GoogleCalendarConnection" ADD COLUMN IF NOT EXISTS "keineZeitenGeprueftAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "ergebnisPushAt" TIMESTAMP(3);
