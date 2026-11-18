-- Einladung mit Kalendereintrag an den Lead (Ole, 17.11.2026, lib/calendar/einladung.ts): genau einmal, Änderungen
-- danach als Aktualisierung (gleiche UID, SEQUENCE + 1); bei Buchung im WhatsApp-Assistenten zunächst ausstehend.
ALTER TABLE "Appointment" ADD COLUMN "einladungAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "einladungAn" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "einladungSeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Appointment" ADD COLUMN "einladungAusstehend" TIMESTAMP(3);
CREATE INDEX "Appointment_einladungAusstehend_idx" ON "Appointment"("einladungAusstehend");
