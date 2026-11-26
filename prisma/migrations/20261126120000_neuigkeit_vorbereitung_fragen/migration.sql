-- Neuigkeit (26.11.2026, Fragen-Engine der Terminvorbereitung mit den Allianz-Sparten). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_angebotsdaten_vor_dem_termin', 'Angebotsdaten schon vor dem Termin',
 'Nach der Buchung fragt Ihr Assistent per WhatsApp kurz die Angaben ab, die Sie für das Angebot brauchen, eine Frage pro Nachricht und meist mit einem Tipp beantwortet: zum Beispiel Wohnsituation, Wohnfläche, Vorschäden, Tiere und bisherige Verträge. Bei mehreren Sparten kommt jede Frage nur einmal.

Die Antworten stehen in der **Terminvorbereitung**, was offen blieb, ist dort als Punkt für den Termin vermerkt.',
 'neu', 'alle', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
