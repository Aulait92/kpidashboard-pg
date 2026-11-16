-- Zahlungserinnerung für angenommene, noch nicht bezahlte Angebote (Ole, 16.11.2026). Nur neue Spalten.
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "paymentReminderAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "paymentReminderCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "paymentReminderLastAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "paymentReminderTaskAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "paymentReminderPushAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "mailDu" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "startShiftedFrom" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "allowPayLater" BOOLEAN NOT NULL DEFAULT false;
