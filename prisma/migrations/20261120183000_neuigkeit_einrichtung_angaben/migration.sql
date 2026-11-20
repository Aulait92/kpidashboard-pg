-- Neuigkeit (20.11.2026): Einrichtung fragt Angaben nur einmal, Allianz-Kalender zuerst, Vorprüfung Meta. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_einrichtung_angaben', 'Einrichtung schneller erledigt',
 'Name, Telefon, Anschrift und Registernummer tragen Sie unter **Einrichtung → Ihre Angaben** nur noch einmal ein, Erstinformation und Signatur übernehmen sie. Allianz-Vertreter verbinden ihren Kalender direkt mit der Vertreternummer.',
 'verbessert', 'software', '2026-11-20 14:30:00', '2026-11-20 14:30:00', '2026-11-20 14:30:00')
ON CONFLICT ("id") DO NOTHING;
