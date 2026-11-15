-- Neuigkeit: eigenes Logo auf der Beratungspräsentation
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_praesentation_logo', 'Ihr Logo auf der Präsentation',
 'Unter **Einstellungen → Logo für Präsentationen** holt die App das Logo von Ihrer Webseite, alternativ laden Sie es hoch. Nach Ihrer Bestätigung erscheint es auf der Titelfolie und auf jeder Folie Ihrer Beratungspräsentation.',
 'neu', 'software', '2026-11-15 19:10:00', '2026-11-15 19:10:00', '2026-11-15 19:10:00')
ON CONFLICT ("id") DO NOTHING;
