-- Neuigkeit (19.11.2026): Erste WhatsApp an neue Leads kürzer, mit Antwortknöpfen; dazu Assistent zuverlässiger (Termin am Wunschtag, OP-Schutz). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_erstnachricht_knoepfe', 'Erste Nachricht an neue Leads mit Antwortknöpfen',
 'Die erste WhatsApp an Ihre neuen Leads ist jetzt kürzer und endet mit einer Frage, die Ihr Kontakt mit einem Tipp beantwortet, zum Beispiel „Nur Operationen“ oder „Auch Behandlungen“. Nennt Ihr Kontakt einen späteren Wunschtag für den Termin, schlägt der Assistent Zeiten an genau diesem Tag vor. Den Verlauf sehen Sie wie gewohnt unter **Chats**.',
 'verbessert', 'software', '2026-11-19 23:45:00', '2026-11-19 23:45:00', '2026-11-19 23:45:00')
ON CONFLICT ("id") DO NOTHING;
