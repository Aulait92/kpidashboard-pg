-- Termin: Nachfrage etwa 1 Std. vorher („Gleich ist es so weit, passt alles?“)
ALTER TABLE "Appointment" ADD COLUMN "soonReminderSentAt" TIMESTAMP(3);
