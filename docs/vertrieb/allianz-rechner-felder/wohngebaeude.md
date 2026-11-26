# Allianz Onlinerechner: Wohngebäude

**Stand:** 26.11.2026
**URL:** https://www.allianz.de/recht-und-eigentum/wohngebaeudeversicherung/rechner/
**Technik:** Allianz Privatschutz App (Angular), Produktkonfiguration per JSON `privatschutz-prod.allianz.de/privatschutz/api/masterprodukt/vwg_v2-endkunde`.
**Testwerte (erfunden):** PLZ 10115, Chausseestr. 1, 80 m², Baujahr 1995, Geburtsdatum 01.01.1985, eine Wohneinheit, keine besondere Nutzung, Keller ohne Wohnfläche, Gasheizung, keine Nebengebäude, Vorversicherung Ja, keine Vorschäden.
**Erreicht:** Schritt 1 und 2 vollständig. Schritt 3 (Antrag) nicht betreten.

Ablauf: 1 Daten eingeben, 2 Angebot erhalten, 3 Antrag stellen. Der Rechner ist für Ein- und Zweifamilienhäuser gedacht ("Schutz für Ihr Ein- oder Zweifamilienhaus").

## Schritt 1: Daten eingeben

Satzformular "Mein Haus steht in [PLZ] [Straße] [Nr.]. Die Wohnfläche beträgt [m²] und das Baujahr ist [JJJJ]. Ich bin am [Datum] geboren."

| Nr | Feld / Frage | Typ | Optionen | Pflicht | Abhängigkeiten, Hinweise |
|---|---|---|---|---|---|
| 1 | PLZ | Text | | ja | Ort wird ergänzt |
| 2 | Straße | Auswahl | Straßenliste zur PLZ | ja | erscheint nach PLZ |
| 3 | Hausnummer | Text | | ja | |
| 4 | Wohnfläche | Zahl (m²) | | ja | |
| 5 | Baujahr | Zahl JJJJ | | ja | bei älterem Baujahr (getestet 1900 bis 1950: ja; 1995: nein) erscheint in Frage 8 zusätzlich die Option "Denkmalschutz" |
| 6 | Geburtsdatum | Datum | | ja | |
| 7 | Wie viele Wohneinheiten hat Ihr Haus? | Auswahl (Radio) | eine Wohneinheit; zwei Wohneinheiten; drei oder mehr Wohneinheiten | ja | drei oder mehr: kein Online-Abschluss |
| 8 | Wie wird Ihr Gebäude aktuell genutzt? | Mehrfachauswahl | Ferien-/Wochenendhaus; Vermietet (ganz oder teilweise); Leerstehend (ganz oder teilweise); Keine der Auswahlmöglichkeiten trifft zu | ja (mindestens eine) | Leerstehend: kein Online-Abschluss |
| 9 | Welche Bauweise und besondere Merkmale treffen auf Ihr Gebäude bzw. Grundstück zu? | Mehrfachauswahl | Flachdach; Dachbelag aus Naturschiefer, Holz, Ried, Schilf oder Stroh; Außenwände überwiegend aus Holz; Keller; Schwimmbad; (Denkmalschutz, nur bei älterem Baujahr); Keine der Auswahlmöglichkeiten trifft zu | ja (mindestens eine) | Keller öffnet 9a, Schwimmbad öffnet 9b |
| 9a | Sind im Keller Wohnräume vorhanden? | Auswahl (Radio) | Mit Wohnfläche; Ohne Wohnfläche | ja bei Keller | |
| 9b | Lage des Schwimmbads | Mehrfachauswahl | Im Gebäude; Außerhalb des Gebäudes | ja bei Schwimmbad | |
| 10 | Welche der folgenden Haus- und Heiztechniken sind vorhanden? | Mehrfachauswahl | Gasheizung; Ölheizung; Fern-/Nahwärme; Pellet-/Holzheizung; Wärmepumpenanlage; Solarthermische Anlagen; Photovoltaikanlage; Keine der Auswahlmöglichkeiten trifft zu | ja (mindestens eine) | keine Folgefragen (z. B. keine kWp bei Photovoltaik). Ölheizung beeinflusst Verfügbarkeit des Bausteins Öltank-Haftpflicht |
| 11 | Gibt es weitere Gebäude auf Ihrem Grundstück? ("Garagen oder Carports müssen nicht angegeben werden.") | Ja/Nein | | ja | Ja öffnet 11a |
| 11a | Wie groß ist die Gesamtfläche all Ihrer Nebengebäude auf dem Grundstück? | Auswahl (Radio) | 1 bis 25 m²; 26 bis 50 m²; 51 bis 100 m²; größer als 100 m² | ja bei Ja | |
| 12 | Besteht oder bestand für Ihr Gebäude in den letzten 5 Jahren bereits eine Wohngebäudeversicherung? | Ja/Nein | | ja | keine Folgefragen (kein Versicherer, kein Ablauf) |
| 13 | Gab es in den letzten 5 Jahren Schäden? | Ja/Nein | | ja | Ja öffnet 13a |
| 13a | Anzahl der Schäden je Gefahr | Zahl (Zähler) je Kategorie | Feuer; Leitungswasser; Sturm/Hagel; Weitere Naturgefahren (Elementar) | ja bei Ja | |

Hinweis: Im Wohngebäuderechner gibt es **keine** Frage zur Tarifpräferenz und **kein** Feld für eine Versicherungssumme (Erstattung zum Neubauwert, berechnet aus Angaben).

## Schritt 2: Angebot erhalten

| Feld | Typ | Optionen | Vorbelegung |
|---|---|---|---|
| Zahlungsperiode | Auswahl | monatlich, vierteljährlich, halbjährlich, jährlich | monatlich |
| Selbstbeteiligung | Auswahl | keine, 150 €, 300 €, 500 €, 1.000 €, 2.000 €, 5.000 €, 10.000 € | 500 € |
| Produktlinie | Auswahl (Karten) | Basis, Smart, Komfort, Premium | Komfort |

Beispielbeiträge (Testfall, monatlich, SB 500 €): Basis 33,80 €, Smart 42,00 €, Komfort 55,15 €, Premium 108,66 €.

In allen Linien: Hauptgebäude und benannte Nebengebäude, Garagen/Carports auf und außerhalb des Grundstücks, Neubauwert zzgl. Mehrkosten, Gefahren Feuer, Leitungswasser, Sturm/Hagel. Unterschiede je Linie u. a.: zusätzlich versicherte Kosten (bis 50.000 € bzw. 200.000 €), grobe Fahrlässigkeit, Ableitungsrohre, Nässeschäden durch undichte Fugen, Allgefahrenschutz (bis 100.000 €), Haus- und Technikschutz (50.000 €). Details siehe `wohngebaeude-angebot.png`.

### Zusatzbausteine ("Sinnvolle Ergänzungen")

| Baustein | Typ | Hinweis | Beispielbeitrag monatlich |
|---|---|---|---|
| Extremwetterschutz (Überschwemmung, Rückstau, Schneedruck, Erdbeben u. a.) | an/aus, **vorausgewählt** | Risikostufe Hochwasser/Starkregen wird zur Adresse ermittelt und angezeigt; höherer Selbstbehalt nur über Vermittler | 4,99 € |
| Öltank-Haftpflichtschutz | an/aus | im Test "Nicht verfügbar" (Gasheizung gewählt) | |
| Notfallservice Zuhause | inklusive | | 0 € |
| Haus-Haftpflichtschutz (für Vermieter) | an/aus | | 3,84 € |
| Glasschutz Gebäude | an/aus | | 1,11 € |

Weiter: "WEITER ZUM ANTRAG". Hier gestoppt.

## Knock-outs im Rechner

* Drei oder mehr Wohneinheiten.
* Gebäude ganz oder teilweise leerstehend.

## Abgleich mit unserer Liste

| Unser Punkt | Fragt die Allianz? | Anmerkung |
|---|---|---|
| Geburtsdatum | ja | |
| Familienstand / Mitversicherte | nein | nicht relevant |
| Beruf / Status | nein | |
| Aktueller Versicherer und Ablauf | teilweise | nur Ja/Nein "Vorversicherung in den letzten 5 Jahren", kein Name, kein Ablauf |
| Vorschäden 5 Jahre | ja | mit Anzahl je Gefahr |
| Selbstbeteiligung | ja | keine bis 10.000 € |
| Adresse | ja | PLZ, Straße (Auswahl), Hausnummer |
| Gebäudetyp | teilweise | nur über Anzahl Wohneinheiten (1, 2, 3+), kein Typ wie Reihenhaus oder Doppelhaushälfte |
| Wohneinheiten | ja | |
| Baujahr | ja | |
| Wohnfläche | ja | |
| Bauart | teilweise | nur "Außenwände überwiegend aus Holz" als Merkmal, keine Bauartklasse |
| Dach | teilweise | Flachdach und weiche Bedachung (Naturschiefer, Holz, Ried, Schilf, Stroh) |
| Keller | ja | plus Wohnräume im Keller |
| Ausgebautes DG | nein | |
| Garagen | nein | ausdrücklich nicht anzugeben, mitversichert |
| PV | ja | nur Checkbox, keine Leistung (kWp) oder Wert |
| Heizung | ja | Mehrfachauswahl Heiztechnik |
| Modernisierungen | nein | |
| Gewerbliche Nutzung | nein | Nutzung fragt nur Ferienhaus, vermietet, leerstehend |
| Elementar | ja (Baustein) | Extremwetterschutz vorausgewählt, Risikostufe automatisch |
| Ständig bewohnt | teilweise | über "Ferien-/Wochenendhaus" und "Leerstehend" |

**Fragt die Allianz zusätzlich:** Schwimmbad (im oder außerhalb des Gebäudes), Denkmalschutz (ältere Baujahre), Nebengebäude mit Flächenklasse, Vermietung, Haus-Haftpflicht, Glasschutz, Öltank-Haftpflicht.

Screenshots: `wohngebaeude-daten.png`, `wohngebaeude-angebot.png`
