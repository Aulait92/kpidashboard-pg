# Allianz Onlinerechner: Privathaftpflicht

**Stand:** 26.11.2026
**URL:** https://www.allianz.de/recht-und-eigentum/privat-haftpflichtversicherung/rechner/
**Technik:** Allianz Privatschutz App (Angular). Produktkonfiguration öffentlich per JSON unter `privatschutz-prod.allianz.de/privatschutz/api/masterprodukt/ph-endkunde` (Tarife, Leistungen, Zusatzbausteine).
**Testwerte (erfunden):** PLZ 10115, Geburtsdatum 01.01.1985, keine Vorschäden.
**Erreicht:** Schritt 1 und 2 vollständig. Schritt 3 (Antrag) nicht betreten, laut Seite folgen dort nur noch persönliche Daten.

Ablauf: 1 Daten eingeben, 2 Angebot erhalten, 3 Antrag stellen.

## Schritt 1: Daten eingeben

Satzformular "Ich wohne in [PLZ], wurde am [Datum] geboren und möchte [Personen] versichern."

| Nr | Feld / Frage | Typ | Optionen | Pflicht | Abhängigkeiten, Hinweise |
|---|---|---|---|---|---|
| 1 | PLZ | Text (5 Ziffern) | | ja | Ort wird automatisch ergänzt (10115 ergibt Berlin) |
| 2 | Geburtsdatum | Datum TT.MM.JJJJ | | ja | Mindestalter 18 Jahre ("Um diese Versicherung abschließen zu können, müssen Sie mindestens 18 Jahre alt sein.") |
| 3 | Wen versichern? | Auswahl | mich selbst; mich, meine:n Partner:in und mein(e) Kind(er); mich und meine:n Partner:in; mich und mein(e) Kind(er) | ja (vorbelegt "mich selbst") | steuert Single, Paar, Single mit Kind, Familie |
| 4 | Hatten Sie in den letzten 5 Jahren einen Haftpflichtschaden? | Ja/Nein | Ja, Nein | ja | Ja öffnet "Anzahl der Schäden" |
| 4a | Anzahl der Schäden | Zahl (Zähler mit Plus/Minus) | ab 1 | ja bei Ja | mehr als 4 Schäden: kein Online-Abschluss, Verweis an Allianz Kontakt |
| 5 | Was ist Ihnen bei der Tarifauswahl am Wichtigsten? | Auswahl (Radio) | Basis-Schutz; Günstiger Preis; Bestes Preis-Leistungs-Verhältnis; Bestmögliche Leistungsabdeckung | ja (Fehler "Bitte treffen Sie eine Auswahl.") | steuert nur die vorausgewählte Linie in Schritt 2 (Bestes Preis-Leistungs-Verhältnis ergibt Komfort) |

Button: TARIF BERECHNEN.

## Schritt 2: Angebot erhalten

| Feld | Typ | Optionen | Vorbelegung |
|---|---|---|---|
| Zahlungsperiode | Auswahl | monatlich, vierteljährlich, halbjährlich, jährlich | monatlich |
| Selbstbeteiligung | Auswahl | keine, 150 €, 300 €, 500 €, 1.000 € | 150 € |
| Produktlinie | Auswahl (Karten) | Basis, Smart, Komfort, Premium | je nach Tarifpräferenz |

Beispielbeiträge (Testfall, monatlich, SB 150 €): Basis 4,33 €, Smart 6,18 €, Komfort 7,54 €, Premium 11,30 €.

### Leistungen je Linie (aus Seite und Konfigurations-JSON)

| Leistung | Basis | Smart | Komfort | Premium |
|---|---|---|---|---|
| Versicherungssumme | 15 Mio. € | 50 Mio. € | 75 Mio. € | 100 Mio. € |
| Privater und beruflicher Schlüsselverlust | nein | 50.000 € | inklusive | inklusive |
| Schäden an geliehenen Gegenständen | nein | 50.000 € | 75.000 € | inklusive |
| Erstattung zum Neuwert | nein | nein | 7.500 € | inklusive |
| Rabattretter bei Unfällen mit geliehenen Fahrzeugen | nein | nein | nein | inklusive |
| Mallorca-Deckung | nein | inklusive | inklusive | inklusive |
| Schadensdeckung bei zahlungsunfähigen Dritten | nein | inklusive | inklusive | inklusive |
| Schäden durch nicht deliktfähige Personen | nein | 50.000 € | inklusive | inklusive |
| Drohnen und Flugmodelle | nein | nein | 7,5 Mio. € | inklusive |
| Nebenberufliche Tätigkeiten | nein | nein | inklusive | inklusive |

In allen Linien: Personen-, Sach- und Vermögensschäden, Mietsachschäden, nicht versicherungspflichtige Fahrzeuge (z. B. Fahrrad, Pedelec), Abwehr unberechtigter Forderungen.

### Zusatzbausteine ("Sinnvolle Ergänzungen")

| Baustein | Typ | Zusatzfeld | Beispielbeitrag monatlich |
|---|---|---|---|
| Öltank-Haftpflichtschutz | an/aus | | 2,89 € |
| Dienst-Haftpflichtschutz (Beamte, Angestellte im öffentlichen Dienst) | an/aus | | 3,39 € |
| Wohnungs-Haftpflichtschutz für Vermieter:innen | an/aus | Anzahl der Wohnungen, Zähler 1 bis 10 | 1,78 € (1 Wohnung), 5,95 € (10 Wohnungen) |

Weiter: "WEITER ZUM ANTRAG" mit Hinweis "Zum Abschluss im nächsten Schritt nur noch Ihre persönlichen Daten eingeben". Hier gestoppt. Alternativ "ZUR BERATUNG".

## Knock-outs im Rechner

* Alter unter 18 Jahren.
* Mehr als 4 Haftpflichtschäden in 5 Jahren.

## Abgleich mit unserer Liste

| Unser Punkt | Fragt die Allianz? | Anmerkung |
|---|---|---|
| Geburtsdatum | ja | Pflicht, ab 18 |
| Familienstand / Mitversicherte | teilweise | nur "Wen versichern" (4 Konstellationen), kein Familienstand |
| Beruf / Status | nein | öffentlicher Dienst nur indirekt über Baustein Dienst-Haftpflicht, kein selbstständig oder Rentner |
| Aktueller Versicherer und Ablauf | nein | im Rechner nicht gefragt (Antrag nicht geprüft) |
| Vorschäden 5 Jahre | ja | Ja/Nein plus Anzahl |
| Selbstbeteiligung | ja | Schritt 2, keine bis 1.000 € |
| Hund / Pferd | nein | eigenes Produkt Tierhalterhaftpflicht |
| Vermietete Wohnung | ja | als Baustein mit Anzahl 1 bis 10 |
| Drohne | nein | nicht gefragt, Deckung hängt an der Linie (ab Komfort) |
| Ehrenamt | nein | weder Frage noch eigene Leistungszeile |
| Deckungssumme | nein (nicht frei) | ergibt sich aus der Linie (15/50/75/100 Mio. €) |

**Fragt die Allianz zusätzlich:** Tarifpräferenz, Zahlweise, Öltank-Haftpflicht, Dienst-Haftpflicht.

Screenshot: `privathaftpflicht-angebot.png`
