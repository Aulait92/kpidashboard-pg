-- Instantly-Kampagnen mit anderem Thema (Pflege) aus dem CRM heraushalten.
ALTER TABLE "SalesCampaign" ADD COLUMN "ignored" BOOLEAN NOT NULL DEFAULT false;
UPDATE "SalesCampaign" SET "ignored" = true WHERE "name" ILIKE '%pflege%';

-- Kontakte, die die App am 11.11. automatisch aus Instantly angelegt hat und die
-- nur zu Pflege-Kampagnen gehören, wieder entfernen (Verlauf, Mails, Aufgaben per Cascade).
-- Nie: Kontakte mit Angebot, Termin oder Kundenkonto, oder mit anderer Kampagne.
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
    c."description" ILIKE '%pflege%'
    OR EXISTS (
      SELECT 1 FROM "SalesCampaignLead" l JOIN "SalesCampaign" k ON k."id" = l."campaignId"
      WHERE l."contactId" = c."id" AND k."ignored" = true
    )
  );
