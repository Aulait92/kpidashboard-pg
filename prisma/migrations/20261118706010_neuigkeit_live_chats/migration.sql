-- Neuigkeit: Chats aktualisieren sich von selbst (16.11.2026): neue Nachrichten, Echos aus der
-- WhatsApp-Business-App und der Zähler „Wartet auf Sie“ ohne Neuladen, Hinweis „Neue Nachricht“. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_live_chats', 'Neue Nachrichten ohne Neuladen',
 'Neue WhatsApp-Nachrichten erscheinen unter **Nachrichten** nach wenigen Sekunden, ohne dass Sie die Seite neu laden. Das gilt auch für Nachrichten, die Sie in der WhatsApp-Business-App schreiben, und für die Zahl der Chats, die auf Sie warten. Schreibt jemand in einem anderen Chat oder haben Sie im Verlauf nach oben gescrollt, zeigt ein kleiner Hinweis „Neue Nachricht“ den Weg dorthin.',
 'verbessert', 'software', '2026-11-16 20:45:00', '2026-11-16 20:45:00', '2026-11-16 20:45:00')
ON CONFLICT ("id") DO NOTHING;
