-- Neuigkeit: Assistent fragt bei Privatschutz die Angaben fürs Angebot ab und nennt Unterlagen zum Termin
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_privatschutz_angaben', 'Privatschutz: Termine mit allen Angaben fürs Angebot',
 'Bei Privatschutz-Leads fragt Ihr Assistent vor dem Termin die Angaben ab, die Sie für ein Angebot brauchen, z. B. wer versichert werden soll, Geburtsjahr, Postleitzahl, Vorschäden, bestehende Verträge und je nach Sparte Wohnfläche, Gebäude oder Tier. Nach der Buchung sagt er dem Lead, welche Unterlagen er bereitlegen soll. Die Angaben sehen Sie im Kontakt.',
 'verbessert', 'software', '2026-11-15 12:00:00', '2026-11-15 12:00:00', '2026-11-15 12:00:00')
ON CONFLICT ("id") DO NOTHING;
