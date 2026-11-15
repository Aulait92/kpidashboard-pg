-- Neuigkeit: Nachweis zum Hinweis auf das Widerspruchsrecht je Bestandskunde, Einwilligungslinks als Liste (15.11.2026)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "pushedAt", "createdAt", "updatedAt") VALUES
('upd_2611_widerspruchshinweis', 'E-Mails an Bestandskunden: Nachweis je Kunde',
 'E-Mails ohne Einwilligung gehen jetzt nur an Bestandskunden, für die ein Nachweis vorliegt, dass sie bei der Erhebung der Adresse auf ihr Widerspruchsrecht hingewiesen wurden. Diesen Nachweis tragen Sie beim Import oder unter **Bestand → Einwilligungen & Versand** ein. Dort und in jeder Kampagne finden Sie außerdem alle persönlichen Einwilligungslinks als Liste, zum Beispiel für einen Serienbrief.',
 'verbessert', 'software', '2026-11-15 15:00:00', NULL, '2026-11-15 15:00:00', '2026-11-15 15:00:00')
ON CONFLICT ("id") DO NOTHING;
