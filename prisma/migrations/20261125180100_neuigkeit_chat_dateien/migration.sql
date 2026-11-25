-- Neuigkeit (25.11.2026): Dateien im Chat mit Name, Art und Größe, öffnen per Klick; nicht zugestellte Nachrichten,
-- die erneut rausgingen, sind gekennzeichnet. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_chat_dateien', 'Dateien im Chat direkt öffnen',
 'Unter **Nachrichten** sehen Sie bei jeder Datei Name, Art und Größe und öffnen sie mit einem Klick. Unterlagen Ihrer Kunden finden Sie wie gewohnt im Kontakt unter Dokumente.',
 'verbessert', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
