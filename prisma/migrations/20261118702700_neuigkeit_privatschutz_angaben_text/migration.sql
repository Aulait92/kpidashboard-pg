-- Neuigkeit Privatschutz-Angaben: Text an die Allianz-Rechner-Fragen angepasst (Geburtsdatum statt Geburtsjahr)
UPDATE "ProductUpdate" SET "body" = 'Bei Privatschutz-Leads fragt Ihr Assistent vor dem Termin die Angaben ab, die der Tarifrechner für ein Angebot braucht, z. B. wer versichert werden soll, Geburtsdatum, Adresse, Vorschäden, bestehende Verträge und je nach Sparte Wohnfläche, Gebäude oder Tier. Nach der Buchung sagt er dem Lead, welche Unterlagen er bereitlegen soll. Die Angaben sehen Sie im Kontakt.', "updatedAt" = NOW()
WHERE "id" = 'upd_2611_privatschutz_angaben';
