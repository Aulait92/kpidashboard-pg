-- Buchungsfenster je Termintyp (Ole, 16.11.2026): Interessenten buchen und verschieben auf der öffentlichen
-- Buchungsseite (/termin) nur in den nächsten N Tagen ab heute. Admins buchen und verschieben ohne Grenze.
-- Bestehende Termintypen bekommen den Standard 7 Tage über den Spalten-Default (keine Startwerte nötig).
ALTER TABLE "SalesBookingType" ADD COLUMN "bookingWindowDays" INTEGER NOT NULL DEFAULT 7;
