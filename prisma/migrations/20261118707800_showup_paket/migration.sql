-- Show-up-Paket (Ole, 17.11.2026): Erinnerung 15 Min. vorher, „Bitte verschieben“, Anwesenheit am Termin,
-- Pushes zum Terminbeginn und danach, 45-Min.-Verlängerung bei Komplettcheck, Anrufplan nach dem Erstanschreiben.
ALTER TABLE "Appointment" ADD COLUMN "startReminderSentAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "rescheduleRequestedAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "attendance" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "attendanceAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "startPushAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "afterPushAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "verlaengerung" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "verlaengerungAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "autoCallAt" TIMESTAMP(3);
