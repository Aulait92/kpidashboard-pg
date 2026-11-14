-- Kollegen empfehlen (Ole, 14.11.2026):
--  - Empfohlene bekommen einen Rabatt auf die Einrichtung (Betrag netto, rechnet im Angebot und in Stripe)
--  - Empfehler bekommen als Prämie das Bestandskunden-Modul für N Monate gratis (Standard 3)
--  - Hinweise „Kollegen empfehlen“ im Kundenbereich per Schalter, Standard aus (nicht aktiv bewerben)
-- Nur additive Änderungen.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "bestandFreeReminded" TIMESTAMP(3),
ADD COLUMN     "bestandFreeUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "referralId" TEXT,
ADD COLUMN     "setupDiscount" DECIMAL(10,2),
ADD COLUMN     "setupDiscountLabel" TEXT,
ADD COLUMN     "setupListFee" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "ReferralSettings" ADD COLUMN     "benefitAmount" DECIMAL(10,2),
ADD COLUMN     "nudgesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rewardMonths" INTEGER;

-- Daten (einmalig): Oles Einstellung „Eigener Vorteil (Text)“ mit „500€ Rabatt auf die Einrichtung“ war nur
-- ein Text. Umstellen auf die rechenbare Option „Rabatt auf die Einrichtung“ mit 300 € (Ole, 14.11.2026).
-- Der Text bleibt gespeichert (falls wieder auf „Eigener Vorteil“ umgestellt wird).
UPDATE "ReferralSettings"
SET "benefitKind" = 'setup_discount', "benefitAmount" = 300, "updatedAt" = NOW()
WHERE "id" = 'default'
  AND "benefitKind" = 'custom'
  AND "benefitText" ILIKE '%500%'
  AND "benefitText" ILIKE '%einrichtung%';

-- Prämie für den Empfehler: Bestandskunden-Modul 3 Monate gratis (neuer Standard, gilt auch für Oles Einstellung).
UPDATE "ReferralSettings"
SET "rewardKind" = 'bestand', "rewardMonths" = 3, "rewardFixed" = NULL, "updatedAt" = NOW()
WHERE "id" = 'default';
