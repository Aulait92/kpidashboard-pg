-- Nachlieferung statt Gutschrift bei Leadbestellungen (Ole, 24.11.2026: „wir liefern Leads immer nach und erstatten
-- nichts“). Alle bestehenden Bezüge behalten ihre alten Bedingungen (Gutschrift, nur laufende Woche); neue Bezüge
-- liefern für anerkannte Reklamationen Ersatzleads und offene Reste bezahlter Bestellungen nach.
ALTER TABLE "LeadSubscription" ADD COLUMN IF NOT EXISTS "stornoErsatz" BOOLEAN NOT NULL DEFAULT false;
UPDATE "LeadSubscription" SET "stornoErsatz" = false;
ALTER TABLE "LeadSubscription" ALTER COLUMN "stornoErsatz" SET DEFAULT true;

-- Bereits angenommene Leadangebote behalten ihre Bedingungen (Anzeige im Angebot, lib/legal-texts.ts agbFuerAngebot)
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "leadAltBedingungen" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Offer" SET "leadAltBedingungen" = true WHERE "acceptedAt" IS NOT NULL AND "package" IN ('ppl', 'ppl_software');

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "ersatzGeschuldet" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "ersatzFuerId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_ersatzFuerId_key" ON "Lead"("ersatzFuerId");
DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ersatzFuerId_fkey" FOREIGN KEY ("ersatzFuerId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
