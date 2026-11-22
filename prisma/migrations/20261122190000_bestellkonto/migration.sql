-- Bestellkonto (Ole, 22.11.2026): Hauptkunden (Nico Yagci, Tobias D'Angelo) bestellen und bezahlen die
-- Wochenbestellungen ihrer Vertriebspartner selbst.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "bestelltUeberId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Customer" ADD CONSTRAINT "Customer_bestelltUeberId_fkey" FOREIGN KEY ("bestelltUeberId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Hauptkunden anlegen (Registernummer aus der Partnerliste, noch ungeprüft: bis zur Prüfung im Admin 19 % USt.)
INSERT INTO "Customer" ("id", "name", "vermittlerRegisterNr")
VALUES
  ('bestellkonto_nico_yagci', 'Nico Yagci', 'D-C9FQ-V848D-75'),
  ('bestellkonto_tobias_dangelo', 'Tobias D''Angelo', 'D-GS6X-WN5D2-79')
ON CONFLICT DO NOTHING;

-- Dennis Müller bestellt über Nico Yagci, Lukas Socki über Tobias D'Angelo
UPDATE "Customer" SET "bestelltUeberId" = 'bestellkonto_nico_yagci'
WHERE "id" = 'cmuv436qmidrp2imrc21lcemv' AND "bestelltUeberId" IS NULL AND EXISTS (SELECT 1 FROM "Customer" WHERE "id" = 'bestellkonto_nico_yagci');
UPDATE "Customer" SET "bestelltUeberId" = 'bestellkonto_tobias_dangelo'
WHERE "id" = 'cmsd7o2pa000q1moz708v9jjp' AND "bestelltUeberId" IS NULL AND EXISTS (SELECT 1 FROM "Customer" WHERE "id" = 'bestellkonto_tobias_dangelo');
