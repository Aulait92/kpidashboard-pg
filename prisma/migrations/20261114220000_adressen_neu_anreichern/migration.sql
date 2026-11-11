-- Alle Vertriebskontakte ohne vollständige Adresse noch einmal anreichern lassen
-- (neue Quelle: Allianz-Agenturseite aus der E-Mail, Startseite als Ersatz fürs Impressum).
-- Der WhatsApp-Cron arbeitet sie nach und nach ab (Standard 20 je Lauf).
UPDATE "SalesContact" SET "addressEnrichTriedAt" = NULL
WHERE "addressEnrichedAt" IS NULL
  AND ("street" IS NULL OR "street" = '' OR "zip" IS NULL OR "zip" = '' OR "city" IS NULL OR "city" = '');
