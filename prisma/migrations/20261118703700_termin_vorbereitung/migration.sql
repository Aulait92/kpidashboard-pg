-- Terminvorbereitung: Berater hakt „vorbereitet“ ab
ALTER TABLE "Appointment" ADD COLUMN "preparedAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "preparedById" TEXT;
