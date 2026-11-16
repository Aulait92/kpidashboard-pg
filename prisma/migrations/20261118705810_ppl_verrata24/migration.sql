-- Pay-per-Lead-Kunde verrata24 GmbH (Callcenter tarifklar), Ole 16.11.2026.
-- Kunde und Bezug INAKTIV anlegen; aktiviert wird nach Oles OK zum Testdatensatz im Admin.
-- Wiederholbar (ON CONFLICT / WHERE NOT EXISTS). Absichtlich OHNE Markierung zum Einmessen:
-- frische Datenbanken (CI) tragen diese Migration nur als angewendet ein, ohne Daten.
-- Abrechnung lief schon von Hand: einmalige Menge (once), die App zählt nur, keine Stripe-Bestellung.
-- Preis 60 Euro je Lead, 25 Leads einmalig, 1.500 Euro gesamt (von Ole bestätigt, schon von Hand abgerechnet).

INSERT INTO "Customer" ("id", "name")
VALUES ('ppl_verrata24', 'verrata24 GmbH')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "LeadSubscription" (
  "id", "customerId", "productKey", "label", "active", "status", "period", "goal", "price",
  "acceptWeak", "weakThreshold", "acceptCivilServants", "onlyWeak", "insurerInclude", "insurerExclude",
  "stornoDays", "stornoReasons", "stornoAutoApprove",
  "delivery", "deliveryEmail", "emailFormat", "slackNotify", "updatedAt"
)
SELECT
  'ppl_verrata24_pkv',
  c."id",
  -- Produktname wie im Pool-Eingang (?produkt=pkv-tarifoptimierung wird auf Product.name abgebildet)
  COALESCE(
    (SELECT p."name" FROM "Product" p WHERE lower(p."slug") = 'pkv-tarifoptimierung' LIMIT 1),
    (SELECT p."name" FROM "Product" p WHERE p."name" ILIKE 'pkv%tarifoptimierung' ORDER BY p."name" LIMIT 1),
    (SELECT s."productKey" FROM "LeadSubscription" s WHERE s."productKey" ILIKE 'pkv%tarifoptimierung' GROUP BY s."productKey" ORDER BY count(*) DESC LIMIT 1),
    'PKV-Tarifoptimierung'
  ),
  'verrata24 (tarifklar)',
  false,
  'live',
  'once',
  25,
  60.00,
  -- Beitrag unter 700 Euro und Beamte ausschließen, keine Einschränkung bei Gesellschaften
  false,
  700,
  false,
  false,
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  14,
  ARRAY['Kontaktdaten unbekannt', 'Spaßanfrage', 'Im Versicherungsvertrieb tätig', 'Nicht privat krankenversichert', 'Wohnsitz im Ausland']::TEXT[],
  false,
  'email',
  'service@tarifklar.de, kontakt@verrata24.de, e3cjuky6jy6sim5kjrl76w9nfgdgpmbe@hook.eu1.make.com',
  'maschinenlesbar',
  true,
  CURRENT_TIMESTAMP
FROM "Customer" c
WHERE c."name" = 'verrata24 GmbH'
  AND NOT EXISTS (SELECT 1 FROM "LeadSubscription" s WHERE s."customerId" = c."id" AND s."productKey" ILIKE 'pkv%tarifoptimierung')
ON CONFLICT ("id") DO NOTHING;
