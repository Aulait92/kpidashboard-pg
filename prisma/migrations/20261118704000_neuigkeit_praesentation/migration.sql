-- Neuigkeit: Angebote eintragen und Beratungspräsentation per Klick
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_praesentation', 'Beratungspräsentation per Klick',
 'In der **Terminvorbereitung** tragen Sie Ihre Angebote ein und markieren Ihre Empfehlung. Ein Klick auf **Präsentation** erstellt daraus eine bebilderte Beratungsstrecke mit den Angaben Ihres Kunden, in den Farben Ihrer Gesellschaft. Im Videocall teilen Sie den Bildschirm; der Sprechzettel für jede Folie ist nur für Sie sichtbar. Als PDF zum Nachschicken gibt es sie auch.',
 'neu', 'software', '2026-11-15 19:00:00', '2026-11-15 19:00:00', '2026-11-15 19:00:00')
ON CONFLICT ("id") DO NOTHING;
