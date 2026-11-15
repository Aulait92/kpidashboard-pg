-- Neuigkeit: Angebote als Tabelle prüfen, Produkt im Termin herausnehmen
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_angebote_tabelle', 'Angebote prüfen wie im Tarifrechner',
 'In der **Terminvorbereitung** sehen Sie Ihre Angebote jetzt je Sparte als Tabelle: Stufen nebeneinander, Beitrag und Leistungen direkt änderbar, Ihre Empfehlung per Klick. In der **Präsentation** wechseln Sie die Stufe auch auf der Folie „Das ist drin“, und auf der Beitragsfolie nehmen Sie ein Produkt mit einem Klick heraus oder wieder hinein.',
 'verbessert', 'software', '2026-11-15 20:40:00', '2026-11-15 20:40:00', '2026-11-15 20:40:00')
ON CONFLICT ("id") DO NOTHING;
