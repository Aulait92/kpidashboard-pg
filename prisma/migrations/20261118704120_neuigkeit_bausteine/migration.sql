-- Neuigkeit: Bausteine im Termin per Klick an- und abwählen
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_bausteine', 'Bausteine im Termin per Klick',
 'Tragen Sie in der **Terminvorbereitung** zu jedem Angebot Bausteine mit ihrem Beitrag aus dem Tarifrechner ein, etwa Zahnbehandlung oder eine höhere Selbstbeteiligung. Ist dem Kunden der Beitrag zu hoch, schalten Sie die Bausteine in der **Präsentation** direkt auf der Folie an oder ab. Der Beitrag rechnet sich sofort neu, und Ihr Kunde sieht, was dann nicht mehr versichert ist.',
 'neu', 'software', '2026-11-15 19:40:00', '2026-11-15 19:40:00', '2026-11-15 19:40:00')
ON CONFLICT ("id") DO NOTHING;
