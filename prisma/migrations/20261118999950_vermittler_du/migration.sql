-- Du/Sie gegenüber dem Vermittler (Ole, 18.11.2026): eigenes Feld am Kunden, getrennt von leadAddress (Leads).
-- null = unbekannt, dann Sie (Rückfall auf das angenommene Angebot im Code, lib/vermittler-ansprache.ts).
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "vermittlerDu" BOOLEAN;

-- Backfill: aus dem angenommenen Angebot (Offer.mailDu) über Onboarding.offerId; nur leere Felder, nichts gelöscht.
UPDATE "Customer" AS c
SET "vermittlerDu" = o."mailDu"
FROM "Onboarding" AS ob
JOIN "Offer" AS o ON o."id" = ob."offerId"
WHERE ob."customerId" = c."id"
  AND c."vermittlerDu" IS NULL;
