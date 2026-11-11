-- Regeln: optional nur in der Gegenpartei suchen
ALTER TABLE "CostRule" ADD COLUMN "counterpartyOnly" BOOLEAN NOT NULL DEFAULT false;

-- Zuordnungen von Ole (11.11.): Verwaltung = „Sonstiger Betrieb“; USt nur bei deutschen Rechnungen mit 19 %.
-- Der Cron wendet die Regeln danach auf alle noch offenen Buchungen an.
INSERT INTO "CostRule" ("id", "pattern", "action", "vatIncluded", "counterpartyOnly", "label", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'odacer',            'betrieb', true,  false, 'Papierkram (Buchhaltung)', NOW(), NOW()),
  (gen_random_uuid()::text, 'papierkram',        'betrieb', true,  false, 'Papierkram (Buchhaltung)', NOW(), NOW()),
  (gen_random_uuid()::text, 'xing',              'akquise', true,  false, 'XING (Kundengewinnung)', NOW(), NOW()),
  (gen_random_uuid()::text, 'google cloud emea', 'betrieb', false, false, 'Google (E-Mail-Konto, Reverse Charge)', NOW(), NOW()),
  (gen_random_uuid()::text, 'kontoführung',      'betrieb', false, false, 'Kontoführung Commerzbank (umsatzsteuerfrei)', NOW(), NOW()),
  (gen_random_uuid()::text, 'telekom deutschland','betrieb', true, false, 'Telekom Handyvertrag', NOW(), NOW()),
  (gen_random_uuid()::text, 'phdrmueller',       'betrieb', true,  false, 'Steuerberater', NOW(), NOW()),
  (gen_random_uuid()::text, 'datev',             'betrieb', true,  false, 'DATEV (Verwaltung)', NOW(), NOW()),
  (gen_random_uuid()::text, 'asana',             'betrieb', false, false, 'Asana Projektmanagement (Reverse Charge)', NOW(), NOW()),
  (gen_random_uuid()::text, 'ole kannapinn',     'ignore',  false, true,  'Privat (Überweisung an Ole)', NOW(), NOW())
ON CONFLICT ("pattern") DO UPDATE SET
  "action" = EXCLUDED."action", "vatIncluded" = EXCLUDED."vatIncluded", "counterpartyOnly" = EXCLUDED."counterpartyOnly",
  "label" = EXCLUDED."label", "updatedAt" = NOW();
