-- Neuigkeit (25.11.2026): Protokoll der Support-Zugriffe auf Dokumente im Chat, mit Mitteilung. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_support_zugriffe', 'Mehr Transparenz: Sie sehen, wann unser Support ein Dokument geöffnet hat',
 'Öffnet unser Support bei einer Hilfe ein Dokument in Ihren WhatsApp-Chats, bekommen Sie eine E-Mail mit Grund. Alle Zugriffe stehen unter **Einstellungen → Support-Zugriffe**, Unterlagen mit Gesundheitsbezug bleiben dabei gesperrt.',
 'verbessert', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
