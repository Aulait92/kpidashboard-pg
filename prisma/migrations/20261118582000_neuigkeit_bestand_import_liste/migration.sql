-- Neuigkeit: Bestandskunden-Import ohne Namen, Prüfung der Zuordnung, Import rückgängig, aufgeräumte Kundenliste
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_bestand_import_liste', 'Bestand: Import ohne Namen, klarere Kundenliste',
 'Unter **Bestand → Kunden importieren** ist der Name kein Pflichtfeld mehr: Kundennummer, Telefon oder E-Mail reichen, Kunden ohne Namen werden neutral angesprochen. Passt eine Spalte nicht zum Feld, etwa E-Mail-Adressen als Telefon, sehen Sie das direkt am Feld, und einen falschen Import machen Sie mit **Letzten Import rückgängig machen** wieder weg. In der Kundenliste fragt **Empfehlungslink senden** jetzt kurz nach dem Anlass und zeigt den Text vorher.',
 'verbessert', 'software', '2026-11-14 12:59:00', '2026-11-14 12:59:00', '2026-11-14 12:59:00')
ON CONFLICT ("id") DO NOTHING;
