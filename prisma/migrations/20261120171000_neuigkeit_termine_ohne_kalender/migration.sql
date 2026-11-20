-- Neuigkeit (20.11.2026): Termine ohne Google/Outlook, Einladung per Mail (App-Kalender). Dazu Vertreternummer und ältere Registernummer. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_termine_ohne_kalender', 'Termine auch ohne Google oder Outlook',
 'Ist Ihr Firmenkalender gesperrt, verbinden Sie unter **Einrichtung → Kalender und freie Zeiten** Ihren Allianz-Online-Kalender mit Ihrer Vertreternummer oder einen Kalender-Link. Gebuchte Termine bekommen Sie dann als Einladung per Mail und übernehmen sie mit einem Klick in Ihren Kalender.',
 'neu', 'software', '2026-11-20 12:25:00', '2026-11-20 12:25:00', '2026-11-20 12:25:00')
ON CONFLICT ("id") DO NOTHING;
