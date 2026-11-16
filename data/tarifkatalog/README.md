# Tarifkatalog (Stand 16.11.2026)

Tarifdaten für die Terminvorbereitung (Entwurf: `docs/ux/2026-11-15-aufraeumen-und-terminvorbereitung.md`, Teil 2 bis 4).
Je Sparte bis zu 3 Tarife einer Gesellschaft auf der Vergleichsfolie, höchstens 5 Merkmale und 2 Bausteine.
**Keine Preise:** Den Beitrag trägt der Vermittler selbst ein. Der Katalog liefert nur Tarifnamen, Kurznamen, Stufen,
Merkmal-Werte und Bausteine.

Prüftest: `npx vitest run tests/unit/tarifkatalog-daten.test.ts`

## Format

### `schema.json`
Gemeinsames Merkmal-Schema je Sparte, gleich für alle Gesellschaften.

```json
{ "sparten": [ { "key": "rechtsschutz", "label": "Rechtsschutz", "produkt": "privatschutz", "formularMatch": "Rechtsschutz",
   "merkmale": [ { "key": "vs", "label": "Versicherungssumme", "kurz": "Versicherungssumme", "standard": true } ],
   "bausteine": [ { "key": "sb0", "label": "Ohne Selbstbeteiligung", "kurz": "Ohne SB" } ] } ] }
```

- Sparten-Keys: `katze-kranken, katze-op, hund-kranken, hund-op, pferd-op, pferd-kranken, haftpflicht, hausrat,
  rechtsschutz, wohngebaeude, tierhalter-hund, tierhalter-pferd, unfall`.
- Pferde-Sparten (16.11.2026) wie Tierkranken, dazu die pferdetypischen Merkmale `chips` (Entfernung von Gelenk-Chips)
  und `kolik` (Wartezeit bei Kolik) sowie der Baustein `reha` (Reha-Baustein, Physiotherapie nach OP); belegt bei
  Allianz und Uelzener. Ein Lead mit Produkt „Pferd…“ bekommt `pferd-op`, mit „Kranken“ oder „Voll“ `pferd-kranken`.
- `standard: true`: vorausgewählte Merkmale (höchstens 5), an denen sich die Stufen am meisten unterscheiden und die
  Kunden am meisten interessieren. Die übrigen Merkmale stehen zur Tauschauswahl.
- `kurz`: Merkmal höchstens 28 Zeichen, Baustein höchstens 20 Zeichen.
- Zusätzlich (nur Hinweise, darf ignoriert werden): `version`, `stand`, `grenzen` (Foliengrenzen und Längen),
  `bausteinWerte`, je Sparte `produkt` (Produkt im Lead: `katze`, `hund`, `pferd`, `privatschutz`) und `formularMatch`
  (Wort im Leadformular für die Vorauswahl).

### `<gesellschaft>/<sparte>.json`
Ordner: Schlüssel der Gesellschaft, klein mit Bindestrich (`allianz`, `axa`, `signal-iduna`, Tierversicherer z. B.
`agila`, `barmenia`, `dfv`, `ergo`, `hansemerkur`, `ruv`, `uelzener`). Neue Ordner prüft der Datentest automatisch mit; Anzeigename und Reihenfolge stehen in
`src/lib/tarifkatalog.ts` (`GESELLSCHAFT_NAMEN`, `REIHENFOLGE`, `gesellschaftAusText`).

```json
{ "gesellschaft": "Allianz", "sparte": "rechtsschutz", "produkt": "Rechtsschutzversicherung",
  "empfehlung": "Gesellschaft",
  "inAllenTarifen": ["Telefonische Rechtsberatung, auch in nicht versicherten Fällen", "…"],
  "tarife": [ { "name": "Rechtsschutz Komfort", "kurz": "Komfort", "stufe": 3, "empfohlen": true,
     "werte": { "vs": "5 Mio. €", "beruf": "ja" }, "bausteine": { "sb0": "optional" },
     "quelle": "https://…", "stand": "2026-11-15" } ],
  "quellen": ["https://…", "https://…"],
  "offen": ["…was fehlt…"] }
```

- `werte`: kurze Anzeigetexte, höchstens 24 Zeichen („ja“, „nein“, „bis 5.000 €“, „optional“). Fehlt ein Merkmal, ist
  der Wert nicht belegt (nicht „nein“!), Grund steht in `offen`. „optional“ heißt: gegen Aufpreis als Baustein wählbar.
- `bausteine`: nur `optional` (gegen Aufpreis wählbar), `inklusive` (in der Stufe enthalten) oder `nein` (in dieser Stufe
  nicht wählbar). Fehlt ein Baustein, ist es nicht belegt.
- `kurz`: Stufenname ohne Produkt, höchstens 14 Zeichen. `stufe` aufsteigend ab 1, höchstens 4 Stufen je Datei.
- `empfohlen`: genau die Stufe, die die Gesellschaft hervorhebt („Beliebtester Tarif“, „Empfehlung“), sonst die mittlere
  Stufe (bei 4 Stufen die dritte). Woher die Empfehlung kommt, steht in `empfehlung`: `Gesellschaft`, `mittlere Stufe`
  oder `keine` (zwei Stufen ohne Markierung der Gesellschaft: kein Tarif hat `empfohlen: true`). Höchstens ein Tarif je Datei.
- Ein Tarif ohne Stufen (eine Gesellschaft hat nur einen Tarif) steht als einzige Stufe 1 mit Kurzname „Tarif“.
- `inAllenTarifen`: höchstens 3 kurze Punkte, die in jeder Stufe gleich sind.
- Zusätzlich gegenüber dem ursprünglichen Format (additiv, darf ignoriert werden): `empfehlung`, `quellen` (alle
  verwendeten Dokumente der Gesellschaft, bei Allianz Rechtsschutz auch Oles Rechner-Screenshot).
- `buendel.json` je Gesellschaft: Bündel- bzw. Kombirabatte.
  `{ "gesellschaft", "name", "linien": ["Komfort","Premium"], "mindestLaufzeitJahre": 3 | null, "sparten": [...],
  "staffel": [{ "anzahl": 2, "prozent": 5 }, …], "quelle", "stand", "offen": [] }`. Ein Staffeleintrag mit
  `"abAnzahl": true` gilt für diese und jede höhere Anzahl. Leere `staffel` = nicht veröffentlicht (Grund in `offen`).
  Stand: Allianz Staffel belegt (2: 5 %, 3: 10 %, 4: 15 %, ab 5: 20 %, Linien Komfort und Premium, Mindestlaufzeit nicht
  als Bedingung genannt); AXA und SIGNAL IDUNA veröffentlichen keine Staffel.

## Quellenregel
- Nur öffentliche Quellen der Gesellschaft: Produktseite mit Tarifvergleich, Produktsteckbrief, Produktinformationsblatt
  (IPID), Leistungsvergleich. Vergleichsportale höchstens als Hinweis, nie als einzige Quelle.
- Jeder Tarif hat `quelle` (exakte URL) und `stand` (Datum des Abrufs, hier 15.11.2026). Stand der Dokumente steht unten.
- Nichts erfunden: Was nicht belegbar ist, fehlt und steht in `offen`. Lieber weniger, aber richtig.
- Wöchentliche Quellprüfung (Ole, 16.11.2026; geplante Aufgabe „Tarifkatalog wöchentlich aktualisieren“, sonntags 21:17 Uhr): je Tarif `quelle` neu lesen und mit `werte` vergleichen, Änderungen deployen (nie werktags 8 bis 20 Uhr).

## Stand je Datei

vollständig = alle Standardmerkmale belegt; teilweise = Standardmerkmale fehlen; fehlt = keine Datei.

| Sparte | Allianz | AXA | SIGNAL IDUNA |
|---|---|---|---|
| katze-kranken | vollständig (4 Stufen) | fehlt (kein Produkt auf axa.de) | fehlt (kein Produkt auf signal-iduna.de) |
| katze-op | vollständig (4 Stufen) | fehlt (kein Produkt auf axa.de) | fehlt (kein Produkt auf signal-iduna.de) |
| hund-kranken | vollständig (4 Stufen) | fehlt (kein Produkt auf axa.de) | fehlt (kein Produkt auf signal-iduna.de) |
| hund-op | vollständig (4 Stufen) | fehlt (kein Produkt auf axa.de) | fehlt (kein Produkt auf signal-iduna.de) |
| pferd-op | vollständig (4 Stufen) | fehlt (kein Produkt auf axa.de) | fehlt (kein Produkt auf signal-iduna.de) |
| pferd-kranken | vollständig (4 Stufen) | fehlt (kein Produkt auf axa.de) | fehlt (kein Produkt auf signal-iduna.de) |
| haftpflicht | vollständig (4 Stufen) | teilweise (3 Stufen, geliehene Sachen L offen) | vollständig (3 Stufen) |
| hausrat | vollständig (4 Stufen) | teilweise (3 Stufen, einfacher Diebstahl offen) | teilweise (3 Stufen, einfacher Diebstahl offen) |
| rechtsschutz | vollständig (4 Stufen) | teilweise (3 Stufen, Strafkaution offen) | teilweise (2 Stufen, Summe und Strafkaution offen) |
| wohngebaeude | vollständig (4 Stufen) | vollständig (2 Stufen) | vollständig (2 Stufen) |
| tierhalter-hund | vollständig (3 Stufen) | vollständig (1 Tarif) | teilweise (2 Stufen, Flyer 2012) |
| tierhalter-pferd | vollständig (3 Stufen) | teilweise (1 Tarif, nur Summe) | teilweise (2 Stufen, Flyer 2012) |
| unfall | vollständig (4 Stufen) | vollständig (3 Stufen) | teilweise (2 Stufen, Summen individuell) |

Tierversicherer (Abruf 16.11.2026; nur Tier-Sparten). „1 Tarif“ = die Gesellschaft hat keine Stufen, nur wählbare
Summen bzw. Selbstbeteiligung (Stufe „Tarif“).

| Sparte | AGILA | Barmenia | DFV | ERGO | HanseMerkur | R+V | Uelzener |
|---|---|---|---|---|---|---|---|
| katze-kranken | vollständig (3 Stufen) | vollständig (4 Stufen) | fehlt (nur Hunde) | fehlt (kein Produkt) | vollständig (3 Stufen) | fehlt (kein Produkt) | vollständig (1 Tarif) |
| katze-op | vollständig (3 Stufen) | vollständig (2 Stufen) | fehlt (nur Hunde) | fehlt (kein Produkt) | teilweise (3 Stufen, Vorsorge nicht genannt) | fehlt (kein Produkt) | vollständig (1 Tarif) |
| hund-kranken | vollständig (3 Stufen) | vollständig (4 Stufen) | vollständig (1 Tarif) | fehlt (kein Produkt) | vollständig (3 Stufen) | fehlt (nur OP) | vollständig (1 Tarif) |
| hund-op | vollständig (3 Stufen) | vollständig (3 Stufen) | vollständig (1 Tarif) | fehlt (kein Produkt) | teilweise (3 Stufen, Vorsorge nicht genannt) | teilweise (3 Stufen, Vorsorge nicht genannt) | vollständig (1 Tarif) |
| pferd-op | fehlt (nur Hund, Katze) | teilweise (3 Stufen, Erstattung %, Vorsorge offen) | fehlt (nur Hunde) | fehlt (kein Produkt) | fehlt (kein Pferdeprodukt) | teilweise (3 Stufen, Erstattung %, Vorsorge offen) | vollständig (1 Tarif) |
| pferd-kranken | fehlt (nur Hund, Katze) | fehlt (kein Vollschutz für Pferde) | fehlt (nur Hunde) | fehlt (kein Produkt) | fehlt (kein Pferdeprodukt) | fehlt (kein Produkt) | vollständig (1 Tarif) |
| tierhalter-hund | vollständig (3 Stufen) | fehlt (Stufen Klassik, Premium nicht als Tabelle) | vollständig (1 Tarif) | teilweise (1 Tarif, Fremdhüter offen) | vollständig (2 Stufen) | fehlt (nicht erhoben) | vollständig (1 Tarif) |
| tierhalter-pferd | fehlt (kein Produkt) | fehlt (Stufen nicht als Tabelle) | fehlt (kein Produkt) | teilweise (1 Tarif, Flurschäden offen) | fehlt (kein Produkt) | fehlt (nicht erhoben) | vollständig (1 Tarif) |

Nicht aufgenommen: PETPROTECT (Vermittler der BarmeniaGothaer, Tarifvergleich nur als Symbole ohne Werte),
Helvetia (helvetia.de nennt nur „je nach Tarifwahl“, keine Stufen; Seiten für automatische Abrufe gesperrt), Gothaer
(gothaer.de leitet auf barmeniagothaer.de; Tierkranken siehe Barmenia; Hunde- und Pferdehaftpflicht dort nur eine
Spalte, die Stufen Klassik/Premium bzw. Basis/Top/Premium sind nur im Fließtext erwähnt).

### Allianz
- Quelle ist jeweils der Tarifvergleich der Produktseite auf allianz.de (Abruf 15.11.2026), dazu der Produktsteckbrief.
  Stand der Dokumente: Hausrat-Tarifvergleich 10/2026 (Steckbrief 10/2026), Wohngebäude-Steckbrief 04/2026,
  Haftpflicht-Steckbrief 06/2025, Hundehalter-Steckbrief 06/2025, Tierkranken-Steckbriefe 01/2026.
- **Haftpflicht, Hausrat und Wohngebäude haben die vier Stufen Basis, Smart, Komfort, Premium** (wie Rechtsschutz,
  Unfall und die Tierkrankenversicherung). Hunde- und Pferdehalterhaftpflicht haben nur drei: Smart, Komfort, Premium.
- Empfehlung von Allianz markiert: Hausrat und Wohngebäude Komfort („Beliebtester Tarif“ bzw. „Beliebt“), Rechtsschutz
  Komfort (Allianz-Rechner, Screenshot Ole). Übrige: Komfort als mittlere Stufe.
- Hausrat: Der ältere Leistungsvergleich 09/2023 weicht vom aktuellen Tarifvergleich ab (z. B. Premium 1.300 statt
  900 €/m²) und wurde nicht verwendet.

### AXA
- Quelle: Tarifvergleiche der Produktseiten auf axa.de (Abruf 15.11.2026), bei Haftpflicht die Produktübersicht
  „Leistungen im Überblick“ (PDF ohne Datum; Farbe der Punkte ausgewertet: blau = versichert, schwarz = nicht versichert),
  bei Unfall die Leistungsübersicht (PDF).
- Stufen: Haftpflicht, Hausrat, Unfall als Online-Tarife S, M, L (Kurzname „Tarif S“ usw.); Rechtsschutz über den
  Partner ROLAND als Topschutz-Starter, -Komfort, -Premium; Wohngebäude als BOXFLEX und BOXFLEX PREMIUM (2 Stufen);
  Hunde- und Pferdehaftpflicht je ein Tarif.
- **AXA bietet auf axa.de keine Tierkranken- oder Tier-OP-Versicherung an** (nur ein Ratgebersatz ohne Produkt). Die vier
  Tier-Sparten fehlen deshalb für AXA.
- BOXflex (das modulare Vertreterprodukt) ist auf axa.de nur für Wohngebäude als Tarifvergleich veröffentlicht.
- Empfehlung: AXA markiert nur bei Wohngebäude eine Spalte als „Bestseller“ (laut Seitenquelltext BOXFLEX, bitte am
  Bildschirm gegenprüfen); sonst mittlere Stufe.

### SIGNAL IDUNA
- Quelle: Tariftabellen der Produktseiten auf signal-iduna.de (Abruf 15.11.2026); Rechtsschutz zusätzlich der
  ALLRECHT-Flyer „Rechtsschutz für das Privatleben“ (Stand 09/2025), Tierhalter der verlinkte Flyer (Stand 09/2012).
- Stufen: Haftpflicht und Hausrat Pur, Basis, Premium; Rechtsschutz (ALLRECHT), Wohngebäude und Unfall Basis, Premium;
  Tierhalter-Haftpflicht Optimal, Exklusiv (für Hund und Pferd gleich, alternativ Baustein Tiere in der Privathaftpflicht).
- **Keine Tierkranken- oder Tier-OP-Versicherung auf signal-iduna.de** (alle Produktadressen 404, keine Fundstelle).
- Empfehlung: nur Rechtsschutz (Flyer: BASIS als Kundenempfehlung). Haftpflicht und Hausrat: Basis als mittlere Stufe.
  Bei zwei Stufen ohne Markierung (Wohngebäude, Unfall, Tierhalter) ist keine Empfehlung gesetzt
  (`empfehlung: "keine"`, kein Tarif mit `empfohlen: true`); der Vermittler setzt den Stern selbst.

### Allianz Pferd (16.11.2026)
- Pferde OP-Schutz und Vollschutz Basis, Smart, Komfort, Premium aus den Tarifvergleichen auf allianz.de
  (`/gesundheit/op-versicherung-pferd/`, `/gesundheit/pferdekrankenversicherung/`), Steckbrief Pferdekranken.
- Keine Markierung; Komfort als mittlere Stufe. Kastration steht nicht im Tarifvergleich.

### AGILA
- Quelle: Tariftabellen auf agila.de (Hunde- und Katzen-OP, -Krankenschutz, Hundehaftpflicht) und das Vertragswerk
  07/2026 (Informationsblätter 11/2025). Stufen Basis, Komfort, Exklusiv (Summe und Kostenübernahme 80, 90, 100 %);
  Hundehaftpflicht Schutz 24, Schutz, Exklusiv. AGILA markiert Komfort bzw. den mittleren Haftpflichtschutz als „Beliebt“.
- Zusätzlicher Schutz (Vorsorge, Physiotherapie, Zahn) gegen Aufpreis; der Flex-Tarif ist nicht als Stufe geführt.
- Kein Pferdeprodukt, keine Pferdehaftpflicht.

### Barmenia (BarmeniaGothaer)
- Quelle: Leistungsübersichten WS1281 (Tier-OP) und WS1282 (Tierkranken), Stand 01/2026, sowie die Produkttabellen auf
  barmeniagothaer.de. Risikoträger Barmenia Allgemeine. Ordner `barmenia` enthält nur Tier-Dateien.
- Tierkranken Basis, Top, Premium („meistgewählt“), Premium Plus; Tier-OP Unfall (nur Hunde), Premium, Premium Plus;
  Pferde-OP Basis, Top, Premium.
- Hunde- und Pferdehaftpflicht stehen auf barmeniagothaer.de nur als eine Spalte; die Stufen sind nur im Text genannt,
  deshalb nicht aufgenommen.

### DFV (Deutsche Familienversicherung)
- Quelle: Leistungsübersichten auf deutsche-familienversicherung.de. Je ein Tarif: TierkrankenSchutz OP-Schutz und
  Vollschutz („Leistungs-Empfehlung“), HundehaftpflichtSchutz mit oder ohne Selbstbeteiligung. Nur Hunde.

### ERGO
- Quelle: Produktseiten und Kurzinformationen (Flyer 12/2020) auf ergo.de. Hunde- und Pferdehalter-Haftpflicht je ein
  Tarif mit 5, 10 oder 50 Mio. €. Ordner `ergo` enthält nur Tier-Dateien. Keine Tierkranken- oder Tier-OP-Versicherung
  als Produkt auf ergo.de (nur Ratgeber).

### HanseMerkur
- Quelle: Leistungstabellen auf hansemerkur.de, Leistungsübersicht Hundehaftpflicht (MS 201, 05/2025).
  OP- und Krankenversicherung Komfort, Premium („Bestseller“), Premium plus für Hund und Katze; Hundehaftpflicht Komfort
  und Premium plus („Testsieger“). Kein Pferdeprodukt.

### R+V
- Quelle: Leistungstabellen auf ruv.de (Hunde-OP, Pferde-OP) und das Produktinformationsblatt Pferde-OP. Stufen Basis,
  Premium, Exzellent („Topseller“). Ordner `ruv` enthält nur Tier-Dateien. Keine Katzen- und keine Krankenvollversicherung;
  Hunde- und Pferdehalterhaftpflicht gibt es, sind aber noch nicht erhoben.

### Uelzener
- Quelle: Produktseiten und Leistungsübersichten auf uelzener.de (Hund 12/2025, Katze 08/2025, Pferd 03/2025,
  Hundehaftpflicht 02/2024) und Informationsblätter. Uelzener hat keine Tarifstufen: je Produkt ein Tarif mit wählbarer
  Erstattungshöhe bzw. Deckungssumme und Selbstbeteiligung; die Auswahl steht im Wert (z. B. „3.000/6.000 €/unbegrenzt“).
- Einzige Gesellschaft mit Pferde-OP und Pferdekranken als eigene Produkte neben Allianz; dazu Kolik-Versicherung
  (nicht im Schema).

## Offen (wichtigste Lücken)
- Tierversicherer: HanseMerkur OP ohne Angabe zur Vorsorge; Barmenia Pferde-OP ohne Erstattungssatz in Prozent und
  ohne Vorsorge; ERGO Hundehaftpflicht ohne Angabe zu fremden Hütern, Pferdehaftpflicht ohne Flurschäden; Uelzener
  ohne veröffentlichte SB-Beträge bei Hund und Pferdehaftpflicht; Barmenia Premium Plus Ausland widersprüchlich
  (12 Monate bzw. unbegrenzt).
- Pferdekranken gibt es nur bei Allianz und Uelzener; Pferde-OP zusätzlich bei Barmenia und R+V.
- Allianz Hausrat: Überspannung, Hotelkosten, Außenversicherung, Diebstahl aus dem Auto, Selbstbeteiligung stehen nicht
  im aktuellen Tarifvergleich.
- Allianz Unfall: Ob Invaliditätssumme, Unfallrente und Tagegeld je Stufe fest oder im Rechner wählbar sind, ist nicht belegt.
- Allianz Pferd: Fohlen, Ausland nicht belegt.
- AXA: keine Tierkrankenversicherung; Pferdehaftpflicht nur mit Deckungssumme, Fohlen, Forderungsausfall belegt;
  Rechtsschutz ohne Strafkaution und SB; Haftpflicht L geliehene Sachen widersprüchlich (10.000 € bzw. 20.000 €).
- SIGNAL IDUNA: keine Tierkrankenversicherung; Tierhalter nur aus einem Flyer von 2012 (Aktualität bestätigen);
  Rechtsschutz ohne Versicherungssumme und Strafkaution; Unfall-Summen werden individuell gewählt.
- Keine der drei Gesellschaften veröffentlicht ein Bündel mit festen Stufen für alle Sparten; die Stufennamen
  unterscheiden sich je Sparte (z. B. AXA Tarif S/M/L, Topschutz, BOXFLEX).
- Details je Datei unter `offen`.
