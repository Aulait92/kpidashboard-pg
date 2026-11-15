-- Kundenlink zur Beratungspräsentation (nur Stand, läuft nach 14 Tagen ab)
ALTER TABLE "Appointment" ADD COLUMN "shareToken" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "shareExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Appointment_shareToken_key" ON "Appointment"("shareToken");
