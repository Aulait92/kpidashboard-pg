-- Neuigkeit (17.11.2026): Falsche Nummer, richtige Nummer per E-Mail erfragen. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_nummer_per_mail', 'Falsche Nummer: richtige Nummer per E-Mail erfragen',
 'Wählen Sie bei **Verloren** den Grund **Falsche oder ungültige Daten** und hat der Lead eine E-Mail-Adresse, bietet die App an, ihn in Ihrem Namen nach der richtigen Nummer zu fragen, mit Ihrem Terminlink. Der Kontakt bleibt offen, und nach 2 Werktagen erinnert Sie eine Wiedervorlage.',
 'neu', 'software', '2026-11-17 20:00:00', '2026-11-17 20:00:00', '2026-11-17 20:00:00')
ON CONFLICT ("id") DO NOTHING;
