-- Neuigkeit (19.11.2026): Tierkranken, gewünschter Umfang (OP, voll, beides) im Chat und in der Terminvorbereitung (lib/tkv-umfang.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_tkv_umfang', 'Tierkrankenversicherung: OP-Schutz oder Krankenversicherung',
 'Bei Anfragen zur Tierkrankenversicherung merkt sich der Assistent, ob Ihr Kunde nur OP-Schutz, die volle Krankenversicherung oder beides möchte, und spricht im Chat und in den Erinnerungen genau davon. In der **Terminvorbereitung** steht der Wunsch oben, die passende Tarifvariante ist schon ausgewählt.',
 'verbessert', 'alle', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
