-- Kein WhatsApp (Ole, 15.11.2026): Zustellfehler je Nachricht, Lead- und Bestandskunden-Markierung, Admin-Alarm je Kunde/Code/Tag

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "errorCode" INTEGER;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "errorTitle" TEXT;

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "waUnavailableAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "waUnavailableMailAt" TIMESTAMP(3);

ALTER TABLE "ExistingCustomer" ADD COLUMN IF NOT EXISTS "waUnavailableAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "WhatsAppErrorAlert" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "day" TEXT NOT NULL,
    "title" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppErrorAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WhatsAppErrorAlert_createdAt_idx" ON "WhatsAppErrorAlert"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppErrorAlert_customerId_code_day_key" ON "WhatsAppErrorAlert"("customerId", "code", "day");

DO $$ BEGIN
  ALTER TABLE "WhatsAppErrorAlert" ADD CONSTRAINT "WhatsAppErrorAlert_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
