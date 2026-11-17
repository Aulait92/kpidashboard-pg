-- Buchungsseite: Kurzname im Link änderbar (Ole, 17.11.2026). Frühere Kurznamen bleiben als Weiterleitung erhalten,
-- damit verschickte Links (Signatur, WhatsApp) weiter funktionieren (lib/calendar/buchungslink.ts).
ALTER TABLE "GoogleCalendarConnection" ADD COLUMN "bookingSlugAlt" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
