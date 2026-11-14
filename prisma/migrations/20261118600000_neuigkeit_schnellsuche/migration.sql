-- Neuigkeit: Schnellsuche im Kundenbereich (Kontakt suchen, Strg K / ⌘K)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_schnellsuche', 'Kontakte sofort finden',
 'Mit **Kontakt suchen** oder dem Tastenkürzel **Strg K** (Mac: **⌘K**) öffnet sich jetzt überall eine Schnellsuche. Schon beim Tippen sehen Sie passende Kontakte nach Name, Telefonnummer oder E-Mail, die Nummer in jeder Schreibweise. Auf dem Handy finden Sie die Suche über die **Lupe** oben.',
 'verbessert', 'software', '2026-11-14 13:15:00', '2026-11-14 13:15:00', '2026-11-14 13:15:00')
ON CONFLICT ("id") DO NOTHING;
