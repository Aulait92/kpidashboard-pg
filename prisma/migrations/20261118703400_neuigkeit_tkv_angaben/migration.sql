-- Neuigkeit: Assistent fragt bei Tierkrankenversicherung Gesundheit und Geburtsdatum des Halters ab
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_tkv_angaben', 'Tierkrankenversicherung: Gesundheitsfragen im Chat',
 'Bei Leads zur Tierkrankenversicherung fragt Ihr Assistent vor dem Termin die Gesundheit des Tieres in den letzten 24 Monaten ab (und welche Bereiche betroffen waren), ob nur OP-Schutz oder eine volle Krankenversicherung gewünscht ist, dazu das genaue Geburtsdatum des Tieres und das Geburtsdatum des Halters für den Antrag. Nach der Buchung sagt er, welche Unterlagen bereitliegen sollen, z. B. Heimtierausweis und Befunde. Die Angaben sehen Sie im Kontakt.',
 'verbessert', 'software', '2026-11-15 16:00:00', '2026-11-15 16:00:00', '2026-11-15 16:00:00')
ON CONFLICT ("id") DO NOTHING;
