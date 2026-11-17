-- WhatsApp-Erinnerungen zu Vertriebsterminen (Ole, 17.11.2026): Ergebnis, letzter Fehler und Versuche je Art,
-- damit ein Sendefehler im nächsten Cron-Lauf erneut versucht wird (lib/vertrieb/termin-whatsapp.ts).
ALTER TABLE "SalesMeeting" ADD COLUMN "waReminderStatus" TEXT;
ALTER TABLE "SalesMeeting" ADD COLUMN "waReminderError" TEXT;
ALTER TABLE "SalesMeeting" ADD COLUMN "waReminderTries" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesMeeting" ADD COLUMN "waSoonStatus" TEXT;
ALTER TABLE "SalesMeeting" ADD COLUMN "waSoonError" TEXT;
ALTER TABLE "SalesMeeting" ADD COLUMN "waSoonTries" INTEGER NOT NULL DEFAULT 0;
