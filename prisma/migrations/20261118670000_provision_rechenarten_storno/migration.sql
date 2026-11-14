-- Provision, Bestand und Gewinn (Ole, 14.11.2026): Rechenarten je Sparte (Leben/BU nach Beitragssumme,
-- KFZ laufend, PKV-Neugeschäft höchstens 9,9 Monatsbeiträge, PKV-Tarifoptimierung als Honorar), eigene
-- Stornoquote, „Vertrag gekündigt bzw. storniert“ mit Rückbelastung, Gewinn-Schalter je Login und die
-- Aufgabe „Police da und erste Zahlung erfolgt?“. Nur hinzufügend plus Datenmigration.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "policeReminder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stornoQuote" DECIMAL(5,4);

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "policeRemindedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LeadContract" ADD COLUMN     "beitragssumme" DECIMAL(14,2),
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "chargeback" DECIMAL(12,2),
ADD COLUMN     "customerAge" INTEGER,
ADD COLUMN     "endAge" INTEGER,
ADD COLUMN     "termYears" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gewinnMitBestand" BOOLEAN NOT NULL DEFAULT false;

-- ─── Datenmigration ──────────────────────────────────────────────────────────

-- 1) PKV-Tarifoptimierung wird eine eigene Sparte (pkv_tarif, Honorar vom Kunden). Erste Verträge von Leads
--    mit Tarifoptimierung bzw. Wechsel (intern „Wechsel“, „PKV-Wechsel“, „PKV-Tarifoptimierung“) wechseln die
--    Sparte und behalten ihren bisherigen Wert: Bei Sparte „pkv“ war premium der Monatsbeitrag und die Provision
--    = Monatsbeiträge × Satz des Kunden (Standard 10, ohne Beitrag 2.500 €). Dieser Wert wird als fester
--    Provisionswert gespeichert, premium geleert (bei der Tarifoptimierung heißt premium jetzt „monatliche
--    Ersparnis“). Verträge mit Sparte „sonstiges“ (Lead-Quelle „Wechsel“) hatten schon einen festen Wert.
UPDATE "LeadContract" lc
SET "sparte" = 'pkv_tarif',
    "provisionValue" = CASE
      WHEN lc."premium" > 0 AND c."provisionRates"->'pkv'->>'kind' = 'fixed' THEN (c."provisionRates"->'pkv'->>'amount')::numeric
      WHEN lc."premium" > 0 THEN round(lc."premium" * COALESCE(CASE WHEN c."provisionRates"->'pkv'->>'kind' = 'monthly' THEN (c."provisionRates"->'pkv'->>'months')::numeric END, 10), 2)
      ELSE COALESCE(lc."provisionValue", CASE WHEN c."provisionRates"->'pkv'->>'kind' = 'monthly' THEN (c."provisionRates"->'pkv'->>'fallbackAmount')::numeric END, CASE WHEN c."provisionRates"->'pkv'->>'kind' = 'fixed' THEN (c."provisionRates"->'pkv'->>'amount')::numeric END, 2500)
    END,
    "premium" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Lead" l
JOIN "Customer" c ON c."id" = l."customerId"
WHERE l."id" = lc."leadId"
  AND lc."primaryLeadId" IS NOT NULL
  AND lc."sparte" = 'pkv'
  AND COALESCE(l."source", '') ~* 'tarif-?optim|§\s*204|^\s*(pkv[\s-]*)?wechsel';

UPDATE "LeadContract" lc
SET "sparte" = 'pkv_tarif', "updatedAt" = CURRENT_TIMESTAMP
FROM "Lead" l
WHERE l."id" = lc."leadId"
  AND lc."primaryLeadId" IS NOT NULL
  AND lc."sparte" = 'sonstiges'
  AND lc."premium" IS NULL
  AND COALESCE(l."source", '') ~* 'tarif-?optim|§\s*204|^\s*(pkv[\s-]*)?wechsel';

-- 2) BU wird eine eigene Sparte (bisher „Leben/BU“). Erste Verträge von BU-Leads wechseln; Beitrag bleibt.
UPDATE "LeadContract" lc
SET "sparte" = 'bu', "updatedAt" = CURRENT_TIMESTAMP
FROM "Lead" l
WHERE l."id" = lc."leadId"
  AND lc."primaryLeadId" IS NOT NULL
  AND lc."sparte" = 'leben_bu'
  AND COALESCE(l."source", '') ~* '\ybu\y|berufsunf';

-- Spiegel im Bestand (ExistingContract) passend zur neuen Sparte
UPDATE "ExistingContract" ec
SET "line" = CASE lc."sparte" WHEN 'bu' THEN 'BU' ELSE 'Kranken' END,
    "product" = CASE lc."sparte" WHEN 'bu' THEN 'BU' ELSE 'PKV-Tarifoptimierung (§ 204 VVG)' END,
    "annualPremium" = CASE lc."sparte" WHEN 'bu' THEN lc."premium" ELSE NULL END
FROM "LeadContract" lc
WHERE lc."id" = ec."leadContractId" AND lc."sparte" IN ('bu', 'pkv_tarif');

-- 3) PKV-Neugeschäft: höchstens 9,9 Monatsbeiträge (§ 50 VAG). Eigene Werte darüber auf 9,9 begrenzen.
--    Betroffene vorher: SELECT count(*) FROM "Customer" WHERE "provisionRates"->'pkv'->>'kind' = 'monthly'
--      AND ("provisionRates"->'pkv'->>'months')::numeric > 9.9;
UPDATE "Customer"
SET "provisionRates" = jsonb_set("provisionRates"::jsonb, '{pkv,months}', '9.9'::jsonb)
WHERE "provisionRates" IS NOT NULL
  AND "provisionRates"->'pkv'->>'kind' = 'monthly'
  AND ("provisionRates"->'pkv'->>'months') ~ '^[0-9]+(\.[0-9]+)?$'
  AND ("provisionRates"->'pkv'->>'months')::numeric > 9.9;

-- 4) Sach: typischer Jahresbeitrag 0 € ist nicht mehr zulässig → Standardbeitrag der Sparte.
CREATE OR REPLACE FUNCTION pg_temp.sach_default(k TEXT) RETURNS NUMERIC AS $$
  SELECT CASE k
    WHEN 'privatschutz' THEN 600 WHEN 'tkv' THEN 350 WHEN 'unfall' THEN 180 WHEN 'hausrat' THEN 120
    WHEN 'wohngebaeude' THEN 500 WHEN 'rechtsschutz' THEN 300 WHEN 'kfz' THEN 600 ELSE 300 END
$$ LANGUAGE sql IMMUTABLE;

UPDATE "Customer" c
SET "provisionRates" = (
  SELECT jsonb_object_agg(e.key,
    CASE WHEN e.value->>'kind' = 'percent' AND COALESCE(NULLIF(e.value->>'defaultPremium', ''), '0')::numeric = 0
      THEN jsonb_set(e.value, '{defaultPremium}', to_jsonb(pg_temp.sach_default(e.key)))
      ELSE e.value END)
  FROM jsonb_each(c."provisionRates"::jsonb) e
)
WHERE c."provisionRates" IS NOT NULL
  AND jsonb_typeof(c."provisionRates"::jsonb) = 'object'
  AND EXISTS (
    SELECT 1 FROM jsonb_each(c."provisionRates"::jsonb) e
    WHERE e.value->>'kind' = 'percent' AND COALESCE(NULLIF(e.value->>'defaultPremium', ''), '0') ~ '^[0-9.]+$'
      AND COALESCE(NULLIF(e.value->>'defaultPremium', ''), '0')::numeric = 0
  );

-- 5) Rechenart geändert: eigene Prozent-Sätze für Leben/BU und Kindersparplan (aus der Zeit, als diese
--    Sparten vorläufig wie Sach rechneten) und Prozent-Sätze für PKV passen nicht mehr und entfallen
--    (es gilt der neue Standard). Betroffene vorher:
--    SELECT count(*) FROM "Customer" WHERE "provisionRates"->'leben_bu'->>'kind' = 'percent'
--      OR "provisionRates"->'kindersparplan'->>'kind' = 'percent' OR "provisionRates"->'pkv'->>'kind' = 'percent';
UPDATE "Customer"
SET "provisionRates" = "provisionRates"::jsonb
  - (CASE WHEN "provisionRates"->'leben_bu'->>'kind' = 'percent' THEN 'leben_bu' ELSE '' END)
  - (CASE WHEN "provisionRates"->'kindersparplan'->>'kind' = 'percent' THEN 'kindersparplan' ELSE '' END)
  - (CASE WHEN "provisionRates"->'pkv'->>'kind' = 'percent' THEN 'pkv' ELSE '' END)
WHERE "provisionRates" IS NOT NULL
  AND ("provisionRates"->'leben_bu'->>'kind' = 'percent' OR "provisionRates"->'kindersparplan'->>'kind' = 'percent' OR "provisionRates"->'pkv'->>'kind' = 'percent');

-- Leeres Objekt = keine eigenen Sätze
UPDATE "Customer" SET "provisionRates" = NULL WHERE "provisionRates" IS NOT NULL AND "provisionRates"::jsonb = '{}'::jsonb;

-- 6) Verträge, die vor heute storniert wurden, haben keinen Grund (cancelReason NULL) und zählen wie bisher gar
--    nicht (weder Abschlussprovision noch Bestand). Neue Kündigungen haben immer einen Grund.
