-- Neue Listenpreise Betreuung + Software (Ole, 18.11.2026): 1.000/1.400/1.800 € → 990/1.390/1.790 € netto im Monat.
-- Offene Angebote (Entwurf oder verschickt, nicht angenommen) speichern den Monatspreis als Stand beim Anlegen. Haben sie
-- noch den alten Listenpreis ihrer Stufe (Werbebudget = Summe Tagesbudget × 30, plus 350 € je weiterem Produkt), gilt ab
-- jetzt der neue Listenpreis: Angebotsseite, PDF, Annahme und Stripe lesen alle "monthlyFee".
-- Unverändert bleiben: Sonderkonditionen (Monatspreis weicht vom alten Listenpreis ab), angenommene, abgelehnte und
-- ersetzte Angebote, Testangebote, Paket „Nur Betreuung“, ab 10 aktiven Verkäufern (individuell) sowie alle Kunden
-- und laufenden Abos. Gleiche Regel in TypeScript: listenpreisUmstellung() in src/lib/offer-pricing.ts.
-- Jede Umstellung landet im Änderungsprotokoll (AuditLog "offer.listenpreis_990"), Diagnose: q=preise-offen.
WITH produkte AS (
  SELECT
    o."id",
    o."number",
    ROUND(COALESCE(SUM(
      CASE WHEN jsonb_typeof(p.e -> 'dailyBudget') = 'number' THEN GREATEST((p.e ->> 'dailyBudget')::numeric, 0) ELSE 0 END
    ) FILTER (WHERE btrim(COALESCE(p.e ->> 'name', '')) <> ''), 0) * 30) AS budget,
    COUNT(*) FILTER (WHERE btrim(COALESCE(p.e ->> 'name', '')) <> '') AS anzahl
  FROM "Offer" o
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(o."products") = 'array' THEN o."products" ELSE '[]'::jsonb END
  ) AS p(e)
  WHERE o."status" IN ('draft', 'sent')
    AND o."acceptedAt" IS NULL
    AND o."isTest" = false
    AND o."package" <> 'service'
    AND (o."seats" IS NULL OR o."seats" < 10)
  GROUP BY o."id", o."number"
),
preise AS (
  SELECT
    "id",
    "number",
    (CASE WHEN budget <= 3000 THEN 1000 WHEN budget <= 6000 THEN 1400 ELSE 1800 END) + GREATEST(anzahl - 1, 0) * 350 AS alt,
    (CASE WHEN budget <= 3000 THEN 990 WHEN budget <= 6000 THEN 1390 ELSE 1790 END) + GREATEST(anzahl - 1, 0) * 350 AS neu
  FROM produkte
  WHERE anzahl > 0 AND budget <= 10000
),
geaendert AS (
  UPDATE "Offer" o
  SET "monthlyFee" = p.neu
  FROM preise p
  WHERE o."id" = p."id"
    AND o."monthlyFee" = p.alt
    AND o."status" IN ('draft', 'sent')
    AND o."acceptedAt" IS NULL
  RETURNING o."id", o."number", p.alt, p.neu
)
INSERT INTO "AuditLog" ("id", "at", "actorRole", "action", "entity", "entityId", "details")
SELECT
  'listenpreis990_' || g."id",
  NOW(),
  'system',
  'offer.listenpreis_990',
  'Offer',
  g."id",
  jsonb_build_object('number', g."number", 'alt', g.alt, 'neu', g.neu)
FROM geaendert g
ON CONFLICT ("id") DO NOTHING;
