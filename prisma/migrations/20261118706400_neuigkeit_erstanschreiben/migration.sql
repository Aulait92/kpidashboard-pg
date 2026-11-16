-- Neuigkeit: neues Erstanschreiben des WhatsApp-Assistenten (16.11.2026): eine Begrüßung, Vorname des Vermittlers,
-- erste Frage fett, Erstinformation direkt danach als PDF. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_erstanschreiben', 'Kürzere erste WhatsApp an neue Leads',
 'Die erste Nachricht Ihres Assistenten an neue Leads ist jetzt kurz und persönlich: eine Begrüßung, Ihr Vorname aus der Erstinformation und gleich die erste Frage zum Produkt. Ihre Erstinformation folgt direkt danach als PDF statt als Link. Zu sehen unter **Nachrichten**.',
 'verbessert', 'software', '2026-11-16 23:15:00', '2026-11-16 23:15:00', '2026-11-16 23:15:00')
ON CONFLICT ("id") DO NOTHING;
