# Allianz Onlinerechner: Rechtsschutz

**Stand:** 26.11.2026
**URL:** https://www.allianz.de/recht-und-eigentum/rechtsschutzversicherung/rechner/
**Technik:** Allianz Privatschutz App (Angular), Produktkonfiguration per JSON `privatschutz-prod.allianz.de/privatschutz/api/masterprodukt/rs-endkunde`.
**Testwerte (erfunden):** PLZ 10115, Geburtsdatum 01.01.1985, keine Status-Häkchen, keine Vorschäden, Lebensbereiche Privat, Beruf, Verkehr und Wohnen.
**Erreicht:** Schritt 1 und 2 vollständig, Dialog Vermieter-Rechtsschutz geöffnet (nichts bestätigt). Schritt 3 (Antrag) nicht betreten.

Ablauf: 1 Daten eingeben, 2 Angebot erhalten, 3 Antrag stellen.

## Schritt 1: Daten eingeben

Satzformular "Ich wohne in [PLZ], wurde am [Datum] geboren und möchte [Personen] versichern."

| Nr | Feld / Frage | Typ | Optionen | Pflicht | Abhängigkeiten, Hinweise |
|---|---|---|---|---|---|
| 1 | PLZ | Text | | ja | |
| 2 | Geburtsdatum | Datum | | ja | |
| 3 | Wen versichern? | Auswahl | mich selbst; mich, meine:n Partner:in und mein(e) Kind(er); mich und meine:n Partner:in; mich und mein(e) Kind(er) | ja (vorbelegt) | |
| 4 | Sind Sie: (falls zutreffend) | Mehrfachauswahl (Checkboxen) | Im öffentlichen Dienst tätig; Selbstständig; Geschäftsführer:in/Vorstand | nein | Selbstständig oder Geschäftsführer:in zeigt Hinweis: Schutz nur als Privatperson, kein Schutz für gewerbliche, freiberufliche oder selbstständige Tätigkeit sowie Geschäftsführer/Vorstand; dafür persönlicher Kontakt |
| 5 | Gab es in den letzten 5 Jahren einen Rechtsstreit oder eine Rechtsberatung? | Ja/Nein | | ja | Ja öffnet 5a |
| 5a | Anzahl der Rechtsstreitigkeiten und -beratungen | Zahl (Zähler) | ab 1 | ja bei Ja | mehr als 2: kein Online-Abschluss |
| 6 | Welche Lebensbereiche möchten Sie versichern? | Auswahl (Radio) | Privat, Beruf, Verkehr und Wohnen; Privat, Beruf und Verkehr; Privat und Verkehr; ausschließlich Verkehr | ja | steuert Produkt (Kombischutz oder Verkehrs-Rechtsschutz) und ob Frage 7 erscheint |
| 7 | Was ist Ihnen bei der Tarifauswahl am wichtigsten? | Auswahl (Radio) | bei "Privat, Beruf, Verkehr und Wohnen": Unser bestes Preis-Leistungs-Verhältnis; Unsere bestmögliche Leistungsabdeckung gegen einen höheren Beitrag. Bei "Privat, Beruf und Verkehr" zusätzlich: Ein günstiger Preis | ja, wenn sichtbar | erscheint nicht bei "Privat und Verkehr" und "ausschließlich Verkehr" |

## Schritt 2: Angebot erhalten

### Variante Kombischutz (Privat, Beruf, Verkehr, Wohnen)

| Feld | Typ | Optionen | Vorbelegung |
|---|---|---|---|
| Auswahl der Absicherung | Auswahl (Radio) | Rechtsschutz Privat (Kombischutz); Rechtsschutz Verkehr | gemäß Lebensbereich |
| Selbstbeteiligung | Auswahl | keine, 150 €, 300 €, 500 €, 1.000 € | 150 € |
| Zahlungsperiode | Auswahl | monatlich, vierteljährlich, halbjährlich, jährlich | monatlich |
| Produktlinie | Auswahl (Karten) | Basis, Smart, Komfort, Premium | Komfort |

Beispielbeiträge (Testfall, monatlich, SB 150 €, alle vier Bereiche): Basis 26,42 €, Smart 34,15 €, Komfort 40,83 €, Premium 69,69 €.

| Leistung | Basis | Smart | Komfort | Premium |
|---|---|---|---|---|
| Versicherungssumme | 1 Mio. € | 3 Mio. € | 5 Mio. € | unbegrenzt |
| Versicherungssumme weltweit (jeweils zeitlich unbegrenzt) | 100.000 € | 300.000 € | 500.000 € | 1 Mio. € |
| Strafkaution (Darlehen) | 100.000 € | 300.000 € | 500.000 € | 1 Mio. € |

Weitere Zeilen: Privat-Rechtsschutz, Verkehrs-Rechtsschutz (alle Fahrzeuge), Berufs-Rechtsschutz, Wohnen, erweiterte Leistungen im Privat-Rechtsschutz. In allen Linien: telefonische Rechtsberatung, Kostenübernahme, Mediationskosten.

### Variante "ausschließlich Verkehr"

| Feld | Typ | Optionen | Vorbelegung |
|---|---|---|---|
| Fahrzeuge | Auswahl | kein Fahrzeug; ein Fahrzeug; alle meine Fahrzeuge | ein Fahrzeug |
| Art des Fahrzeugs | Auswahl | PKW; Kraftrad; Wohnmobil | PKW |
| Selbstbeteiligung | Auswahl | keine, 150 €, 300 €, 500 €, 1.000 € | 150 € |
| Zahlungsperiode | Auswahl | wie oben | monatlich |

Angeboten wird nur "Rechtsschutz Verkehr Komfort" (Test: 11,67 € monatlich, Versicherungssumme 5 Mio. €).

### Zusatzbausteine (Kombischutz)

| Baustein | Typ | Zusatzfelder | Beispielbeitrag |
|---|---|---|---|
| Straf-Rechtsschutz im Beruf (für Nichtselbstständige) | an/aus | | 12,76 € monatlich |
| Vermieter-Rechtsschutz | Dialog "Jetzt Berechnen" | siehe unten | abhängig |

Dialog Vermieter-Rechtsschutz ("Angaben zu den vermieteten Objekten", mehrere Objekte über "Adresse hinzufügen"):

| Feld | Typ | Optionen |
|---|---|---|
| Beschaffenheit des Grundstücks | Auswahl (Radio) | bebaut; unbebaut |
| Adresse des vermieteten Objekts | Text / Auswahl | PLZ, Ort, Straße (Auswahl), Hausnummer |
| Wohneinheiten | Zahl (Zähler) + Gesamtbruttojahresmiete in Euro (Zahl) | nur bei "bebaut" |
| Gewerbeeinheiten | Zahl (Zähler) + Gesamtbruttojahresmiete in Euro | nur bei "bebaut" |
| Zusätzliche Garagen/Stellplätze | Zahl (Zähler) + Gesamtbruttojahresmiete in Euro | nur bei "bebaut" |

Die Folgefelder bei "unbebaut" wurden nicht geprüft. Nichts bestätigt.

## Knock-outs und Grenzen im Rechner

* Mehr als 2 Rechtsstreitigkeiten oder Beratungen in 5 Jahren.
* Selbstständige Tätigkeit und Geschäftsführung sind nicht versicherbar (nur Hinweis, kein Abbruch).

## Abgleich mit unserer Liste

| Unser Punkt | Fragt die Allianz? | Anmerkung |
|---|---|---|
| Geburtsdatum | ja | |
| Familienstand / Mitversicherte | teilweise | "Wen versichern" mit 4 Konstellationen |
| Beruf / Status | teilweise | Checkboxen öffentlicher Dienst, selbstständig, Geschäftsführer:in/Vorstand; **kein Rentner**, kein "angestellt" (gilt als Standard) |
| Aktueller Versicherer und Ablauf | nein | auch keine Frage nach Vorversicherung |
| Vorschäden 5 Jahre | ja | als Rechtsstreit oder Rechtsberatung, mit Anzahl |
| Selbstbeteiligung | ja | keine bis 1.000 € |
| Bausteine Privat/Beruf/Verkehr/Wohnen | teilweise | nur 4 feste Kombinationen, kein freies Baukastensystem (z. B. Privat + Wohnen ohne Beruf nicht wählbar) |
| Fahrzeuge | teilweise | nur im Pfad "ausschließlich Verkehr": Anzahl (kein/ein/alle) und Art (PKW, Kraftrad, Wohnmobil); im Kombischutz "alle Fahrzeuge" ohne Frage |
| Vermietete Objekte | ja (Baustein) | Vermieter-Rechtsschutz mit Adresse, Einheiten und Bruttojahresmiete |
| Laufende Streitigkeiten | nein | nur Rückblick 5 Jahre |
| Vorversicherung | nein | |

**Fragt die Allianz zusätzlich:** Tarifpräferenz (abhängig vom Lebensbereich), Straf-Rechtsschutz im Beruf, Bruttojahresmieten der vermieteten Einheiten.

Screenshots: `rechtsschutz-angebot.png`, `rechtsschutz-vermieter-dialog.png`
