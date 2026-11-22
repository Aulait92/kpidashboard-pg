-- Neuigkeit (21.11.2026): Chatliste ohne Leads, die per WhatsApp nicht erreichbar sind (Festnetz, kein WhatsApp) und
-- nie geschrieben haben. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_chats_nur_erreichbare', 'Chats: nur Leads, die per WhatsApp erreichbar sind',
 'In **Chats** stehen jetzt nur noch Leads, die Ihre WhatsApp auch bekommen. Leads mit Festnetznummer oder ohne WhatsApp finden Sie wie bisher ganz oben unter **Heute** zum direkten Anrufen.',
 'verbessert', 'software', '2026-11-21 21:00:00', '2026-11-21 21:00:00', '2026-11-21 21:00:00')
ON CONFLICT ("id") DO NOTHING;
