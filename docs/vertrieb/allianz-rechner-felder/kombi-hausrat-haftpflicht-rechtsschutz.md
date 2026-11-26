# Allianz Onlinerechner: Kombi Hausrat, Haftpflicht, Rechtsschutz

**Stand:** 26.11.2026
**Angefragte URL:** https://www.allianz.de/recht-und-eigentum/hausrat-haftpflicht-rechtsschutz-kombi/ (Produktseite ohne Formular)
**Rechner-URL (Link "Jetzt berechnen"):** https://www.allianz.de/recht-und-eigentum/privatschutz/rechner/ ("Der Allianz Privatschutz Rechner")
**Technik:** eigene App (`inno-prod.allianz.de/bundle`), GraphQL Backend, öffentliche Textdatei `inno-prod.allianz.de/bundle/assets/i18n/de.json`.
**Testwerte (erfunden):** PLZ 10115, Chausseestr. 1, 80 m², Geburtsdatum 01.01.1985, mich selbst, Mehrfamilienhaus 1. Stock.

**Status: nur Schritt 1 auslesbar.** Vor "JETZT TARIF BERECHNEN" steht eine Cloudflare Turnstile Prüfung ("Bestätigen Sie, dass Sie ein Mensch sind"). Der Button bleibt deaktiviert, bis die Prüfung bestanden ist. Die Prüfung wurde nicht umgangen. Angaben zu Schritt 2 und 3 unten stammen ausschließlich aus der öffentlichen Textdatei (i18n) und sind **nicht im Ablauf verifiziert**.

## Produktseite (Kontext)

* Paket aus Privat-Haftpflicht, Hausrat und Rechtsschutz, jeweils im Tarif **Komfort**, 3-Jahresverträge, Lastschrift.
* 10 % Kombinachlass gegenüber Einzelabschluss (entfällt, wenn ein Vertrag gekündigt wird). Hausrat und Haftpflicht als Zweierpaket: 5 %.
* Rechenbeispiel der Seite: Haftpflicht 4,94 €, Hausrat 4,15 €, Rechtsschutz 26,49 €, zusammen 35,58 €, abzüglich 10 % ergibt 32,02 € monatlich.
* Inklusive: Notfallservice Zuhause, Geldbeutelschutz, telefonische Rechtsberatung.

## Schritt 1: Daten eingeben (im Ablauf erfasst)

Satzformular "Mein Haushalt befindet sich in [PLZ] [Ort], [Straße] [Hausnummer] und die Wohnfläche beträgt [m²]. Ich bin am [Datum] geboren und möchte [Personen] versichern."

| Nr | Feld / Frage | Typ | Optionen | Pflicht | Abhängigkeiten, Hinweise |
|---|---|---|---|---|---|
| 1 | Postleitzahl | Zahl | | ja | Ort wird ergänzt; PLZ ohne Straßen wird abgelehnt |
| 2 | Straße | Auswahl | Straßenliste zur PLZ | ja | |
| 3 | Hausnummer | Text | | ja | |
| 4 | Wohnfläche | Zahl (m²) | 1 bis 300 | ja | über 300 m² keine Online-Berechnung |
| 5 | Geburtsdatum | Datum | | ja | ab 18 Jahren |
| 6 | Versicherte Personen | Auswahl | mich selbst; mich und mein(e) Kind(er); mich und meine:n Partner:in; mich, meine:n Partner:in und mein(e) Kind(er) | ja (vorbelegt) | |
| 7 | Wo befindet sich Ihr Haushalt? | Auswahl (Radio) | Mehrfamilienhaus; Einfamilienhaus als Eigentum; Einfamilienhaus zur Miete | ja | Mehrfamilienhaus öffnet 7a. Laut Textdatei gibt es Paketvarianten mit Wohngebäude (Eigentum) bzw. Hundeschutz, Zuordnung zur Auswahl nicht verifiziert |
| 7a | In welchem Stockwerk befindet sich Ihr Haushalt im Mehrfamilienhaus? | Auswahl (Radio) | 1. Stock oder höher; Erdgeschoss/Keller | ja bei Mehrfamilienhaus | |
| | Cloudflare Turnstile | Bot-Prüfung | | | blockiert die automatisierte Erfassung |

## Schritt 2: Angebot (laut Textdatei, nicht verifiziert)

* Zahlungsweise, Selbstbeteiligung (Satz "Ich zahle ... und möchte ... Selbstbeteiligung").
* "Weitere Details" Hausrat: Ist Ihr Haushalt ständig bewohnt?; Hausratschaden in 5 Jahren (Ja/Nein) mit Anzahl getrennt nach Hausrat-Schäden, Fahrrad-Diebstahl, Weitere Naturgefahren (Elementar), mehr als 4 kein Online-Abschluss; Versicherungssumme empfohlen (650 €/m²) oder individuell (5.000 bis 200.000 €, keine Absenkung unter 650 €/m²); Wohnfläche; Wo befindet sich Ihr Haushalt; Stockwerk; Mit wem bewohnen Sie Ihren Haushalt (alleine, mit Partner:in, mit Kind(ern), mit Partner:in und Kind(ern)).
* "Weitere Details" Privat-Haftpflicht: Haftpflichtschaden in 5 Jahren mit Anzahl; Wen möchten Sie versichern.
* Für Rechtsschutz enthält die Textdatei keine eigenen Detailfragen.
* Optionen: Extremwetterschutz (Elementar), Fahrradschutz, Glasschutz, Internetschutz, Öltank-Haftpflicht, Dienst-Haftpflicht (öffentlicher Dienst), Wohnungs-Haftpflicht für Vermieter (mit Adresse und Wohnungsnummer je vermieteter Wohnung).

## Schritt 3: Antrag (laut Textdatei, nicht betreten)

* Vorversicherung: "Besitzen Sie bereits eine Hausratversicherung bzw. eine Privat-Haftpflichtversicherung?" mit Art der Versicherung, Name des Vorversicherers, Versicherungsnummer, Ablauf der Vorversicherung, "Wurde bereits gekündigt?" (Ja, ich habe gekündigt; Ja, mir wurde gekündigt; Nein).
* Gewünschter Versicherungsbeginn (innerhalb der nächsten 6 Monate), Vertragslaufzeit.
* Danach persönliche Daten und Bankverbindung (nicht erfasst).

## Abgleich mit unserer Liste (Basis: Schritt 1 plus Textdatei)

| Unser Punkt | Fragt die Allianz? | Anmerkung |
|---|---|---|
| Geburtsdatum | ja | |
| Familienstand / Mitversicherte | ja | Versicherte Personen (4 Konstellationen), im Hausratteil zusätzlich "Mit wem bewohnen Sie Ihren Haushalt" |
| Beruf / Status | nein | nur Baustein Dienst-Haftpflicht |
| Aktueller Versicherer und Ablauf | ja, im Antrag | Name, Nummer, Ablauf, Kündigungsstatus (laut Textdatei) |
| Vorschäden 5 Jahre | ja | Hausrat und Haftpflicht getrennt, laut Textdatei |
| Selbstbeteiligung | ja | laut Textdatei |
| Hausrat Wohnfläche, Wohnung/Haus, Stockwerk | ja | in Schritt 1 |
| Ständig bewohnt | ja | laut Textdatei |
| Rechtsschutz Bausteine, Fahrzeuge, vermietete Objekte, laufende Streitigkeiten | nicht erkennbar | im Paket fest Komfort, keine Detailfragen in der Textdatei |

Screenshot: `kombi-daten-turnstile.png` (zeigt die Turnstile Prüfung und den deaktivierten Button)
