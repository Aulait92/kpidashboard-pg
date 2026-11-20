-- Media Buyer: Autopilot für den Pool „PKV Tarifoptimierung" (Produkt Wechsel, Pool-Key aus derivePoolDefs:
-- "product:<canonicalProductKey>" = "product:Wechsel") einschalten (Ole, 20.11.2026).
-- Existiert die Zeile schon, wird NUR autopilot gesetzt (Budget-Caps, Keywords usw. bleiben unverändert).
-- Fehlt sie, wird sie so angelegt, wie ensurePool() sie anlegen würde (Label wird beim nächsten Lauf aktualisiert).
INSERT INTO "DeliveryPool" ("id", "key", "label", "kind", "product", "region", "autopilot", "createdAt", "updatedAt")
VALUES ('pool_product_wechsel', 'product:Wechsel', 'PKV Tarifoptimierung', 'product', 'Wechsel', NULL, true, NOW(), NOW())
ON CONFLICT ("key") DO UPDATE SET "autopilot" = true, "updatedAt" = NOW();
