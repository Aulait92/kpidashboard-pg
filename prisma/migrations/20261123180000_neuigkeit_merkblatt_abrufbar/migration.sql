-- Neuigkeit: Einwand-Merkblatt und Bilder der WhatsApp-Anleitung wieder abrufbar (Ole, 23.11.2026; src/middleware.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_merkblatt', 'Merkblatt zu Einwänden lässt sich öffnen',
 'Das Merkblatt „Einwände im Termin“ öffnet sich wieder, unter **Einrichtung** und in der Präsentation zum Termin. Auch die Bilder in der Anleitung zum Verbinden von WhatsApp werden wieder angezeigt.',
 'behoben', 'alle', '2026-11-23 16:28:00', '2026-11-23 16:28:00', '2026-11-23 16:28:00')
ON CONFLICT ("id") DO NOTHING;
