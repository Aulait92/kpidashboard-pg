-- Neuigkeit: „Vertrag gekündigt bzw. storniert“ am Vertrag und Gewinn „Inkl. Bestand“ auf /buyer/zahlen
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_vertrag_gekuendigt_gewinn', 'Gekündigte Verträge eintragen, Gewinn mit künftigem Bestand',
 'Im Kontakt unter **Verträge → Vertrag gekündigt bzw. storniert** tragen Sie Datum, Grund und eine Rückbelastung ein: Ab dem Datum zählt der Vertrag nicht mehr für Ihre Bestandsprovision. Unter **Zahlen → Gewinn** zeigt **Inkl. Bestand** zusätzlich die künftige Bestandsprovision der Verträge aus dem gewählten Zeitraum über 5 Jahre, als Prognose mit Ihrer Stornoquote.',
 'neu', 'alle', '2026-11-14 14:53:00', '2026-11-14 14:53:00', '2026-11-14 14:53:00')
ON CONFLICT ("id") DO NOTHING;
