# Allianz Onlinerechner: Eingabefelder je Sparte

**Stand:** 26.11.2026. Erfasst mit Playwright (Chromium, normale Geschwindigkeit, ein Rechner nach dem anderen) und erfundenen Testwerten (PLZ 10115, Geburtsdatum 01.01.1985, 80 m², Baujahr 1995). Cookies: nur notwendige ("Alle ablehnen"). Gestoppt jeweils vor dem Antrag mit persönlichen Daten, nichts abgesendet. Keine Bot-Prüfung umgangen.

Zweck: Grundlage für die Angebotsvorbereitung durch Vermittler. Die Detaildateien enthalten Schritte, Feldtypen, alle Optionen, Abhängigkeiten und Knock-outs.

| Sparte | Datei | Status |
|---|---|---|
| Privathaftpflicht | [privathaftpflicht.md](privathaftpflicht.md) | vollständig bis Angebot |
| Hausrat | [hausrat.md](hausrat.md) | vollständig bis Angebot |
| Rechtsschutz | [rechtsschutz.md](rechtsschutz.md) | vollständig bis Angebot |
| Wohngebäude | [wohngebaeude.md](wohngebaeude.md) | vollständig bis Angebot |
| Kombi Hausrat, Haftpflicht, Rechtsschutz | [kombi-hausrat-haftpflicht-rechtsschutz.md](kombi-hausrat-haftpflicht-rechtsschutz.md) | **nur Schritt 1**, danach Cloudflare Turnstile; Rest aus öffentlicher Textdatei |
| Tierhalterhaftpflicht | [tierhalterhaftpflicht.md](tierhalterhaftpflicht.md) | **nur Schritt 1**, danach Cloudflare Turnstile; Rest aus öffentlicher Textdatei |
| Tierkranken | [tierkranken.md](tierkranken.md) | vollständig bis Angebot |
| Unfall | [unfall.md](unfall.md) | vollständig bis Angebot, zusätzlich öffentliche Formular-Konfiguration |

## Pflichtfelder für einen Beitrag und optionale Bausteine

"Pflichtfelder" sind die Angaben aus Schritt 1, ohne die kein Beitrag berechnet wird (Standardpfad). Bedingte Pflichtfelder stehen in Klammern. Stellschrauben in Schritt 2 sind vorbelegt und daher nicht mitgezählt.

### Privathaftpflicht: 5 Pflichtfelder
PLZ; Geburtsdatum; Wen versichern (4 Konstellationen); Haftpflichtschaden in 5 Jahren (bei Ja: Anzahl); Tarifpräferenz.
Schritt 2: Zahlweise, Selbstbeteiligung (keine bis 1.000 €), Linie Basis/Smart/Komfort/Premium.
Optionale Bausteine: Öltank-Haftpflicht; Dienst-Haftpflicht (öffentlicher Dienst); Wohnungs-Haftpflicht für Vermieter (1 bis 10 Wohnungen).

### Hausrat: 9 Pflichtfelder
PLZ; Straße; Hausnummer; ständig bewohnt; Wohnfläche; Geburtsdatum; Einfamilien- oder Mehrfamilienhaus (bei MFH: Stockwerk); Hausratschaden in 5 Jahren (bei Ja: Anzahl je Hausrat, Fahrrad, Elementar); Tarifpräferenz.
Schritt 2: Zahlweise, Versicherungssumme empfohlen (650 €/m²) oder individuell, Selbstbeteiligung (keine bis 2.000 €), Linie.
Optionale Bausteine: Extremwetterschutz (vorausgewählt); Fahrradschutz (1.000 bis 16.000 €); Glasschutz Hausrat; Glasschutz Gebäude; Internetschutz. Notfallservice Zuhause inklusive.

### Rechtsschutz: 5 Pflichtfelder
PLZ; Geburtsdatum; Wen versichern; Rechtsstreit oder Beratung in 5 Jahren (bei Ja: Anzahl); Lebensbereiche (4 feste Kombinationen). (Tarifpräferenz nur bei zwei der vier Kombinationen.) Status-Häkchen öffentlicher Dienst, selbstständig, Geschäftsführung sind optional.
Schritt 2: Selbstbeteiligung (keine bis 1.000 €), Zahlweise, Linie; bei "ausschließlich Verkehr" zusätzlich Fahrzeuge (kein, ein, alle) und Fahrzeugart (PKW, Kraftrad, Wohnmobil).
Optionale Bausteine: Straf-Rechtsschutz im Beruf; Vermieter-Rechtsschutz (Objekt bebaut/unbebaut, Adresse, Wohn-, Gewerbe-, Garageneinheiten je mit Bruttojahresmiete).

### Wohngebäude: 13 Pflichtfelder
PLZ; Straße; Hausnummer; Wohnfläche; Baujahr; Geburtsdatum; Wohneinheiten; Nutzung (Mehrfachauswahl); Bauweise und Merkmale (Mehrfachauswahl, bei Keller: Wohnräume, bei Schwimmbad: Lage); Haus- und Heiztechnik (Mehrfachauswahl); weitere Gebäude (bei Ja: Flächenklasse); Vorversicherung 5 Jahre; Schäden 5 Jahre (bei Ja: Anzahl je Gefahr). Keine Tarifpräferenz, keine Versicherungssumme.
Schritt 2: Zahlweise, Selbstbeteiligung (keine bis 10.000 €), Linie.
Optionale Bausteine: Extremwetterschutz (vorausgewählt, Risikostufe automatisch); Öltank-Haftpflicht (nur mit Ölheizung); Haus-Haftpflicht; Glasschutz Gebäude. Notfallservice Zuhause inklusive.

### Kombi Hausrat, Haftpflicht, Rechtsschutz: 7 Pflichtfelder in Schritt 1 (danach blockiert)
PLZ; Straße; Hausnummer; Wohnfläche; Geburtsdatum; Versicherte Personen; Wohnsituation (Mehrfamilienhaus, Einfamilienhaus als Eigentum, Einfamilienhaus zur Miete; bei MFH: Stockwerk).
Laut Textdatei folgen in Schritt 2 Detailfragen zu Hausrat (ständig bewohnt, Vorschäden, Versicherungssumme, Mitbewohner) und Haftpflicht (Vorschäden, Personen), Zahlweise und Selbstbeteiligung. Paket fest in Linie Komfort, 3 Jahre, 10 % Nachlass.
Optionale Bausteine (Textdatei): Extremwetter, Fahrrad, Glas, Internet, Öltank, Dienst-Haftpflicht, Wohnungs-Haftpflicht für Vermieter.

### Tierhalterhaftpflicht: 6 Pflichtfelder in Schritt 1 (danach blockiert)
PLZ; Geburtsdatum Halter; Tierkategorie (ein/mehrere Hunde, ein/mehrere Pferde; bei mehreren: Anzahl bis 10); Hunderasse je Hund bzw. Stockmaß je Pferd; Vorschäden 5 Jahre (bei Ja: Anzahl); Tarifpräferenz.
Laut Textdatei in Schritt 2: Selbstbeteiligung, Zahlweise, Linie. Keine erkennbaren Zusatzbausteine.

### Tierkranken: 8 Pflichtfelder
PLZ; Tierart (Hund, Katze, Pferd); Geschlecht; Tiername; Geburtsdatum des Tieres; Rasse (Hund: Rasse, Mischling mit Mutterrasse oder unbekannt mit Schulterhöhe; Katze: Rasse und Haltung; Pferd: Rasse); Gesundheitsfrage 24 Monate (bei Ja: betroffene Bereiche); Tarifpräferenz.
Schritt 2: Selbstbeteiligung (keine, 10 %, 20 %), Zahlweise, OP-Schutz oder Vollschutz, Linie Basis/Smart/Komfort.
Optionale Bausteine: keine.

### Unfall: 4 Pflichtfelder
Unfallschutz für (selbst oder Kind); Geburtsdatum (bzw. des Kindes); Berufstätigkeit (nur Erwachsene, 3 Gruppen); Invaliditätsfrage (bei Ja: Einmalzahlung bei Brüchen; bei Nein: Invaliditätsgrad 20 oder 50 %).
Schritt 2: Zahlweise, Vertragslaufzeit 1 oder 3 Jahre, Linie. Summen fest je Linie, keine Selbstbeteiligung.
Optionale Bausteine: keine.

## Abgleich mit unserer Fachliste

Legende: **ja** fragt die Allianz, **teilw.** nur eingeschränkt, **nein** fragt die Allianz nicht (fehlt dort), **n. a.** für die Sparte nicht relevant. Kombi und Tierhalter beruhen ab Schritt 2 auf der Textdatei.

### Alle Sparten

| Unser Punkt | PHV | Hausrat | RS | WG | Kombi | THV | TKV | Unfall |
|---|---|---|---|---|---|---|---|---|
| Geburtsdatum | ja | ja | ja | ja | ja | ja | **nein** (nur Tier) | ja |
| Familienstand / Mitversicherte | teilw. (4 Konstellationen) | nein | teilw. | n. a. | ja | nein | n. a. | teilw. (nur Kind) |
| Beruf / Status | nein | nein | teilw. (öD, selbstständig, GF; kein Rentner) | nein | nein | nein | nein | teilw. (3 Tätigkeitsgruppen) |
| Aktueller Versicherer und Ablauf | nein | nein | nein | teilw. (nur Ja/Nein) | im Antrag | im Antrag | nein | nein |
| Vorschäden 5 Jahre | ja | ja (3 Kategorien) | ja (Streit/Beratung) | ja (4 Gefahren) | ja | ja | anders (Gesundheit 24 Monate) | **nein** |
| Selbstbeteiligung | ja | ja | ja | ja | ja | ja | ja (prozentual) | n. a. (gibt es nicht) |

### Haftpflicht

| Unser Punkt | Allianz | Anmerkung |
|---|---|---|
| Hund / Pferd | nein | eigenes Produkt Tierhalterhaftpflicht |
| Vermietete Wohnung | ja | Baustein mit Anzahl 1 bis 10 |
| Drohne | nein | nicht gefragt, Deckung je Linie (ab Komfort) |
| Ehrenamt | nein | weder Frage noch Leistungszeile |
| Deckungssumme | nein | fest je Linie (15, 50, 75, 100 Mio. €) |

### Hausrat

| Unser Punkt | Allianz | Anmerkung |
|---|---|---|
| Wohnfläche | ja | max. 300 m² |
| Wohnung / Haus | ja | Einfamilien- oder Mehrfamilienhaus |
| Stockwerk EG | ja | nur bei Mehrfamilienhaus |
| Ständig bewohnt | ja | nicht ständig bewohnt ist Knock-out |
| Fahrrad | ja | Baustein, 1.000 bis 16.000 € |
| Elementar | ja | Baustein, vorausgewählt |
| Glas | ja | Baustein, innen und außen getrennt |
| Wertsachen | nein | Grenze fest je Linie |

### Rechtsschutz

| Unser Punkt | Allianz | Anmerkung |
|---|---|---|
| Bausteine Privat/Beruf/Verkehr/Wohnen | teilw. | nur 4 feste Kombinationen |
| Fahrzeuge | teilw. | nur bei "ausschließlich Verkehr" |
| Vermietete Objekte | ja | Baustein mit Objektdaten und Jahresmieten |
| Laufende Streitigkeiten | nein | nur Rückblick 5 Jahre |
| Vorversicherung | nein | |

### Wohngebäude

| Unser Punkt | Allianz | Anmerkung |
|---|---|---|
| Adresse | ja | Straße aus Liste |
| Gebäudetyp | teilw. | nur über Wohneinheiten |
| Wohneinheiten | ja | 3 und mehr Knock-out |
| Baujahr | ja | |
| Wohnfläche | ja | |
| Bauart | teilw. | nur "überwiegend Holz" |
| Dach | teilw. | Flachdach, weiche Bedachung |
| Keller | ja | plus Wohnräume |
| Ausgebautes DG | nein | |
| Garagen | nein | ausdrücklich nicht anzugeben, mitversichert |
| PV | ja | nur Checkbox |
| Heizung | ja | Mehrfachauswahl |
| Modernisierungen | nein | |
| Gewerbliche Nutzung | nein | |
| Elementar | ja | Baustein, Risikostufe automatisch |
| Ständig bewohnt | teilw. | über Ferienhaus und Leerstand |

### Was die Allianz zusätzlich fragt (fehlt in unserer Liste)

* Tarifpräferenz (Basis, günstig, Preis-Leistung, bestmöglich) in fast allen Rechnern.
* Zahlweise (monatlich bis jährlich) in allen Rechnern, Vertragslaufzeit in Unfall.
* Genaue Adresse mit Straße und Hausnummer bei Hausrat, Wohngebäude, Kombi (automatische Risikostufe Hochwasser/Starkregen).
* Hausrat: Art und Höhe der Versicherungssumme, Internetschutz.
* Wohngebäude: Schwimmbad, Denkmalschutz, Nebengebäude mit Fläche, Vermietung/Ferienhaus, Haus-Haftpflicht, Öltank.
* Privathaftpflicht: Öltank-Haftpflicht, Dienst-Haftpflicht.
* Rechtsschutz: Straf-Rechtsschutz im Beruf, Bruttojahresmieten bei Vermietung.
* Tiere: Rasse, Anzahl, Stockmaß, Gesundheitsfragen, Haltung, Tiername.
* Unfall: Bedarfsfragen zur Invalidität.

## Technische Hinweise

* Privathaftpflicht, Hausrat, Rechtsschutz, Wohngebäude und Tierkranken laufen in derselben App (`privatschutz-prod.allianz.de`); die Produktkonfiguration (Linien, Leistungen, Bausteine) ist pro Sparte öffentlich als JSON abrufbar (`/privatschutz/api/masterprodukt/<sparte>-endkunde`).
* Kombi und Tierhalterhaftpflicht laufen in einer anderen App (`inno-prod.allianz.de`) mit Cloudflare Turnstile vor der Berechnung. Für eine vollständige Erfassung müsste ein Mensch die Prüfung im Browser bestätigen.
* Unfall läuft in einer Journey App (`live.inno.kxlabs.allianz.de`), deren gesamte Formularkonfiguration als JSON öffentlich geladen wird.
* Beiträge sind Beispielwerte für die Testangaben und dienen nur zur Orientierung.


## Nachtrag 26.11.2026 (Ole, Screenshots iPhone)
- Tierhalterhaftpflicht: Schritt 1 bestätigt, deckungsgleich mit der Erfassung (PLZ, Geburtsdatum, Tierart/Anzahl, Rasse, Schäden 5 Jahre, Tarifwunsch).
- Kombi „Privatschutz“: kein eigener Rechner mit eigenen Feldern. Die Allianz bündelt einzelne Produkte (2 oder mehr aus Linie Komfort oder Premium, Rabatt 5 bis 20 %) und leitet dann zur Beratung. Für die Chat-Abfrage gelten daher die Felder der einzelnen Sparten; zusätzlich vermerken „Bündel gewünscht“.
