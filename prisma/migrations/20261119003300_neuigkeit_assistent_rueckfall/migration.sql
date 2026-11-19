-- Neuigkeit (19.11.2026): Sicherheitsnetz, wenn der Assistent nicht antwortet (lib/whatsapp/bot-stumm.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_assistent_rueckfall', 'Hinweis, wenn der Assistent nicht antwortet',
 'Antwortet der Assistent einmal nicht innerhalb von zwei Minuten, bekommt Ihr Kontakt eine kurze Rückmeldung, dass Sie sich melden. Sie sehen den Chat dann unter **Chats** mit Hinweis und eine Aufgabe am Kontakt, der Assistent pausiert in diesem Chat.',
 'verbessert', 'alle', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
