-- Angebot als abgelehnt markieren (Ole, 18.11.2026): Zeitpunkt, Grund, Notiz und Status davor (für „Wieder öffnen“).
-- Rein additiv.
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "declinedAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "declineReason" "SalesLossReason";
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "declineNote" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "declinedPrevStatus" TEXT;
