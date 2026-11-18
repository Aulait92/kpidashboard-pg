-- Erinnerung vor Ablauf des Abschlussbonus (Ole, 18.11.2026): Merkfelder je Schritt am Angebot und
-- „WhatsApp erlaubt“ am Vertriebskontakt (NULL = automatisch). Rein additiv.
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "bonusMailVorabAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "bonusMailLetzterAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "bonusPushAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "bonusWhatsAppAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "bonusWhatsAppStatus" TEXT;
ALTER TABLE "SalesContact" ADD COLUMN IF NOT EXISTS "whatsappErlaubt" BOOLEAN;
ALTER TABLE "SalesContact" ADD COLUMN IF NOT EXISTS "whatsappErlaubtAt" TIMESTAMP(3);
