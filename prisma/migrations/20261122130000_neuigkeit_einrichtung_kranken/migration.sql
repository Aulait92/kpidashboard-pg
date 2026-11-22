-- Neuigkeit (21.11.2026): Freischaltung Kranken, BU und Leben als Schritt in der Einrichtung. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_einrichtung_kranken', 'Kranken, BU und Leben in der Einrichtung freischalten',
 'Damit Ihr Assistent auch Policen aus Kranken, BU und Leben annimmt, stimmen Sie einmal der Ergänzung zum Auftragsverarbeitungsvertrag zu. Das geht jetzt direkt in der **Einrichtung** im Schritt **Kranken, BU und Leben** oder unter **Einstellungen**. Haftpflicht, Hausrat und Kfz laufen auch ohne diesen Schritt.',
 'verbessert', 'software', '2026-11-21 17:02:26', '2026-11-21 17:02:26', '2026-11-21 17:02:26')
ON CONFLICT ("id") DO NOTHING;
