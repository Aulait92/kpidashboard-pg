-- Nico Yagci als Bestellkonto (Ole, 27.11.2026): Es gibt bereits einen archivierten Kunden „Nico Yagci“ (ohne Login).
-- Weil der Kundenname eindeutig ist, haben 20261122190000_bestellkonto und 20261127100000 kein neues Konto angelegt.
-- Darum den vorhandenen Kunden reaktivieren und als Hauptkunden nutzen: Registernummer, Makler (steuerfrei, Quelle Ole),
-- Partner Florian Bausch, Dennis Müller, Mikael. Der Login wird im Admin angelegt (Kundenakte → Team).
UPDATE "Customer"
SET "archived" = false,
    "vermittlerRegisterNr" = COALESCE("vermittlerRegisterNr", 'D-C9FQ-V848D-75'),
    "vermittlerRegisterStatus" = 'makler',
    "vermittlerGeprueftAt" = COALESCE("vermittlerGeprueftAt", NOW()),
    "vermittlerGeprueftVon" = COALESCE("vermittlerGeprueftVon", 'Ole (27.11.2026)')
WHERE "name" = 'Nico Yagci' AND "bestelltUeberId" IS NULL;

UPDATE "Customer" p SET "bestelltUeberId" = n."id"
FROM "Customer" n
WHERE n."name" = 'Nico Yagci' AND n."bestelltUeberId" IS NULL
  AND p."id" IN ('cmrorjboje89b1mp3n8s9pcww', 'cmuv436qmidrp2imrc21lcemv', 'cmsd7o2qr00111mozja8a14tb')
  AND p."id" <> n."id"
  AND NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c."bestelltUeberId" = p."id");
