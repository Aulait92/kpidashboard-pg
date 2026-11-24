-- Neuigkeit: Name im Chat und neue Anfrage mit derselben Nummer (Ole, 19.11.2026; lib/lead-name.ts, lib/lead-erneut.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_name_neue_anfrage', 'Richtiger Name in Chats und bei neuen Anfragen',
 'In **Chats** und unter **Kontakte** steht jetzt immer der Name aus der Anfrage oder Ihre Korrektur, nicht der WhatsApp-Profilname. Fragt jemand mit derselben Nummer erneut an, gilt der neue Name und der Verlauf bleibt. Ist es erkennbar eine andere Person, bekommt sie einen eigenen Kontakt samt Chat.',
 'verbessert', 'software', '2026-11-24 18:00:00', '2026-11-24 18:00:00', '2026-11-24 18:00:00')
ON CONFLICT ("id") DO NOTHING;
