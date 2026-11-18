-- Ole, 18.11.2026: „Bei Hund, Pferd und Privatschutz kennen wir schon Leadpreise“ → als bewährt markieren, damit beim
-- Dazubuchen der Leadpreis (Erfahrungswert aus dem Rechner) statt „Neues Produkt“ steht.
UPDATE "ProductCatalogItem" SET "proven" = true WHERE "key" IN ('tkv-hund', 'tkv-pferd', 'privatschutz');
