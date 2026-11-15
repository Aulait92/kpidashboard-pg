-- Neuigkeit: Angebote automatisch auslesen (für alle freigeschaltet)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_angebote_auslesen', 'Angebote automatisch auslesen',
 'Laden Sie Ihr Angebot im Kontakt unter **Dokumente** hoch (Art „Angebot“), als PDF oder Screenshot aus dem Tarifrechner. In der **Terminvorbereitung** liest die App mit einem Klick Stufen, Beiträge und Leistungen aus und füllt die Tabelle. Sie prüfen, wählen Ihre Empfehlung und bestätigen. Das geht für Sach-, Haftpflicht-, Rechtsschutz-, Unfall- und Tierversicherungen.',
 'neu', 'software', '2026-11-15 21:00:00', '2026-11-15 21:00:00', '2026-11-15 21:00:00')
ON CONFLICT ("id") DO NOTHING;
