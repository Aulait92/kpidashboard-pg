# Allianz Onlinerechner: Hausrat

**Stand:** 26.11.2026
**URL:** https://www.allianz.de/recht-und-eigentum/hausratversicherung/rechner/
**Technik:** Allianz Privatschutz App (Angular), Produktkonfiguration per JSON `privatschutz-prod.allianz.de/privatschutz/api/masterprodukt/vhv_v2-endkunde`.
**Testwerte (erfunden):** PLZ 10115, Straße Chausseestr., Hausnummer 1, 80 m², Geburtsdatum 01.01.1985, Mehrfamilienhaus 1. Stock, keine Vorschäden.
**Erreicht:** Schritt 1 und 2 vollständig. Schritt 3 (Antrag) nicht betreten.

Ablauf: 1 Daten eingeben, 2 Angebot erhalten, 3 Antrag stellen.

## Schritt 1: Daten eingeben

Satzformular "Mein Haushalt befindet sich in [PLZ] [Straße] [Nr.] und wird [ständig bewohnt]. Die Wohnfläche beträgt [m²]. Ich bin am [Datum] geboren."

| Nr | Feld / Frage | Typ | Optionen | Pflicht | Abhängigkeiten, Hinweise |
|---|---|---|---|---|---|
| 1 | PLZ | Text | | ja | Ort wird ergänzt |
| 2 | Straße | Auswahl | Straßenliste zur PLZ (bei 10115 rund 60 Einträge) | ja | erscheint nach PLZ; dient der Gefahrenzonierung (Hochwasser, Starkregen) |
| 3 | Hausnummer | Text | | ja | erscheint nach PLZ |
| 4 | Bewohnung | Auswahl | ständig bewohnt; nicht ständig bewohnt | ja (vorbelegt "ständig bewohnt") | "nicht ständig bewohnt": kein Online-Abschluss |
| 5 | Wohnfläche | Zahl (m²) | | ja | mehr als 300 m²: kein Online-Abschluss |
| 6 | Geburtsdatum | Datum | | ja | |
| 7 | Wo befindet sich Ihr Haushalt? | Auswahl (Radio) | Einfamilienhaus; Mehrfamilienhaus | ja | Mehrfamilienhaus öffnet Frage 7a |
| 7a | In welchem Stockwerk befindet sich Ihr Haushalt im Mehrfamilienhaus? | Auswahl (Radio) | Erdgeschoss / Keller; 1. Stock oder höher | ja bei Mehrfamilienhaus | Einbruchrisiko |
| 8 | Hatten Sie in den letzten 5 Jahren einen Hausratschaden? | Ja/Nein | | ja | Ja öffnet 8a |
| 8a | Anzahl der Schäden, getrennt nach Kategorie | Zahl (Zähler) je Kategorie | Hausrat-Schäden; Fahrrad-Diebstahl; Weitere Naturgefahren (Elementar) | ja bei Ja (mindestens 1) | mehr als 4 Schäden: kein Online-Abschluss |
| 9 | Was ist Ihnen bei der Tarifauswahl am Wichtigsten? | Auswahl (Radio) | Basis-Schutz; Günstiger Preis; Bestes Preis-Leistungs-Verhältnis; Bestmögliche Leistungsabdeckung | ja | steuert vorausgewählte Linie |

## Schritt 2: Angebot erhalten

| Feld | Typ | Optionen | Vorbelegung |
|---|---|---|---|
| Zahlungsperiode | Auswahl | monatlich, vierteljährlich, halbjährlich, jährlich | monatlich |
| Art der Versicherungssumme | Auswahl | die empfohlene; eine individuelle | die empfohlene |
| Versicherungssumme | Zahl (€) | bei "empfohlen" 650 €/m² (80 m² ergibt 52.000 €), bei "individuell" frei | 52.000 € |
| Selbstbeteiligung | Auswahl | keine, 150 €, 300 €, 500 €, 1.000 €, 2.000 € | 300 € |
| Produktlinie | Auswahl (Karten) | Basis, Smart, Komfort, Premium | je nach Tarifpräferenz |

Regeln Versicherungssumme: Mindestwert laut Tooltip 5.000 €. Über 200.000 € online nur in Linie Premium möglich (andere Linien zeigen dann "Nicht auswählbar"). Ab 650 €/m² (Premium 900 €/m²) gilt Unterversicherungsverzicht.

Beispielbeiträge (Testfall, monatlich, SB 300 €): Basis 11,17 €, Smart 12,07 €, Komfort 19,42 €, Premium 47,51 €.

### Leistungen je Linie (Testfall, Seite)

| Leistung | Basis | Smart | Komfort | Premium |
|---|---|---|---|---|
| Versicherungssumme | 52.000 € | 52.000 € | 52.000 € | 72.000 € (900 €/m²) |
| Wertsachensumme | 10.400 € | 15.600 € | 20.800 € | 36.000 € |
| Grobe Fahrlässigkeit | nein | 52.000 € | 52.000 € | 72.000 € |

Weitere Leistungszeilen (mit Grenzen je Linie): Beschädigungen aller Art Zuhause, Schäden durch wildlebende Tiere, Gefriergut bei Stromausfall, Trickdiebstahl Zuhause, Transportmittelunfall, Hausrat dauerhaft im Selfstorage, erweiterte Deckung im Garten, Gartenlauben und Kleingärten, unbegrenzte Vorsorge, Allgefahrendeckung, Diebstahl unterwegs, Kostenerstattung nach Schadensfall. Die genaue Zuordnung siehe Screenshot `hausrat-angebot.png`.

In allen Linien: Feuer, Blitz, Explosion, Sturm/Hagel, Leitungswasser, Einbruchdiebstahl, Raub, Vandalismus nach Einbruch; Hausrat in Wohnung, Gemeinschaftsräumen und Garagen.

### Zusatzbausteine ("Sinnvolle Ergänzungen")

| Baustein | Typ | Zusatzfeld | Beispielbeitrag monatlich |
|---|---|---|---|
| Extremwetterschutz (Elementar: Überschwemmung, Rückstau, Schneedruck, Erdbeben u. a.) | an/aus, **vorausgewählt** | keine Eingabe; Seite zeigt ermittelte Risikostufe Hochwasser/Starkregen zur Adresse (Test: "Durchschnittliches Risiko") | 1,57 € |
| Notfallservice Zuhause | inklusive | | 0 € |
| Fahrradschutz | an/aus | Entschädigungsgrenze, Zahl, Min 1.000 € bis Max 16.000 € | abhängig |
| Glasschutz Hausrat (Innenverglasung) | an/aus | | 1,66 € |
| Glasschutz Gebäude (Außenverglasung) | an/aus | | 1,86 € |
| Internetschutz | an/aus | | 1,53 € |

Weiter: "WEITER ZUM ANTRAG" ("nur noch Ihre persönlichen Daten"). Hier gestoppt.

## Knock-outs im Rechner

* Haushalt nicht ständig bewohnt.
* Wohnfläche über 300 m².
* Mehr als 4 Vorschäden in 5 Jahren.
* Versicherungssumme über 200.000 € (außer Linie Premium).

## Abgleich mit unserer Liste

| Unser Punkt | Fragt die Allianz? | Anmerkung |
|---|---|---|
| Geburtsdatum | ja | Pflicht |
| Familienstand / Mitversicherte | nein | im Einzelrechner nicht gefragt |
| Beruf / Status | nein | |
| Aktueller Versicherer und Ablauf | nein | im Rechner nicht gefragt |
| Vorschäden 5 Jahre | ja | mit Anzahl getrennt nach Hausrat, Fahrrad-Diebstahl, Elementar |
| Selbstbeteiligung | ja | keine bis 2.000 € |
| Wohnfläche | ja | Pflicht, max. 300 m² |
| Wohnung / Haus | ja | Einfamilienhaus oder Mehrfamilienhaus |
| Stockwerk EG | ja | nur bei Mehrfamilienhaus: Erdgeschoss/Keller oder 1. Stock und höher |
| Ständig bewohnt | ja | nicht ständig bewohnt ist Knock-out |
| Fahrrad | ja (Baustein) | Entschädigungsgrenze 1.000 bis 16.000 € |
| Elementar | ja (Baustein) | Extremwetterschutz, vorausgewählt, Risikostufe automatisch aus Adresse |
| Glas | ja (Baustein) | getrennt Hausrat (innen) und Gebäude (außen) |
| Wertsachen | nein | keine Frage; Wertsachengrenze fest je Linie |

**Fragt die Allianz zusätzlich:** genaue Adresse (Straße, Hausnummer), Art und Höhe der Versicherungssumme, Internetschutz, Tarifpräferenz, Zahlweise.

Screenshot: `hausrat-angebot.png`
