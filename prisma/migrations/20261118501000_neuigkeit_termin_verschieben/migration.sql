-- Neuigkeit: Termin direkt in der App verschieben oder absagen
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_termin_verschieben', 'Termine direkt in der App verschieben',
 'Mit **Verschieben** am Termin öffnet sich jetzt ein Fenster in der App: neuen Zeitpunkt wählen oder den Termin absagen, ohne neuen Tab. Ihr Kontakt bekommt die Änderung automatisch mitgeteilt. Das geht im Kontakt, in den Chats und auf der Startseite.',
 'verbessert', 'software', '2026-11-14 11:59:00', '2026-11-14 11:59:00', '2026-11-14 11:59:00')
ON CONFLICT ("id") DO NOTHING;
