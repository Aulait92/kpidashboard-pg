-- Bestandskunden-Modul (Ole, 18.11.2026): Ansprache der Bestandskunden (Du/Sie) je Vermittler und
-- Sperre einzelner Bestandskunden durch den Vermittler („nicht mehr anschreiben“, wieder entsperrbar).
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "bestandAddress" TEXT NOT NULL DEFAULT 'sie';
ALTER TABLE "ExistingCustomer" ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMP(3);
ALTER TABLE "ExistingCustomer" ADD COLUMN IF NOT EXISTS "blockedById" TEXT;
