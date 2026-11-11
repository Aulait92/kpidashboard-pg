-- 1) Weitere Kampagnen mit anderem Thema ignorieren: Badumbau, Kinderwunsch
UPDATE "SalesCampaign" SET "ignored" = true
WHERE "name" ILIKE '%badumbau%' OR "name" ILIKE '%bad-umbau%' OR "name" ILIKE '%bad umbau%' OR "name" ILIKE '%kinderwunsch%';

-- 2) Am 11.11. automatisch aus Instantly angelegte Kontakte dieser Themen entfernen
--    (gleiche Regeln wie bei Pflege: nie mit Angebot, Termin, Kundenkonto oder anderer Kampagne)
DELETE FROM "SalesContact" c
WHERE c."description" LIKE 'Über Instantly angelegt%'
  AND c."customerId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Offer" o WHERE o."salesContactId" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "SalesMeeting" m WHERE m."contactId" = c."id")
  AND NOT EXISTS (
    SELECT 1 FROM "SalesCampaignLead" l JOIN "SalesCampaign" k ON k."id" = l."campaignId"
    WHERE l."contactId" = c."id" AND k."ignored" = false
  )
  AND (
    c."description" ILIKE '%badumbau%' OR c."description" ILIKE '%bad-umbau%' OR c."description" ILIKE '%bad umbau%' OR c."description" ILIKE '%kinderwunsch%'
    OR EXISTS (
      SELECT 1 FROM "SalesCampaignLead" l JOIN "SalesCampaign" k ON k."id" = l."campaignId"
      WHERE l."contactId" = c."id" AND k."ignored" = true
    )
  );

-- 3) Alte Instantly-Kontakte (frühere Pay-per-Lead-Kampagnen) entfernen: nur am 11.11.
--    automatisch angelegte Kontakte, deren letzte Instantly-Aktivität (Versand, Antwort)
--    älter als 4 Wochen ist. Nie mit Angebot, Termin oder Kundenkonto; ohne jedes Datum bleiben sie.
WITH last_activity AS (
  SELECT c."id",
         GREATEST(
           (SELECT MAX(GREATEST(l."sentAt", l."lastReplyAt")) FROM "SalesCampaignLead" l WHERE l."contactId" = c."id"),
           (SELECT MAX(e."sentAt") FROM "SalesEmail" e WHERE e."contactId" = c."id")
         ) AS last_at
  FROM "SalesContact" c
  WHERE c."description" LIKE 'Über Instantly angelegt%'
    AND c."customerId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "Offer" o WHERE o."salesContactId" = c."id")
    AND NOT EXISTS (SELECT 1 FROM "SalesMeeting" m WHERE m."contactId" = c."id")
)
DELETE FROM "SalesContact" c
USING last_activity a
WHERE c."id" = a."id"
  AND a.last_at IS NOT NULL
  AND a.last_at < NOW() - INTERVAL '28 days';
