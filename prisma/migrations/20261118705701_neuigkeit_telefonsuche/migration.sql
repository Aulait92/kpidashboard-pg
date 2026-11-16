-- Neuigkeit: Telefonnummern in der Suche (16.11.2026): jede Schreibweise und die letzten Ziffern finden den Kontakt.
-- Kunden hatten bemerkt, dass Nummern schlecht gefunden werden. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_telefonsuche', 'Kontakte über die Telefonnummer finden',
 'Die Suche findet Kontakte und Chats jetzt über jede Schreibweise der Telefonnummer, ob mit +49, mit 0, mit Leerzeichen oder Bindestrich. Die letzten fünf Ziffern reichen schon. Zu finden über **Kontakt suchen** (Strg K).',
 'verbessert', 'software', '2026-11-16 17:30:00', '2026-11-16 17:30:00', '2026-11-16 17:30:00')
ON CONFLICT ("id") DO NOTHING;
