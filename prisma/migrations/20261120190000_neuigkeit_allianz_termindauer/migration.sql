-- Neuigkeit (20.11.2026): Allianz-Online-Kalender übernimmt die Termindauer, keine Termine vor dem frühesten Buchungstag, Beispielchat nach den eigenen Zeiten. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_allianz_termindauer', 'Allianz-Kalender: Termindauer wird übernommen',
 'Verbinden Sie unter **Einrichtung → Kalender und freie Zeiten** Ihren Allianz-Online-Kalender, übernimmt die App die Termindauer Ihrer Termin-Art. Termine bietet die App ab dem frühesten Buchungstag Ihres Allianz-Kalenders an, und der Beispielchat unter **Einstellungen → Assistent → Ablauf** zeigt nur Zeiten aus Ihren Beratungszeiten.',
 'verbessert', 'software', '2026-11-20 18:00:00', '2026-11-20 18:00:00', '2026-11-20 18:00:00')
ON CONFLICT ("id") DO NOTHING;
