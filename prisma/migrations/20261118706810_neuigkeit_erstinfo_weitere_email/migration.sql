-- Neuigkeit (17.11.2026): erste WhatsApp nur mit Erstinformation und in der eingestellten Ansprache; weitere E-Mail-Adresse
-- im Kontakt, wenn der Lead im Chat eine neue nennt. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_erstinfo_weitere_email', 'Erste WhatsApp mit Erstinformation, weitere E-Mail im Kontakt',
 'Die erste WhatsApp an neue Leads geht nur zusammen mit Ihrer Erstinformation als PDF raus und immer in der Ansprache aus Ihren Einstellungen. Nennt ein Lead im Chat eine neue E-Mail-Adresse, bleibt die bisherige im Kontakt unter **Angaben** als **Weitere E-Mail** erhalten, und die Suche findet den Kontakt auch darüber.',
 'verbessert', 'software', '2026-11-17 14:10:00', '2026-11-17 14:10:00', '2026-11-17 14:10:00')
ON CONFLICT ("id") DO NOTHING;
