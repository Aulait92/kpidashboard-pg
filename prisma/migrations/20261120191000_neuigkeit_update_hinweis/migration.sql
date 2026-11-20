-- Neuigkeit (20.11.2026): Nach einem Update lädt die Seite sich selbst neu und sagt kurz Bescheid. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_update_hinweis', 'Nach einem Update geht es direkt weiter',
 'Wird die App gerade aktualisiert, während Sie etwas speichern, lädt die Seite sich selbst neu und sagt Ihnen kurz Bescheid. Tippen Sie dann einfach noch einmal.',
 'verbessert', 'alle', '2026-11-20 14:15:00', '2026-11-20 14:15:00', '2026-11-20 14:15:00')
ON CONFLICT ("id") DO NOTHING;
