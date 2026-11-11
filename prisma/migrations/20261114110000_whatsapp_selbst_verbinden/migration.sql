-- WhatsApp selbst verbinden (360dialog Integrated Onboarding): Client- und
-- Channel-ID aus dem Redirect merken, damit der API-Key auch nachträglich
-- erzeugt werden kann (Channel noch in Einrichtung). Nur hinzufügend.
ALTER TABLE "WhatsAppAccount" ADD COLUMN "dialog360ClientId" TEXT;
ALTER TABLE "WhatsAppAccount" ADD COLUMN "dialog360ChannelId" TEXT;
