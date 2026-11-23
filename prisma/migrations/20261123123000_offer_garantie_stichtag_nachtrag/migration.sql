-- Garantie-Stichtag nachtragen (23.11.2026): Versionen, die angelegt wurden, bevor das Feld live war (z. B. PG-2026-0167
-- für Karsten Grzella), bekommen das Erstellungsdatum der ersten Version desselben Kontakts bzw. Deals.
UPDATE "Offer" o SET "garantieStichtag" = f.erste
FROM (
  SELECT o2.id, (
    SELECT MIN(o3."createdAt") FROM "Offer" o3
    WHERE (o2."salesContactId" IS NOT NULL AND o3."salesContactId" = o2."salesContactId")
       OR (o2."dealId" IS NOT NULL AND o3."dealId" = o2."dealId")
  ) AS erste
  FROM "Offer" o2
  WHERE o2."garantieStichtag" IS NULL
) f
WHERE o.id = f.id AND f.erste IS NOT NULL AND f.erste < o."createdAt";
