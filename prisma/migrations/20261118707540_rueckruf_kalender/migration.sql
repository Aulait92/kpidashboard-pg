-- Rückruf mit Uhrzeit im Kalender des Beraters (Ole, 17.11.2026): Kalender-Eintrag (Event-ID und Kalender-Schlüssel),
-- damit er beim Verschieben bzw. Erledigen gelöscht wird (lib/calendar/rueckruf.ts).
ALTER TABLE "Lead" ADD COLUMN "rueckrufEventId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "rueckrufEventKey" TEXT;
