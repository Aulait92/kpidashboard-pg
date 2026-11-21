-- Neuigkeit (21.11.2026): Kfz-Versicherung als Produkt im Assistenten. Der Assistent bittet Kfz-Leads nach der Buchung
-- um Fahrzeugschein und letzte Rechnung der bisherigen Kfz-Versicherung (Rückfall: Schlüsselnummern und SF-Klasse
-- im Chat) und lädt ein, weitere Policen mitzuschicken. Ausgelesen werden HSN, TSN, SF-Klassen, Versicherer und die
-- volle Versicherungsscheinnummer. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_kfz_produkt', 'Kfz-Versicherung: alle Angaben für den Beitrag vor dem Termin',
 'Bei Leads für die Kfz-Versicherung bittet Ihr Assistent nach der Buchung um ein Foto vom Fahrzeugschein und von der letzten Rechnung der bisherigen Kfz-Versicherung, gern auch um weitere Policen wie Haftpflicht oder Hausrat. In der **Terminvorbereitung** sehen Sie dann Hersteller- und Typschlüssel, SF-Klassen, den bisherigen Versicherer und die volle Versicherungsscheinnummer für die Übernahme der SF-Klasse.',
 'neu', 'software', '2026-11-21 12:05:00', '2026-11-21 12:05:00', '2026-11-21 12:05:00')
ON CONFLICT ("id") DO NOTHING;
