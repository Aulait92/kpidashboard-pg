-- Ole, 21.11.2026: Produktliste beim Zuordnen von Formularen bereinigen. Hundefutter und alles zu Pflege raus
-- (nur ausgeblendet, active = false; vorhandene Leads und Formulare behalten ihren Produktnamen), KFZ neu.
UPDATE "Product" SET "active" = false
WHERE "active" = true AND (
  "name" ILIKE 'Hundefutter%'
  OR "name" ILIKE '%pflege%'
  OR "name" ILIKE '%24-Stunden-Betreuung%'
  OR "name" ILIKE 'Treppenlift%'
  OR "name" ILIKE '%Seniorenmobile%'
  OR "name" ILIKE '%barrierefreie%Badumbau%'
);

INSERT INTO "Product" ("id", "name", "slug", "keywords", "poolKind", "active", "createdAt", "updatedAt")
VALUES ('prod_kfz_versicherung', 'KFZ-Versicherung', NULL, 'kfz,auto,autoversicherung', 'product', true, NOW(), NOW())
ON CONFLICT ("name") DO UPDATE SET "active" = true;
