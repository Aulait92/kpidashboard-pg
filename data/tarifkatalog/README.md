# Tarifkatalog (Stand 15.11.2026)

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

- Sparten-Keys: `katze-kranken, katze-op, hund-kranken, hund-op, haftpflicht, hausrat, rechtsschutz, wohngebaeude,
  tierhalter-hund, tierhalter-pferd, unfall`.
- `standard: true`: vorausgewählte Merkmale (höchstens 5), an denen sich die Stufen am meisten unterscheiden und die
  Kunden am meisten interessieren. Die übrigen Merkmale stehen zur Tauschauswahl.
- `kurz`: Merkmal höchstens 28 Zeichen, Baustein höchstens 20 Zeichen.
- Zusätzlich (nur Hinweise, darf ignoriert werden): `version`, `stand`, `grenzen` (Foliengrenzen und Längen),
  `bausteinWerte`, je Sparte `produkt` (Produkt im Lead: `katze`, `hund`, `pferd`, `privatschutz`) und `formularMatch`
  (Wort im Leadformular für die Vorauswahl).

### `<gesellschaft>/<sparte>.json`
Ordner: `allianz`, `axa`, `signal-iduna`.

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
  Stufe (bei 4 Stufen die dritte). Woher die Empfehlung kommt, steht in `empfehlung`: `Gesellschaft` oder `mittlere Stufe`.
- `inAllenTarifen`: höchstens 3 kurze Punkte, die in jeder Stufe gleich sind.
- Zusätzlich gegenüber dem ursprünglichen Format (additiv, darf ignoriert werden): `empfehlung`, `quellen` (alle
  verwendeten Dokumente der Gesellschaft, bei Allianz Rechtsschutz auch Oles Rechner-Screenshot).
- `buendel.json` je Gesellschaft (falls vorhanden): Bündel- bzw. Kombirabatte, eigenes Format, siehe Datei.

## Quellenregel
- Nur öffentliche Quellen der Gesellschaft: Produktseite mit Tarifvergleich, Produktsteckbrief, Produktinformationsblatt
  (IPID), Leistungsvergleich. Vergleichsportale höchstens als Hinweis, nie als einzige Quelle.
- Jeder Tarif hat `quelle` (exakte URL) und `stand` (Datum des Abrufs, hier 15.11.2026). Stand der Dokumente steht unten.
- Nichts erfunden: Was nicht belegbar ist, fehlt und steht in `offen`. Lieber weniger, aber richtig.
- Monatliche Quellprüfung (Teil 4 des Entwurfs): je Tarif `quelle` neu lesen und mit `werte` vergleichen.

## Stand je Datei

vollständig = alle Standardmerkmale belegt; teilweise = Standardmerkmale fehlen; fehlt = keine Datei.

| Sparte | Allianz | AXA | SIGNAL IDUNA |
|---|---|---|---|
| katze-kranken | vollständig (4 Stufen) | fehlt (kein Produkt auf axa.de) | fehlt |
| katze-op | vollständig (4 Stufen) | fehlt (kein Produkt auf axa.de) | fehlt |
| hund-kranken | vollständig (4 Stufen) | fehlt (kein Produkt auf axa.de) | fehlt |
| hund-op | vollständig (4 Stufen) | fehlt (kein Produkt auf axa.de) | fehlt |
| haftpflicht | vollständig (4 Stufen) | teilweise (3 Stufen, geliehene Sachen L offen) | fehlt |
| hausrat | vollständig (4 Stufen) | teilweise (3 Stufen, einfacher Diebstahl offen) | fehlt |
| rechtsschutz | vollständig (4 Stufen) | teilweise (3 Stufen, Strafkaution offen) | fehlt |
| wohngebaeude | vollständig (4 Stufen) | vollständig (2 Stufen) | fehlt |
| tierhalter-hund | vollständig (3 Stufen) | vollständig (1 Tarif) | fehlt |
| tierhalter-pferd | vollständig (3 Stufen) | teilweise (1 Tarif, nur Summe) | fehlt |
| unfall | vollständig (4 Stufen) | vollständig (3 Stufen) | fehlt |

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

## Offen (wichtigste Lücken)
- Allianz Hausrat: Überspannung, Hotelkosten, Außenversicherung, Diebstahl aus dem Auto, Selbstbeteiligung stehen nicht
  im aktuellen Tarifvergleich.
- Allianz Unfall: Ob Invaliditätssumme, Unfallrente und Tagegeld je Stufe fest oder im Rechner wählbar sind, ist nicht belegt.
- Allianz Pferd: Fohlen, Ausland nicht belegt.
- AXA: keine Tierkrankenversicherung; Pferdehaftpflicht nur mit Deckungssumme, Fohlen, Forderungsausfall belegt;
  Rechtsschutz ohne Strafkaution und SB; Haftpflicht L geliehene Sachen widersprüchlich (10.000 € bzw. 20.000 €).
- Details je Datei unter `offen`.
