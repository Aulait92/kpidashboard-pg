-- Partnerliste der Funnels (Ole, 20.11.2026): Empfänger je Abnehmer, Angaben von Ole
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "partnerFirma" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "partnerAnschrift" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "partnerRegisterNr" TEXT;

-- Dennis Müller ist Vertriebspartner von Nico Yagci
UPDATE "Customer" SET "partnerFirma" = 'Nico Yagci', "partnerAnschrift" = 'John-F.-Kennedy-Str. 27, 34128 Kassel', "partnerRegisterNr" = 'D-C9FQ-V848D-75'
WHERE "id" = 'cmuv436qmidrp2imrc21lcemv' AND "partnerFirma" IS NULL;
-- Lukas Socki ist Vertriebspartner von Tobias D'Angelo
UPDATE "Customer" SET "partnerFirma" = 'Tobias D''Angelo', "partnerAnschrift" = 'Friedrich-Ebert-Straße 48, 34117 Kassel', "partnerRegisterNr" = 'D-GS6X-WN5D2-79'
WHERE "id" = 'cmsd7o2pa000q1moz708v9jjp' AND "partnerFirma" IS NULL;
-- Heinrich von Kleist: SweetCars GmbH (Prokurist), Registernummer noch offen
UPDATE "Customer" SET "partnerFirma" = 'SweetCars GmbH', "partnerAnschrift" = 'Hauptstraße 21, 55599 Eckelsheim'
WHERE "id" = 'cmrnjzme3qqng1mp3x6ntzde2' AND "partnerFirma" IS NULL;
-- verrata24 GmbH
UPDATE "Customer" SET "partnerFirma" = 'verrata24 GmbH', "partnerAnschrift" = 'Friedloser Straße 74, 36251 Bad Hersfeld'
WHERE "id" = 'ppl_verrata24' AND "partnerFirma" IS NULL;
