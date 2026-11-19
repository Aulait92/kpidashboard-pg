-- Jahresvorauszahlung (Ole, 19.11.2026): 3 Monate geschenkt statt 2 (9 statt 10 Monatsbeträge für 12 Monate).
-- 6 Monate im Voraus (1 Monat geschenkt) und der Abschlussbonus bleiben unverändert. Standard: PRICE_LIST.annualFreeMonths.
--
-- 1. Laufende Kunden behalten ihre Freimonate: neue Spalte Customer.prepayFreeMonths, gefüllt für alle Kunden mit
--    Vorauszahlung mit dem Wert, mit dem ihr Stripe-Abo bepreist ist: laut angenommenem Angebot, wenn dessen
--    Vorauszahlung zum Rhythmus passt (12 Monate → jährlich, 6 Monate → halbjährlich), sonst dem bisherigen Standard
--    (jährlich 2, halbjährlich 1; z. B. von Hand umgestellt). Änderungen am Abo (Logins, Module, Preisstufe, Zahlweise)
--    rechnen damit weiter, nicht mit dem neuen Standard (lib/billing.ts kundenFreimonate).
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "prepayFreeMonths" INTEGER;

UPDATE "Customer" c
SET "prepayFreeMonths" = COALESCE(
  (
    SELECT o."annualFreeMonths"
    FROM "Onboarding" ob
    JOIN "Offer" o ON o."id" = ob."offerId"
    WHERE ob."customerId" = c."id"
      AND o."annualPrepay" = true
      AND o."annualFreeMonths" IS NOT NULL
      AND ((o."term" = '6m' AND c."billingInterval" = 'halfyear') OR (o."term" <> '6m' AND c."billingInterval" = 'year'))
    LIMIT 1
  ),
  CASE WHEN c."billingInterval" = 'halfyear' THEN 1 ELSE 2 END
)
WHERE c."billingInterval" IN ('year', 'halfyear')
  AND c."prepayFreeMonths" IS NULL;

-- 2. Offene Angebote (Entwurf oder verschickt, nicht angenommen) mit 12 Monaten Laufzeit und gespeicherten 2 Freimonaten
--    bekommen 3: Angebotsseite, PDF, Annahme und Stripe lesen Offer.annualFreeMonths. Angebote ohne gespeicherten Wert
--    (null) nehmen ohnehin den Standard. Unverändert: angenommene, abgelehnte und ersetzte Angebote, 6-Monats-Angebote
--    (1 Monat geschenkt) und Sonderwerte (alles außer 2). Gespeicherte Summen gibt es nicht (Beträge werden gerechnet).
--    Jede Umstellung landet im Änderungsprotokoll (AuditLog "offer.jahr_3_monate").
WITH geaendert AS (
  UPDATE "Offer" o
  SET "annualFreeMonths" = 3
  WHERE o."status" IN ('draft', 'sent')
    AND o."acceptedAt" IS NULL
    AND o."term" = '12m'
    AND o."annualFreeMonths" = 2
  RETURNING o."id", o."number"
)
INSERT INTO "AuditLog" ("id", "at", "actorRole", "action", "entity", "entityId", "details")
SELECT
  'jahr3monate_' || g."id",
  NOW(),
  'system',
  'offer.jahr_3_monate',
  'Offer',
  g."id",
  jsonb_build_object('number', g."number", 'alt', 2, 'neu', 3)
FROM geaendert g
ON CONFLICT ("id") DO NOTHING;
