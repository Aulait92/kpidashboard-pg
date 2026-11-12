-- Signal-Iduna-Kontakte: Die Anreicherung hat signal-iduna.de/<name>/impressum gelesen. Das ist
-- das Konzern-Impressum (Dortmund, Vorstand, Konzern-Fax) statt der Agentur. Diese Werte
-- entfernen und die Kontakte neu anreichern lassen (jetzt über signal-iduna-agentur.de + Google).
-- Nur automatisch übernommene Konzernwerte; andere Angaben bleiben.
UPDATE "SalesContact" SET "fax" = NULL
WHERE "fax" LIKE '0231 135%' OR "fax" LIKE '+49 231 135%' OR "fax" LIKE '0231/135%';

UPDATE "SalesContact" SET "leaderNames" = NULL
WHERE "leaderNames" ILIKE '%Wibbeke%' OR "leaderNames" ILIKE '%Claudia Pauls%';

UPDATE "SalesContact" SET "street" = NULL, "zip" = NULL, "city" = NULL, "addressEnrichedAt" = NULL
WHERE ("street" ILIKE 'Joseph-Scherer%' AND "zip" = '44139')
   OR ("street" ILIKE 'Neue Rabenstr%' AND "zip" = '20354');

UPDATE "SalesContact" SET "phone" = NULL
WHERE ("phone" LIKE '0231 135%' OR "phone" LIKE '+49 231 135%' OR "phone" LIKE '0231/135%' OR "phone" LIKE '040 4124%' OR "phone" LIKE '+49 40 4124%')
  AND ("email" ILIKE '%@signal-iduna.net' OR "email" ILIKE '%@signal-iduna.de');

-- Alle Signal-Iduna-Kontakte neu anreichern (Website + Google)
UPDATE "SalesContact" SET "webEnrichAt" = NULL, "googleCheckedAt" = NULL, "addressEnrichTriedAt" = NULL
WHERE "email" ILIKE '%@signal-iduna.net' OR "email" ILIKE '%@signal-iduna.de';
