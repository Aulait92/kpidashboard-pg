-- Neuigkeit (18.11.2026): „Später melden“ fasst Pause und Bedenkzeit am Kontakt zusammen (mit E-Mail an den Kontakt auf
-- Wunsch); reine Hausrat-Leads lesen in der ersten Nachricht „zu Ihrer Hausratversicherung“. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_spaeter_melden', 'Später melden: ein Knopf für Pause und Bedenkzeit',
 'Am Kontakt unter **Nächste Nachrichten → Später melden** wählen Sie einen Tag (vorgeschlagen sind 2 Wochen): Bis dahin geht nichts automatisch raus, danach geht es von selbst weiter, und liegt ein Angebot vor, fasst die App am Tag dazu nach. Auf Wunsch bekommt Ihr Kontakt eine kurze E-Mail, wann Sie sich melden. Wer nur eine Hausratversicherung angefragt hat, liest in der ersten Nachricht jetzt „zu Ihrer Hausratversicherung“ statt „zum Privatschutz“.',
 'verbessert', 'software', '2026-11-18 09:20:00', '2026-11-18 09:20:00', '2026-11-18 09:20:00')
ON CONFLICT ("id") DO NOTHING;
