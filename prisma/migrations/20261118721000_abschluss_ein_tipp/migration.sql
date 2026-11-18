-- P4 „Abschluss erkennen und melden“ (Ole, 17.11.2026): Vorabend-Push je Lead einmal am Tag, Meldung des Leads im Chat,
-- Herkunft des Beitrags und einheitlicher Jahresbeitrag am Vertrag. Nur hinzufügend.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "abschlussFrageAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "abschlussGemeldetAt" TIMESTAMP(3);
ALTER TABLE "LeadContract" ADD COLUMN IF NOT EXISTS "premiumSource" TEXT;
ALTER TABLE "LeadContract" ADD COLUMN IF NOT EXISTS "premiumYear" DECIMAL(12,2);

-- Bestehende Beiträge: vom Vermittler eingetragen; Jahresbeitrag wie lib/abschluss.ts premiumYearFor
UPDATE "LeadContract" SET "premiumSource" = 'vermittler' WHERE "premium" IS NOT NULL AND "premiumSource" IS NULL;
UPDATE "LeadContract"
SET "premiumYear" = CASE
  WHEN "sparte" = 'pkv_tarif' THEN NULL
  WHEN "sparte" IN ('pkv', 'zahnzusatz', 'krankenzusatz', 'pflegezusatz', 'krankentagegeld') THEN ROUND("premium" * 12, 2)
  ELSE "premium"
END
WHERE "premium" IS NOT NULL AND "premiumYear" IS NULL;

-- Bewertungsbitte 14 statt 7 Tage nach dem Abschluss (P7; Modul Empfehlungen & Bewertungen, zurzeit ausgeblendet)
ALTER TABLE "ReviewSettings" ALTER COLUMN "reviewDelayDays" SET DEFAULT 14;
