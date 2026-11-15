-- Neuigkeit: Leads ohne WhatsApp sofort zum Anrufen
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_kein_whatsapp', 'Leads ohne WhatsApp sofort anrufen',
 'Ist die Nummer eines neuen Leads nicht per WhatsApp erreichbar, erfahren Sie das jetzt sofort per Push und der Lead steht ganz oben unter **Heute → Anrufen**, statt erst nach einem Tag. Hat er eine E-Mail-Adresse angegeben, bekommt er einmal eine kurze E-Mail in Ihrem Namen mit Ihrem Terminlink. Den Anteil dieser Leads sehen Sie unter **Zahlen**.',
 'verbessert', 'software', '2026-11-15 22:00:00', '2026-11-15 22:00:00', '2026-11-15 22:00:00')
ON CONFLICT ("id") DO NOTHING;
