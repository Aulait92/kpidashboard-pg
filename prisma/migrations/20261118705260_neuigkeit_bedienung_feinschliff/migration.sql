-- Neuigkeit: Bedienung, Feinschliff aus der UX-Prüfung Runde 4 (16.11.2026). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_bedienung_feinschliff', 'Schneller zu Termin und Präsentation',
 'Auf **Heute** öffnen Sie **Vorbereiten** und **Präsentation** jetzt direkt mit einem Tipp auf den Termin. Nach einem Anruf tragen Sie unter **Termin vereinbart** den Termin auch ohne verbundenen Kalender ein. Überfällige Wiedervorlagen sind im Kontakt und in der Kontaktliste rot markiert.',
 'verbessert', 'software', '2026-11-16 06:40:00', '2026-11-16 06:40:00', '2026-11-16 06:40:00')
ON CONFLICT ("id") DO NOTHING;
