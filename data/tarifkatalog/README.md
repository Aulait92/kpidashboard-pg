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
Ordner: Schlüssel der Gesellschaft, klein mit Bindestrich: `allianz`, `axa`, `signal-iduna` (Vertreter-Gesellschaften),
`advocard`, `agila`, `arag`, `barmenia-gothaer`, `devk`, `dfv`, `ergo`, `generali`, `haftpflichtkasse`, `hansemerkur`,
`huk-coburg`, `lvm`, `provinzial`, `roland`, `ruv` (R+V, wie die Adresse ruv.de; „+“ taugt nicht als Ordnername),
`uelzener`, `vhv`, `zurich`. Neue Ordner prüft der Datentest automatisch mit; jeder Ordner braucht einen Eintrag in
`src/lib/tarifkatalog.ts` (`GESELLSCHAFT_NAMEN`, `gesellschaftAusText`), sonst schlägt der Datentest an.
Reihenfolge in Listen: Allianz, AXA, SIGNAL IDUNA zuerst, dann alle übrigen alphabetisch nach Anzeigename.

**BarmeniaGothaer** (Ole, 16.11.2026): Barmenia und Gothaer sind fusioniert und stehen als eine Gesellschaft im
Ordner `barmenia-gothaer` (Tier-Tarife der Barmenia und Sachtarife der Gothaer Allgemeine). `gesellschaftAusText`
erkennt „Barmenia“, „Gothaer“ und „BarmeniaGothaer“; früher gespeicherte Schlüssel `barmenia` bzw. `gothaer` stellt
`gesellschaftSchluessel` um.

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
- `ungeprueft: true` je Tarif (optional, Ole 16.11.2026): Die Werte sind nicht am Bildschirm bzw. an der Quelle
  gegengeprüft. Die Terminvorbereitung zeigt dann bei „Tarife ändern“ und an der Tarifkarte „bitte prüfen“ statt des
  Stands; auf den Kundenfolien erscheint nichts davon. Gesetzt bei VHV, LVM, Die Haftpflichtkasse und Provinzial
  (Symboltabellen, Werte nur teilweise lesbar). Nach dem Gegenprüfen das Feld entfernen.
- `buendel.json` je Gesellschaft: Bündel- bzw. Kombirabatte.
  `{ "gesellschaft", "name", "linien": ["Komfort","Premium"], "mindestLaufzeitJahre": 3 | null, "sparten": [...],
  "staffel": [{ "anzahl": 2, "prozent": 5 }, …], "quelle", "stand", "offen": [] }`. Ein Staffeleintrag mit
  `"abAnzahl": true` gilt für diese und jede höhere Anzahl. Leere `staffel` = nicht veröffentlicht (Grund in `offen`).
  Stand: Allianz Staffel belegt (2: 5 %, 3: 10 %, 4: 15 %, ab 5: 20 %, Linien Komfort und Premium, Mindestlaufzeit nicht
  als Bedingung genannt); AXA und SIGNAL IDUNA veröffentlichen keine Staffel. ERGO: Staffel nur für Wohngebäude
  (2: 8 %, 3: 10 %); R+V PrivatPolice (2: 3 %, 3: 6 %, ab 4: 9 %). Ohne Staffel (Grund in `offen`): HUK-COBURG, DEVK,
  Generali, Zurich, BarmeniaGothaer, VHV, Die Haftpflichtkasse, LVM, Provinzial, ARAG, ROLAND, ADVOCARD.

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

| Sparte | AGILA | BarmeniaGothaer | DFV | ERGO | HanseMerkur | R+V | Uelzener |
|---|---|---|---|---|---|---|---|
| katze-kranken | vollständig (3 Stufen) | vollständig (4 Stufen) | fehlt (nur Hunde) | fehlt (kein Produkt) | vollständig (3 Stufen) | fehlt (kein Produkt) | vollständig (1 Tarif) |
| katze-op | vollständig (3 Stufen) | vollständig (2 Stufen) | fehlt (nur Hunde) | fehlt (kein Produkt) | teilweise (3 Stufen, Vorsorge nicht genannt) | fehlt (kein Produkt) | vollständig (1 Tarif) |
| hund-kranken | vollständig (3 Stufen) | vollständig (4 Stufen) | vollständig (1 Tarif) | fehlt (kein Produkt) | vollständig (3 Stufen) | fehlt (nur OP) | vollständig (1 Tarif) |
| hund-op | vollständig (3 Stufen) | vollständig (3 Stufen) | vollständig (1 Tarif) | fehlt (kein Produkt) | teilweise (3 Stufen, Vorsorge nicht genannt) | teilweise (3 Stufen, Vorsorge nicht genannt) | vollständig (1 Tarif) |
| pferd-op | fehlt (nur Hund, Katze) | teilweise (3 Stufen, Erstattung %, Vorsorge offen) | fehlt (nur Hunde) | fehlt (kein Produkt) | fehlt (kein Pferdeprodukt) | teilweise (3 Stufen, Erstattung %, Vorsorge offen) | vollständig (1 Tarif) |
| pferd-kranken | fehlt (nur Hund, Katze) | fehlt (kein Vollschutz für Pferde) | fehlt (nur Hunde) | fehlt (kein Produkt) | fehlt (kein Pferdeprodukt) | fehlt (kein Produkt) | vollständig (1 Tarif) |
| tierhalter-hund | vollständig (3 Stufen) | teilweise (1 Tarif, siehe Privatschutz) | vollständig (1 Tarif) | teilweise (1 Tarif, Fremdhüter offen) | vollständig (2 Stufen) | teilweise (3 Stufen, SB nur classic) | vollständig (1 Tarif) |
| tierhalter-pferd | fehlt (kein Produkt) | teilweise (1 Tarif, siehe Privatschutz) | fehlt (kein Produkt) | teilweise (1 Tarif, Flurschäden offen) | fehlt (kein Produkt) | teilweise (3 Stufen, SB offen) | vollständig (1 Tarif) |

Nicht aufgenommen: PETPROTECT (Vermittler der BarmeniaGothaer, Tarifvergleich nur als Symbole ohne Werte),
Helvetia (helvetia.de nennt nur „je nach Tarifwahl“, keine Stufen; Seiten für automatische Abrufe gesperrt).

Privatschutz (Abruf 16.11.2026; Tierhalter von ERGO und R+V siehe Tierversicherer). Zahl in Klammern = Stufen.
**ungeprüft** = Werte mit `ungeprueft: true`, bitte gegenprüfen.

| Sparte | ERGO | R+V | HUK-COBURG | DEVK | Generali |
|---|---|---|---|---|---|
| haftpflicht | vollständig (2, Mietsachschäden offen) | vollständig (3) | vollständig (3) | vollständig (3) | vollständig (1 Tarif) |
| hausrat | teilweise (2, einf. Diebstahl) | teilweise (3, einf. Diebstahl) | teilweise (3, Basis kaum belegt, GF) | teilweise (3, Wertsachen, Fahrrad) | teilweise (2, Wertsachen) |
| rechtsschutz | teilweise (2, Kaution Smart) | vollständig (2, Bausteinkonzept) | teilweise (2, Strafkaution) | teilweise (2, Strafkaution) | vollständig (1 Tarif, ADVOCARD) |
| wohngebaeude | vollständig (2, Broschüre 9.2024) | vollständig (2) | vollständig (2) | teilweise (3, Ableitungsrohre) | teilweise (1 Tarif, Rohre, Kosten) |
| unfall | vollständig (3, Summe wählbar) | teilweise (3, Rente, Tagegeld) | vollständig (2) | teilweise (3, Grundsumme individuell) | teilweise (1 Tarif, Rente, Tagegeld) |
| tierhalter-hund | siehe Tierversicherer | siehe Tierversicherer | vollständig (1 Tarif) | teilweise (2, fremde Hüter) | teilweise (1 Tarif, SB, Welpen) |
| tierhalter-pferd | siehe Tierversicherer | siehe Tierversicherer | vollständig (1 Tarif) | vollständig (2) | teilweise (1 Tarif, SB, Flurschäden) |

| Sparte | Zurich | BarmeniaGothaer | VHV (ungeprüft) | Die Haftpflichtkasse (ungeprüft) | LVM (ungeprüft) | Provinzial (ungeprüft) |
|---|---|---|---|---|---|---|
| haftpflicht | vollständig (2) | vollständig (3) | vollständig (2) | vollständig (3) | vollständig (2) | teilweise (3, Summe, Forderungsausfall) |
| hausrat | teilweise (2, einf. Diebstahl) | teilweise (3, einf. Diebstahl) | teilweise (2, einf. Diebstahl, GF) | teilweise (2, einf. Diebstahl) | teilweise (2, einf. Diebstahl) | teilweise (3, einf. Diebstahl) |
| rechtsschutz | vollständig (2) | teilweise (3, Strafkaution; ROLAND) | vollständig (2; NRV) | fehlt (kein Produkt) | teilweise (2, Klassik-Summen) | teilweise (2, Strafkaution; ÖRAG) |
| wohngebaeude | vollständig (2) | vollständig (3) | teilweise (2, GF, Ableitung Klassik) | fehlt (kein Produkt) | teilweise (2, GF, Kosten) | teilweise (3, PV und Ableitung Kompakt) |
| unfall | teilweise (2, ab Grad) | teilweise (3, ab Grad) | teilweise (2, ab Grad) | teilweise (3, Summen) | vollständig (1) | vollständig (1) |
| tierhalter-hund | teilweise (2, SB) | teilweise (1, SB, Miete) | teilweise (1, SB) | teilweise (1, Summe, SB) | teilweise (2, SB, Hüter, Miete) | teilweise (1, SB, Miete) |
| tierhalter-pferd | teilweise (2, SB) | teilweise (1, SB) | teilweise (1, SB) | teilweise (1, Summe, SB) | teilweise (2, SB, Flurschäden) | teilweise (1, SB) |

| Sparte | ARAG | ROLAND | ADVOCARD |
|---|---|---|---|
| rechtsschutz | vollständig (3) | teilweise (3, Strafkaution) | vollständig (2) |

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

### BarmeniaGothaer
- Eine Gesellschaft (Ordner `barmenia-gothaer`): barmenia.de und gothaer.de leiten auf barmeniagothaer.de um.
- Tier: Leistungsübersichten WS1281 (Tier-OP) und WS1282 (Tierkranken), Stand 01/2026, sowie die Produkttabellen auf
  barmeniagothaer.de. Risikoträger Barmenia Allgemeine. Tierkranken Basis, Top, Premium („meistgewählt“), Premium Plus;
  Tier-OP Unfall (nur Hunde), Premium, Premium Plus; Pferde-OP Basis, Top, Premium.
- Privatschutz: Die Sachtarife (Privat Kompakt) trägt laut Bedingungen die Gothaer Allgemeine Versicherung AG. Quelle
  sind die Leistungsübersichten „im Überblick“ in den Bedingungen (Download-Links der Produktseiten): Haftpflicht Spar,
  Basis, Premium (09/2026); Hausrat Klassik, Plus, Premium (06/2026); Wohngebäude Basis, Plus, Premium (06/2026);
  Unfall Klassik, Plus, Premium (07/2023).
- Hunde- und Pferdehaftpflicht als ein Tarif mit wählbarer Summe (AHB 04/12, BBR 02/18); die Stufen Klassik/Premium
  bzw. Basis/Top/Premium sind auf barmeniagothaer.de nur im Fließtext erwähnt und deshalb nicht als Stufen aufgenommen.
- Rechtsschutz über den Partner ROLAND (Top-Rechtsschutz Starter, Komfort, Premium), Werte wie bei ROLAND.
- Keine Empfehlung markiert, bei drei Stufen die mittlere gesetzt.

### DFV (Deutsche Familienversicherung)
- Quelle: Leistungsübersichten auf deutsche-familienversicherung.de. Je ein Tarif: TierkrankenSchutz OP-Schutz und
  Vollschutz („Leistungs-Empfehlung“), HundehaftpflichtSchutz mit oder ohne Selbstbeteiligung. Nur Hunde.

### ERGO
- Tier: Produktseiten und Kurzinformationen (Flyer 12/2020 bzw. 6.22) auf ergo.de. Hunde- und Pferdehalter-Haftpflicht
  je ein Tarif mit 5, 10 oder 50 Mio. €. Keine Tierkranken- oder Tier-OP-Versicherung als Produkt auf ergo.de (nur
  Ratgeber).
- Privatschutz: Tarifvergleiche der Produktseiten auf ergo.de (Abruf 16.11.2026); Wohngebäude aus der Broschüre
  (Stand 9.2024, Tabelle als Bild ausgewertet), Hausrat ergänzt aus der Broschüre (Stand 9.2025). Die
  Leistungsübersichten auf ergo-meine-druckstuecke.de waren für automatische Abrufe gesperrt und sind nicht verwendet.
- Stufen: Haftpflicht, Hausrat, Rechtsschutz, Wohngebäude Smart und Best; Unfall Basic, Smart, Best.
- Rechtsschutz ist ERGOs eigener Rechtsschutz: Die D.A.S. heißt seit 2019 ERGO Rechtsschutzversicherung (laut ergo.de).
  Privat, Beruf, Wohnen, Verkehr sind frei kombinierbar, daher Beruf, Wohnen und Verkehr als „optional“.
- Empfehlung: ERGO markiert Best als „Bestseller“ (Haftpflicht, Hausrat, Rechtsschutz). Wohngebäude ohne Markierung
  (`empfehlung: "keine"`), Unfall: Smart als mittlere Stufe.
- Bündel: Broschüre Wohngebäude nennt bis 15 % Bündelnachlass, bei zwei Verträgen 8 %; das Preisbeispiel der Produktseite
  rechnet mit 10 % bei drei Verträgen. Nur für Wohngebäude belegt.

### HanseMerkur
- Quelle: Leistungstabellen auf hansemerkur.de, Leistungsübersicht Hundehaftpflicht (MS 201, 05/2025).
  OP- und Krankenversicherung Komfort, Premium („Bestseller“), Premium plus für Hund und Katze; Hundehaftpflicht Komfort
  und Premium plus („Testsieger“). Kein Pferdeprodukt.

### R+V
- Ordner `ruv` (wie die Adresse ruv.de).
- Tier: Leistungstabellen auf ruv.de (Hunde-OP, Pferde-OP) und das Produktinformationsblatt Pferde-OP. Stufen Basis,
  Premium, Exzellent („Topseller“). Keine Katzen- und keine Krankenvollversicherung; Hunde- und Pferdehalterhaftpflicht
  classic, comfort („Topseller“ bei Hund), premium; Selbstbeteiligung nur als Berechnungsbeispiel (classic 250 €).
- Privatschutz: Leistungstabellen der Produktseiten auf ruv.de (Abruf 16.11.2026), Rechtsschutz von der Seite
  Privatrechtsschutz, Bündel von der Seite PrivatPolice. Haftpflicht und Hausrat classic, comfort, premium; Unfall
  (Risiko-UnfallPolice) Classic, Comfort, Premium als zusammengestellte Angebotsvarianten; Rechtsschutz und Wohngebäude
  classic und comfort.
- Rechtsschutz ist R+V selbst (Bausteinkonzept: Privat plus Beruf, Verkehr, Immobilien).
- Empfehlung: R+V markiert comfort als „Topseller“ bei Hausrat und Hundehaftpflicht; Haftpflicht, Pferd, Unfall: comfort
  als mittlere Stufe; Rechtsschutz und Wohngebäude ohne Markierung (`empfehlung: "keine"`).
- Bündel: PrivatPolice mit 3 % (2 Verträge), 6 % (3), 9 % (ab 4); alle Haftpflichtverträge zählen einmal, Unfall nicht.

### Uelzener
- Quelle: Produktseiten und Leistungsübersichten auf uelzener.de (Hund 12/2025, Katze 08/2025, Pferd 03/2025,
  Hundehaftpflicht 02/2024) und Informationsblätter. Uelzener hat keine Tarifstufen: je Produkt ein Tarif mit wählbarer
  Erstattungshöhe bzw. Deckungssumme und Selbstbeteiligung; die Auswahl steht im Wert (z. B. „3.000/6.000 €/unbegrenzt“).
- Einzige Gesellschaft mit Pferde-OP und Pferdekranken als eigene Produkte neben Allianz; dazu Kolik-Versicherung
  (nicht im Schema).

### HUK-COBURG
- Quelle: Produktseiten auf huk.de (Abruf 16.11.2026), Haftpflicht mit Tarifvergleich Basis, Classic, Classic PLUS;
  Unfall und Rechtsschutz an der Produktseite gegengeprüft (kein Tarifvergleich, Classic und PLUS-Baustein aus dem
  Fließtext).
- Stufen: Haftpflicht und Hausrat Basis, Classic, Classic PLUS; Wohngebäude und Unfall Classic und Classic PLUS (PLUS ist
  jeweils ein Zusatzbaustein); Rechtsschutz PBV und PBV mit Rechtsschutz PLUS; Hunde- und Pferdehaftpflicht je ein Tarif
  (15 Mio. €, ohne Selbstbeteiligung).
- Rechtsschutz ist HUK-COBURG selbst (kein Partner genannt). Wohnen ist eine Ergänzung.
- Empfehlung: HUK markiert keine Stufe; Haftpflicht und Hausrat Classic als mittlere Stufe, sonst `empfehlung: "keine"`.
- Bündel: auf huk.de kein Bündelrabatt veröffentlicht (nur Neukaufnachlass Wohngebäude).

### DEVK
- Quelle: Tarifvergleiche der Produktseiten auf devk.de (Abruf 16.11.2026); Hunde- und Pferdehaftpflicht von der Seite
  Tierhalter.
- Stufen: Haftpflicht, Hausrat, Wohngebäude, Unfall Basis, Komfort, Premium; Rechtsschutz (Allroundschutz Privat, Wohnen,
  Beruf, Verkehr) Komfort und Premium; Hunde- und Pferdehaftpflicht Komfort und Premium.
- Rechtsschutz ist DEVK selbst; Clever-Varianten bis 15 % günstiger.
- Empfehlung: DEVK empfiehlt bei der Haftpflicht ausdrücklich Premium; Hausrat, Wohngebäude, Unfall Komfort als mittlere
  Stufe; Rechtsschutz und Tierhalter ohne Markierung (`empfehlung: "keine"`).
- Bündel: keine Staffel veröffentlicht; Rechtsschutz nennt einen Bestandskunden-Bonus bis 5 %.

### Generali
- Quelle: Produktseiten auf generali.de (Abruf 16.11.2026, nur Highlights, keine Tarifvergleiche); Rechtsschutz von
  advocard.de (ADVOCARD-360°-PRIVAT), da Generali Rechtsschutz über den Partner ADVOCARD anbietet.
- Stufen: je Sparte ein Tarif (Optimal bzw. Unfall Aktiv); Hausrat zusätzlich Optimal XXL (Allgefahren-Baustein) als
  zweite Stufe. Vertrieb über die Deutsche Vermögensberatung (DVAG).
- Empfehlung: einzelne Tarife als „mittlere Stufe“ markiert; Hausrat mit zwei Stufen ohne Empfehlung.
- Bündel: Vermögenssicherungspolice (VSP) mit 10 % VSP-Bonus und bis 25 % Kundenbonus, nicht nach Anzahl gestaffelt;
  daher leere Staffel, Details in `offen`.

### Zurich
- Quelle: Deckungskonzepte (Leistungsübersichten, PDF) auf zurich.de: Haftpflicht inkl. Tierhalter 04/2025, Hausrat
  10/2022 (Dateiname 2023_10, Einfache Übersicht 04/2026), Wohngebäude 04/2024, Unfall 04/2024, Rechtsschutz 10/2024.
  Die Produktseiten laden ihre Inhalte per Skript und ließen sich nicht automatisch lesen.
- Stufen: PrivatSchutz Basis und Top in allen Sparten (Unfall zusätzlich Baustein Premium auf Top). Keine Empfehlung
  markiert (`empfehlung: "keine"`).
- Rechtsschutz: Privat und Beruf ein Baustein, Verkehr und Immobilien je eigener Baustein; Top schließt Immobilien-RS
  für selbst genutzte Einheiten ein.

### VHV (ungeprüft)
- Quelle: Produktübersichten (PDF) auf vhv.de: Haftpflicht 09.2024, Hausrat 09.2025, Wohngebäude 06.2026, Unfall
  07.2026, Tierhalter 09.2024, Rechtsschutz 10.2025 (Risikoträger NRV), dazu die Produktseiten.
- Stufen: KLASSIK-GARANT und KLASSIK-GARANT mit Zusatzpaket EXKLUSIV; Tierhalter nur KLASSIK-GARANT.
- Die Übersichten kennzeichnen enthalten/optional/nicht enthalten mit Symbolen, die nicht lesbar sind; erfasst sind
  nur Zeilen mit Beträgen und Angaben der Produktseiten.

### Die Haftpflichtkasse (ungeprüft)
- Quelle: Deckungsübersichten im Dokumentencenter auf haftpflichtkasse.de: PHV Einfach Gut, Besser, Komplett
  (01.01.2025), Hausrat Einfach Besser, Komplett (25.02.2025), Tierhalter Einfach Komplett (01.07.2026), Unfall
  Einfach (Tarifunterlagen 07/2025, ergänzt aus der Übersicht von 2019).
- Keine Wohngebäude- und keine eigenständige Rechtsschutzversicherung.
- Enthaltene Leistungen als Bildsymbol: Zellen ohne Betrag und ohne Strich sind als „ja“ erfasst.

### LVM (ungeprüft)
- Quelle: Broschüren und Produktseiten auf lvm.de. Haftpflicht Komfort, Premium (W 2111, 09/2026); Hausrat und
  Rechtsschutz MeineKlassik, MeinPremium; Wohngebäude Grundbaustein und WohngebäudePlus; Unfall ein Tarif mit
  Bausteinen; Hund und Pferd MeineKlassik, MeinPremium.
- Viele Tabellen der Broschüren nutzen Bildsymbole oder sind als Grafik gesetzt (Rechtsschutz); erfasst sind nur
  lesbare Beträge. Hausrat und Haftpflicht zusätzlich aus den Vertragsgrundlagen (VHB 2025, H 700/H 700a) ergänzt.

### Provinzial (ungeprüft)
- Region West (Provinzial Versicherung AG, provinzial.de/west); die Provinzial Nord hat eigene Unterlagen.
- Haftpflicht: Smart, Komfort, Komfort mit Plus-Paket (Leistungsübersicht 11/2022, PIB 08.2026, Produktseite).
  Hausrat und Wohngebäude: Kompaktschutz, Rundumschutz 2.0, Rundumschutz 2.0 mit Plus-Paket 2.0 (Leistungsübersichten
  West 03/24). Unfall: ein Tarif mit Bausteinen (Leistungsübersicht West 11/25). Rechtsschutz über ÖRAG: Rundum-Schutz
  und Rundum-Schutz PLUS (Produktseiten, Flyer 2024).
- Hund und Pferd: je ein Tarif aus den Produktseiten (Summe 15 oder 50 Mio. €); alternativ Baustein der Privathaftpflicht.

### ARAG, ROLAND, ADVOCARD (Rechtsschutz)
- ARAG: Kompakt, Komfort, Premium aus dem Tarifvergleich auf arag.de; Privat Grundbaustein, Beruf, Verkehr, Wohnen
  wählbar. Strafkaution Europa 300.000 € bzw. unbegrenzt.
- ROLAND: Top-Rechtsschutz Starter (ohne Beruf), Komfort, Premium (roland-rechtsschutz.de), Wartezeit Starter und
  Komfort 6 Monate laut Beiblatt, Premium 3 Monate. Strafkaution je Tarif nicht belegt (ARB-Pakete heißen anders).
- ADVOCARD: Privat-Modul mit wählbaren Modulen und ADVOCARD-360°-PRIVAT (von ADVOCARD empfohlen), Produktseite.

## Offen (wichtigste Lücken)
- VHV, LVM, Die Haftpflichtkasse, Provinzial: als `ungeprueft` gekennzeichnet. Symboltabellen nicht lesbar, Werte nur
  teilweise; bitte am Bildschirm gegenprüfen und danach `ungeprueft` entfernen.
- Privatschutz allgemein: Selbstbeteiligung bei Tierhalter fast überall offen; einfacher Diebstahl in der Hausrat bei
  keiner der neuen Gesellschaften als Leistung genannt; Leistung ab Invaliditätsgrad (Unfall) meist nicht belegt.
- Provinzial: Deckungssumme der Privathaftpflicht je Stufe offen; Tierhalter ohne SB.
- Zurich Hausrat: Deckungskonzept 10/2022, Aktualität bestätigen.
- ERGO: Haftpflicht ohne Mietsachschäden, Ehrenamt, Drohnen; Hausrat ohne einfachen Diebstahl und Phishing;
  Wohngebäude aus der Broschüre 9.2024 (aktuelle Fassung gesperrt); Leistungsübersichten auf ergo-meine-druckstuecke.de
  bitte von Hand gegenprüfen.
- R+V: Unfall ohne Progression, Unfallrente und Tagegeld (Varianten individuell); Pferd ohne Selbstbeteiligung; Hausrat
  ohne einfachen Diebstahl; Rechtsschutz ohne Selbstbeteiligung und Wartezeit.
- HUK-COBURG: Hausrat Basis fast ohne Angaben, grobe Fahrlässigkeit und Wertsachen nicht beziffert; Rechtsschutz ohne
  Strafkaution; Unfall ohne Tarifvergleich (Todesfall und Tagegeld nicht beziffert); kein Bündelrabatt.
- DEVK: Hausrat ohne Wertsachen- und Bargeldgrenzen; Wohngebäude ohne Ableitungsrohre und Kosten nach Schaden;
  Rechtsschutz ohne Strafkaution und Selbstbeteiligung; Unfall-Grundsumme individuell.
- Generali: generali.de zeigt nur Highlights; Wertsachen, Selbstbeteiligung, Unfallrente, Tagegeld und Wohngebäude-Details
  fehlen. Verbindliche Werte bitte über die DVAG-Unterlagen bzw. Bedingungen ergänzen.
- Tierversicherer: HanseMerkur OP ohne Angabe zur Vorsorge; BarmeniaGothaer Pferde-OP ohne Erstattungssatz in Prozent und
  ohne Vorsorge; ERGO Hundehaftpflicht ohne Angabe zu fremden Hütern, Pferdehaftpflicht ohne Flurschäden; Uelzener
  ohne veröffentlichte SB-Beträge bei Hund und Pferdehaftpflicht; BarmeniaGothaer Premium Plus Ausland widersprüchlich
  (12 Monate bzw. unbegrenzt).
- Pferdekranken gibt es nur bei Allianz und Uelzener; Pferde-OP zusätzlich bei BarmeniaGothaer und R+V.
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

## Alle Versicherungsprodukte (17.11.2026)

Ole: „Wir müssen auf sämtliche Versicherungsprodukte erweitern, damit wir Gesellschaften und Tarife beim
Cross-Selling mit in die Präsentation nehmen können“ (Chat pusht auf einen Komplettcheck, Vermittler wollen dann z. B.
BU und PKV anbieten). Neue Sparten im Schema: `bu, risikoleben, grundfaehigkeit, pkv, zahnzusatz, krankenhauszusatz,
ambulant, pflegezusatz, rente, basisrente, kfz, reise-kranken, sterbegeld`. Gruppen der Auswahl „+ Versicherung“:
`SPARTEN_GRUPPEN` in `src/lib/tarifkatalog.ts`.

**Datenschutz:** Nur Produktmerkmale, nie Gesundheitsangaben (keine Gesundheitsfragen, keine Risikozuschläge). Angebote
zu Leben, Gesundheit und Vorsorge liest die KI nicht aus (`angebotAuslesbar`, AVV); der Vermittler trägt den Beitrag
selbst ein. „Ohne Gesundheitsfragen“ (Sterbegeld) ist ein Produktmerkmal.

**Alle Werte `ungeprueft: true`** (recherchiert am 17.11.2026 von den Seiten der Gesellschaften), bitte gegenprüfen.
Zahl = Stufen; offene Standardmerkmale in Klammern (Grund im Feld `offen`).

| Sparte | Allianz | AXA | SIGNAL IDUNA |
|---|---|---|---|
| bu | 3 | 3 (rückwirkend) | 2 |
| risikoleben | 3 (weltweit) | 2 (vorgezogen, Verlängerung, Umtausch) | 3 (Umtausch, weltweit) |
| grundfaehigkeit | 1, KörperSchutzPolice (Anzahl) | 1, Existenzschutz (Anzahl, Prognose, Psyche) | 2 (Psyche) |
| pkv | 2, nur Angestellte | 3 | 3 (Selbstbehalt) |
| zahnzusatz | 3 | 3 (Implantate) | 3 |
| krankenhauszusatz | 3 | 3 (Krankenhauswahl) | 4 |
| ambulant | 2 (Arzneimittel) | 2 | 2 |
| pflegezusatz | 1 | 3 (Einmalleistung) | 2 |
| rente | 4 Vorsorgekonzepte (Rentenfaktor teils) | 3 (Hinterbliebene, Rentenfaktor teils) | 2 (Rentenfaktor) |
| basisrente | 1 (Garantie, Rentenfaktor) | 2 (Rentenfaktor) | 2 |
| kfz | 4 inkl. Allianz Direct (grobe Fahrl. bei Direct) | 3 (Neuwert, Marder teils) | 2 |
| reise-kranken | 2 (USA nicht ausdrücklich) | 2 (USA nicht ausdrücklich) | 2 |
| sterbegeld | 1 | 1 (Partner IDEAL) | 1 (Unfall, Beitragsende) |

Zum Gegenprüfen besonders: Rente (Stufen sind Anlagekonzepte, keine Leistungsstufen; Empfehlung nur „mittlere
Stufe“), AXA Kfz (Neupreisentschädigung 12 bzw. 3 Monate widersprüchlich), SIGNAL IDUNA Krankenhaus (Stufen
unterscheiden sich vor allem darin, wann sie leisten), selbst vergebene Kurznamen (SIGNAL IDUNA Risikoleben).
Folien-Test: `tests/unit/vergleichsfolie-passt.test.ts` misst jede Sparte aller drei Gesellschaften.

### Welle 1: Marktführer Leben und Gesundheit (17.11.2026)

Weitere Sparten `dienstunfaehigkeit, krankentagegeld, kinderinvaliditaet, reiseruecktritt`; neue Gesellschaften
Debeka, Alte Leipziger, Hallesche, Swiss Life, Canada Life, Hannoversche, Europa, CosmosDirekt; ERGO (mit DKV),
HUK-COBURG, R+V, HanseMerkur, BarmeniaGothaer und DFV um Leben, Gesundheit und Vorsorge ergänzt. Zahl = Stufen,
„·“ = kein Produkt bei der Gesellschaft bzw. nicht recherchiert. Alles `ungeprueft: true`.

| Sparte | Allianz | AXA | SI | ERGO | HUK | R+V | Debeka | HM | BG | DFV | AL | Hall. | SL | CL | Hann. | Europa | Cosmos |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bu | 3 | 3 | 2 | 2 | 3 | 3 | 1 | · | 2 | · | 1 | · | 2 | 1 | 3 | 2 | 2 |
| dienstunfaehigkeit | 1 | 1 | 2 | · | · | 3 | 1 | · | · | · | · | · | · | · | · | · | · |
| grundfaehigkeit | 1 | 1 | 2 | · | · | 3 | · | · | · | · | 3 | · | 2 | 1 | · | · | · |
| risikoleben | 3 | 2 | 3 | 3 | 3 | 3 | 2 | · | 3 | · | 2 | · | · | 2 | 3 | 2 | 3 |
| kinderinvaliditaet | 1 | 1 | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| sterbegeld | 1 | 1 | 1 | 3 | 1 | 1 | 1 | · | · | · | · | · | · | · | 3 | · | 1 |
| pkv | 2 | 3 | 3 | 3 | 3 | 3 | 4 | 3 | 4 | · | · | 3 | · | · | · | · | · |
| krankentagegeld | 4 | 1 | 3 | 3 | · | 1 | 2 | 1 | 1 | · | · | 2 | · | · | · | · | · |
| zahnzusatz | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 4 | · | 3 | · | · | · | · | · |
| krankenhauszusatz | 3 | 3 | 4 | 3 | 2 | 3 | 1 | 3 | 2 | 4 | · | 3 | · | · | · | · | · |
| ambulant | 2 | 2 | 2 | 3 | 2 | 3 | 2 | 3 | 3 | 4 | · | 3 | · | · | · | · | · |
| pflegezusatz | 1 | 3 | 2 | 3 | 2 | 3 | 2 | 2 | 2 | 3 | · | 2 | · | · | · | · | · |
| reise-kranken | 2 | 2 | 2 | 2 | 2 | · | 1 | 2 | · | 1 | · | 1 | · | · | · | 1 | · |
| rente | 4 | 3 | 2 | 4 | 1 | 3 | 3 | · | 2 | · | 4 | · | 1 | 3 | 2 | 3 | 1 |
| basisrente | 1 | 2 | 2 | 3 | 1 | 2 | 1 | · | · | · | 2 | · | 1 | 2 | · | · | · |
| kfz | 4 | 3 | 2 | 3 | 3 | 3 | 2 | · | · | · | · | · | · | · | · | · | 2 |
| reiseruecktritt | 4 | 2 | 3 | 3 | · | · | · | 3 | · | · | · | · | · | · | · | · | · |

Kein eigenes Produkt laut Seiten der Gesellschaft: Kinderinvalidität bei SIGNAL IDUNA, HUK, R+V, ERGO, Alte Leipziger;
Dienstunfähigkeit bei Alte Leipziger und Swiss Life (BU ohne DU-Klausel); Sterbegeld bei DFV und Europa; Basisrente
bei CosmosDirekt (kein Neugeschäft). Swiss Life Risikoleben fehlt (Produktseite für Abrufe gesperrt).

Zum Gegenprüfen besonders: Stufen, die Zielgruppen oder Varianten sind statt Leistungsstufen (Krankentagegeld,
Rente, Basisrente, Pflege, Reise); Allianz und AXA Kinderinvalidität (Baustein der Kinderunfall bzw. Rente nach
medizinischen Kriterien); Swiss Life (Werte aus Bedingungen, Produktseiten gesperrt); Debeka PKV (Stufen selbst
gebildet, Beihilfetarife fehlen); Hannoversche „110 % Vorabauszahlung“ nur bis 30.11.2026.
Folien-Test misst jetzt jede Sparte jeder Gesellschaft.
