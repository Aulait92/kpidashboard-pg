-- Neuigkeit: Datensatz (Pixel) in der Einrichtung freigeben und prüfen (Ole 15.11.2026)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "pushedAt", "createdAt", "updatedAt") VALUES
('upd_2611_datensatz_freigeben', 'Datensatz für Meta freigeben',
 'Unter **Einrichtung → Meta freigeben** prüft die App jetzt auch, ob Ihr Datensatz (Pixel) für uns freigegeben ist, und zeigt genau, was noch fehlt. Über den Datensatz erfährt Meta, welche Ihrer Leads zu Terminen und Verträgen werden. Noch keinen Datensatz? Die Anleitung zum Anlegen steht direkt dabei.',
 'verbessert', 'software', '2026-11-15 12:00:00', NULL, '2026-11-15 12:00:00', '2026-11-15 12:00:00')
ON CONFLICT ("id") DO NOTHING;
