-- Neuigkeit: Anrede aus eindeutigem Vornamen (Ole, 16.11.2026; lib/vorname-anrede.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_anrede_automatisch', 'Anrede automatisch',
 'Ist der Vorname eindeutig, sprechen E-Mails und WhatsApp-Nachrichten Ihre Leads jetzt mit „Frau“ oder „Herr“ an. Passt es einmal nicht, ändern Sie die Anrede unter **Kontakt → Bearbeiten**.',
 'verbessert', 'software', '2026-11-16 05:05:00', '2026-11-16 05:05:00', '2026-11-16 05:05:00')
ON CONFLICT ("id") DO NOTHING;
