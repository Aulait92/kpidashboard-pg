# Allianz Onlinerechner: Tierhalterhaftpflicht (Hund, Pferd)

**Stand:** 26.11.2026
**URL:** https://www.allianz.de/recht-und-eigentum/tierhalterhaftpflicht/rechner/
**Technik:** eigene App (`inno-prod.allianz.de/thh`), GraphQL Backend (Rassenliste per öffentlicher Abfrage `getAnimalRaces`), öffentliche Textdatei `inno-prod.allianz.de/thh/assets/i18n/de.json`.
**Testwerte (erfunden):** PLZ 10115, Geburtsdatum 01.01.1985, ein Hund, Rasse Labrador, keine Vorschäden, Bestes Preis-Leistungs-Verhältnis.

**Status: nur Schritt 1 auslesbar.** Wie im Kombirechner steht vor "JETZT TARIF BERECHNEN" eine Cloudflare Turnstile Prüfung. Alle Felder waren gültig befüllt, ohne Fehlermeldung, der Button blieb trotzdem deaktiviert. Die Prüfung wurde nicht umgangen. Angaben zu Schritt 2 und 3 stammen aus der öffentlichen Textdatei und sind **nicht im Ablauf verifiziert**.

Es laufen zwei Layout-Varianten (A/B-Test) mit denselben Inhalten:
* Variante A: Fragenblöcke "Angaben zum Versicherungsnehmer" und "Angaben zum Tier", Tierkategorie als Radio (Ein Hund, Mehrere Hunde, Ein Pferd, Mehrere Pferde).
* Variante B: Satzformular "Ich wohne in [PLZ], wurde am [Datum] geboren und möchte [Tierkategorie] versichern.", Tierkategorie als Auswahlliste (mehrere Hunde, mehrere Pferde, einen Hund, ein Pferd).

## Schritt 1: Daten eingeben (im Ablauf erfasst)

| Nr | Feld / Frage | Typ | Optionen | Pflicht | Abhängigkeiten, Hinweise |
|---|---|---|---|---|---|
| 1 | Postleitzahl ("Wo wohnen Sie?") | Zahl | | ja | |
| 2 | Geburtsdatum ("Wann wurden Sie geboren?") | Datum | | ja | ab 18 Jahren |
| 3 | Wer soll versichert werden? / Tierkategorie | Auswahl | Ein Hund; Mehrere Hunde; Ein Pferd; Mehrere Pferde | ja (vorbelegt Ein Hund) | steuert 4 bis 6 |
| 4 | Anzahl der Hunde bzw. Anzahl der Pferde | Zahl | ab 2 | ja bei "mehrere" | mehr als 10 Tiere: Verweis an Allianz Kontakt (Textdatei); je Tier wird eine Zeile ergänzt |
| 5 | Rasse des Hundes bzw. Rasse des 1., 2., ... Hundes | Auswahl mit Suche | 936 Einträge, oben Mischling groß (Widerristhöhe ab 45 cm), Mischling klein (bis 45 cm), Labrador, Golden Retriever, Jack Russell Terrier, Deutscher Schäferhund, Dackel, Französische Bulldogge, Chihuahua, Border Collie, danach alphabetisch | ja bei Hund | keine Listenhund-Frage, keine Ausschlussmeldung bei Rassen beobachtet |
| 6 | Stockmaß des Pferdes bzw. des 1., 2., ... Pferdes | Auswahl (Radio) | bis 148 cm; über 148 cm | ja bei Pferd | |
| 7 | Gab es in den letzten 5 Jahren Tierhalter-Haftpflichtschäden? | Ja/Nein | | ja | Ja öffnet "Anzahl der Schäden" (Zahl, mindestens 1); mehr als 4: kein Online-Abschluss |
| 8 | Was ist Ihnen bei der Tarifauswahl am Wichtigsten? | Auswahl (Radio) | Günstigster Preis; Bestes Preis-Leistungs-Verhältnis; Bestmögliche Leistungsabdeckung | ja | |
| | Cloudflare Turnstile | Bot-Prüfung | | | blockiert |

## Schritt 2: Angebot (laut Textdatei, nicht verifiziert)

* Satz "Ich möchte [Selbstbeteiligung] Selbstbeteiligung und zahle [Zahlungsweise]."
* Linien mit Leistungszeilen: Versicherungssumme, Schäden an geliehenen Gegenständen, nebenberufliche Nutzung des Tieres, Erstattung zum Neuwert, Verzicht auf Anrechnung Tiergefahr/Mitschuld, Tierbergung, zahlungsunfähige Dritte, Sportveranstaltungen/Lehrgänge, tierische Ausscheidungen, gewollter/ungewollter Deckakt, Einrichtung in Ferienunterkünften, geliehene Kfz-Anhänger.
* Werte aus der Textdatei: kleinste Linie 50 Mio. € Versicherungssumme und 50.000 € geliehene Gegenstände; mittlere Linie 75 Mio. €, Neuwert 1 Jahr bis 7.500 €; höchste Linie 100 Mio. €, Neuwert 2 Jahre.

## Schritt 3: Antrag (laut Textdatei, nicht betreten)

* Je Tier: Name, Geburtsdatum des Tieres, Geschlecht (männlich/weiblich); Pferd zusätzlich Rasse und Art der Kennzeichnung (Chipnummer, Lebensnummer, Tätowierung).
* Vorversicherung: "Besitzen Sie bereits eine Tierhalter-Haftpflichtversicherung?" mit Name des Vorversicherers, Versicherungsnummer, Ablauf.
* Versicherungsbeginn innerhalb von 6 Monaten, Vertragslaufzeit, danach persönliche Daten und Bankverbindung.

## Abgleich mit unserer Liste

| Unser Punkt | Fragt die Allianz? | Anmerkung |
|---|---|---|
| Geburtsdatum | ja | des Halters |
| Familienstand / Mitversicherte | nein | |
| Beruf / Status | nein | |
| Aktueller Versicherer und Ablauf | ja, im Antrag | laut Textdatei, nicht im Rechner |
| Vorschäden 5 Jahre | ja | mit Anzahl |
| Selbstbeteiligung | ja | Schritt 2 laut Textdatei, Stufen nicht auslesbar |

**Fragt die Allianz zusätzlich:** Tierart und Anzahl, Hunderasse (936 Einträge), Pferde-Stockmaß, Tarifpräferenz.

Screenshot: `tierhalterhaftpflicht-daten.png` (Variante A, befüllt, Button deaktiviert)
