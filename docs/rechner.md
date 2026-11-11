# Break-even-Rechner (`/rechner`)

Öffentliche Seite für Verkaufsgespräche und Website (Stand 11.11.2026). Kein Login,
keine personenbezogenen Daten, kein Tracking. Alle Eingaben stehen in der URL
(„Link kopieren“), z. B. `/rechner?produkt=tkv&typ=vertreter&budget=40&ap=58`.

Einstellungen: Admin → Einstellungen → **Rechner** (Produkte, Quoten, Kosten pro
Lead, Texte, Kontakt-Link, Garantien). Code: `src/lib/rechner.ts` (Rechnung,
Konfiguration, URL), `src/lib/rechner-server.ts` (DB, echte Kosten pro Lead),
`src/components/rechner-view.tsx` (Seite).

## Formeln (je Monat, Erwartungswerte)

| Größe | Rechnung |
|---|---|
| Leads | Budget/Tag × 30,4 ÷ Kosten pro Lead |
| Kunden | Leads × Anteil Leads, die Kunde werden |
| Verträge | Kunden × Verträge pro Kunde |
| Provision je Vertrag | Jahresbeitrag × (Abschluss-% + Bestand-% 1. Jahr) bzw. Monatsbeitrag × Monatsbeiträge |
| Staffel | bis 3 Stufen nach Verträgen/Monat; höchste erreichte Stufe gilt für alle Verträge des Monats |
| Kosten | (Werbebudget + Betreuung nach Budget-Staffel + weitere Berater) × 1,19 (abschaltbar) |
| Jahreszahlung | Betreuung + Berater × 10/12 (nur mit 12 Monaten) |
| Break-even | kleinste Zahl Verträge n mit n × Provision(n) ≥ Kosten |
| Setup | 990 € (12 Monate) bzw. 2.490 € (ohne Laufzeit) × USt.; „wieder drin nach“ = Setup ÷ Überschuss |
| Jahr 1 | 12 × Überschuss − Setup |

Provision ist umsatzsteuerfrei; Kosten werden für Vertreter standardmäßig inkl. 19 % USt.
gerechnet (Vorsteuer meist nicht abziehbar). Termine sind nur Info, nicht Teil der Rechnung.
Berater 3 inklusive, jeder weitere 49 €; nach Merge der Preis-Erweiterungen auf
`PRICE_LIST` umstellen (Konstanten oben in `rechner.ts`).

## Standardwerte (Ole, 11.11.)

- **Katzenversicherung (TKV)** – einziges aktives Produkt:
  - Kosten pro Lead **6 €** mit Sicherheitspuffer (real zuletzt ca. 2 €).
  - **Makler-Modus: 4 € pro Lead** (Feld `cplMakler`, Hinweis „reales Ergebnis“, Ole 11.11.),
    passend zur Makler-Präsentation. Vertreter bleiben bei 6 €. Einstellbar unter
    Admin → Einstellungen → Rechner („Kosten pro Lead € im Makler-Modus“, leer = wie oben).
    Ältere gespeicherte Einstellungen ohne das Feld bekommen den Standard 4 €.
  - Echte Daten (Cost LEAD ÷ Leads der letzten 180 Tage, Abgleich über den Text „tkv“,
    mindestens 200 Leads) ersetzen den Wert **nur, wenn sie höher sind** – für Vertreter
    und Makler-Wert getrennt geprüft (`resolveCpl` liefert beide).
  - Kontrolle Makler (40 €/Tag, 4 €/Lead, 358 € Beitrag, 22,5 %, 10 % Storno, 12 Monate,
    5 Jahre, inkl. USt.): 304 Leads, 36,5 Verträge pro Monat, laufend gedeckt ab Monat 12,
    alles zurück nach Monat 18, Faktor 4,5, ≈ 417 Verträge nach 12 Monaten, ≈ 72 € je Vertrag
    (Unit-Test „Kontrolle Präsentation“). Mit dem Standardbeitrag 350 €: Faktor 4,4.
  - 9 % der Leads werden Kunden, 1,33 Verträge pro Kunde (= 12 % Verträge je Lead).
  - Ø Jahresbeitrag 350 €, Vertreter 55 % Abschlussprovision, Makler 22,5 % Bestand p. a.
- Privatschutz (12 €/Lead, 10 % Kunden, 600 €) und PKV-Tarifoptimierung (nur Makler,
  25 €/Lead, 7,5 %, 250 €/Monat, 10 Monatsbeiträge) sind angelegt, aber **aus** –
  alle Werte dort sind Annahmen.

**Prüfung gegen die Präsentation:** 800 € Werbung bei 4 € = 200 Leads → 18 Kunden →
24 Verträge → 24 × 358 € = 8.592 € Beitrag → × 58 % ≈ 4.983 € Provision (Folie: 5.000 €);
Kosten (800 + 1.000) × 1,19 = 2.142 € wie auf der Folie. Abgesichert im Unit-Test.

Mit den Standardwerten (30 €/Tag, 6 €/Lead): 152 Leads, 18,2 Verträge, 3.511 € Provision,
2.275 € Kosten → ≈ 1.236 € Überschuss/Monat, Break-even ab 12 Verträgen.

## Makler: Bestandssicht (Ole, 11.11.: „bei Katze für Makler bleiben, 10 % Storno“)

Makler bekommen bei TKV keine Abschlussprovision (0 %), sondern 22,5 % Bestandscourtage
pro Jahr. „Überschuss pro Monat“ ist dafür die falsche Frage: Der Bestand zahlt nach der
Kampagne weiter. Der Rechner schaltet deshalb **automatisch in den Makler-Modus**, wenn
Abschluss = 0 % (auch in der Staffel) und Bestand > 0 % sind. Vertreter behalten die
bisherige Ansicht; haben sie Bestandsprovision, steht darunter eine Zeile zum Bestand.

| Größe | Rechnung (je Monat m) |
|---|---|
| Bleibequote | r = (1 − Storno)^(1/12), Storno Standard **10 % pro Jahr** (Eingabe unter „Ihre Erfahrungswerte“, 1–50 %) |
| Bestand | N(m) = N(m−1) × r + neue Verträge (neue nur während der Kampagne) |
| Courtage | N(m) × Jahresbeitrag × Bestand-% ÷ 12 + neue Verträge × Jahresbeitrag × Abschluss-% (Mischfall) |
| Kosten | Werbung nur während der Kampagne; Betreuung + Berater während der Kampagne, bei 12 Monaten Laufzeit mindestens 12 Monate; × USt.; Setup in Monat 0 |
| Kampagnendauer | 6 / 12 / 24 Monate, Standard 12 |
| Horizont | Courtage zählt bis 3 / 5 / 10 Jahre nach Kampagnenende, Standard 5 |
| Je Vertrag | Lebenszeit-Courtage = Jahresbeitrag × Bestand-% ÷ Storno (+ Abschluss) – Faustformel; Kosten je Vertrag = Monatskosten ÷ Verträge im Monat (ohne Setup) |
| Nach der Kampagne | Bestand N(Kampagnenende) und laufende Courtage/Jahr = N × Jahresbeitrag × Bestand-% |
| Gesamtrechnung | Courtage Monat 1 bis Kampagne + Horizont × 12 gegen alle Kosten inkl. Setup; Faktor = Courtage ÷ Kosten |
| Laufend gedeckt ab | erster Kampagnenmonat mit Courtage(m) ≥ Kosten(m); nur angezeigt, wenn innerhalb der Kampagne |
| Break-even | erster Monat mit kumulierter Courtage ≥ kumulierten Kosten, inkl. Nachlauf |

Courtage ist **nicht abgezinst**; Beitrag und Satz bleiben über die Jahre gleich. Das steht
so auch auf der Seite. URL-Parameter: `st` (Storno in %), `km` (Kampagnenmonate), `hz`
(Horizont in Jahren), nur bei Abweichung vom Standard. Im Makler-Modus zeigt der
Garantie-Kasten die Lead-Garantie und die **Vertrags-Garantie** (Freigabe Ole, 11.11.):
„Nach 90 aktiven Tagen mindestens 15 Verträge – sonst sind Betreuung und Software kostenlos,
bis sie erreicht sind, längstens 6 Monate. Voraussetzung: mindestens 20 € Werbebudget pro
Tag, 80 % der Termine wahrgenommen, Ergebnisse bei 80 % der Leads eingetragen.“ Die
Mindestzahl kommt aus `VERTRAGS_GARANTIE_MIN_VERTRAEGE` (rechner.ts), das Mindestbudget aus
der Lead-Garantie. Die Break-even-Garantie nach 90 Tagen gilt vorerst nur für Vertreter
(Makler liegen nach 90 Tagen naturgemäß unter den Kosten). Das Bestandskunden-Modul
taucht im Rechner nicht als Kosten auf (für Makler künftig inklusive).

**Budget statt Preis (Ole, 11.11.):** Für Makler empfehlen wir mehr Budget statt eines
niedrigeren Preises. Ohne `budget`-Parameter startet der Makler-Modus mit **40 €/Tag**
(`BUDGET_STANDARD`; Vertreter 30 €). Wechselt man von Vertreter auf Makler und hat das
Budget nicht verändert, springt es mit. QR-Code der Präsentation:
`/rechner?produkt=tkv&typ=makler&budget=40`.

Der Makler-Modus zeigt deutlich **Kosten je Vertrag** = (Werbung + Betreuung/Software
+ Berater, inkl. USt.) pro Monat ÷ neue Verträge pro Monat, darunter „Die Betreuung kostet
bis 3.000 € Werbebudget immer gleich viel – mehr Budget macht jeden Vertrag günstiger.“
(Grenze aus `PRICE_LIST`) und einen Vergleich 40 / 60 / 100 €/Tag mit Kosten je Vertrag
und Courtage/Jahr nach 12 Monaten (`budgetVergleich`, gleiche Eingaben, nur anderes Budget).

| €/Tag | je Vertrag bei 4 €/Lead (Präsentation) | je Vertrag bei 6 €/Lead (Rechner-Standard) | Courtage/Jahr nach 12 Mon. (6 €) |
|---|---|---|---|
| 27 | 88 € | 132 € | 14.789 € |
| 40 | 72 € | 108 € | 21.909 € |
| 60 | 61 € | 92 € | 32.864 € |
| 98 | 53 € | 80 € | 53.677 € |
| 100 | 58 € ² | 87 € ² | 54.773 € |

² 100 €/Tag sind 3.040 € im Monat und liegen damit über 3.000 € – die Betreuung springt auf
1.400 € (zweite Stufe). Die Präsentation (≈ 53 € bei 100 €/Tag) rechnet noch mit 1.000 €;
die erste Stufe reicht bis 98 €/Tag.

Mit 40 €/Tag (Makler-Standard, 6 €/Lead, 12 Monate, +5 Jahre): 278 Verträge im Bestand,
21.909 € Courtage/Jahr, Courtage gesamt 96.840 € gegen 32.823 € Kosten (≈ 3,0×),
Break-even kumuliert in Monat 25.

**Referenz (30 €/Tag, 6 €/Lead, 12 Monate, inkl. USt.)** – im Unit-Test abgesichert:

| Kennzahl | Referenz Ole | Rechner (18,24 Verträge/Monat) |
|---|---|---|
| Verträge nach 12 Monaten | ≈ 208 | 208,7 |
| laufende Courtage/Jahr | ≈ 16.396 € | 16.432 € |
| Courtage während der Kampagne | ≈ 9.024 € | 9.044 € |
| 5 Jahre nach Kampagnenende | ≈ 64.006 € | 63.586 € ¹ |
| Kosten inkl. Setup | ≈ 28.500 € | 28.481 € |
| Courtage gesamt / Faktor | ≈ 73.000 € / 2,6× | 72.630 € / 2,55× |
| Lebenszeit je Vertrag | ≈ 788 € | 787,50 € |
| Kosten je Vertrag | ≈ 125 € | 124,74 € |
| Laufend gedeckt ab | Monat 21 | Monat 21 (nur bei 24 Monaten Kampagne sichtbar) |
| Break-even kumuliert | – | Monat 28 (16 Monate nach Kampagnenende) |

¹ Der Rechner zieht schon im ersten Monat nach Kampagnenende Storno ab; die Referenz
(16.396 € ÷ 12 × Σ r^k, k = 0…59) nicht. Mit genau 18,2 Verträgen: 63.447 € statt 64.006 € (−0,9 %).

## Garantien (Freigabe Ole, 11.11.)

- **Lead-Garantie – Standard an:** „Bei mindestens 20 € Werbebudget pro Tag bekommen
  Sie in den ersten 30 Tagen nach Kampagnenstart mindestens 100 Leads – sonst sind
  Betreuung und Software im Folgemonat kostenlos.“ Erscheint nur bei Produkten mit „Mindest-Leads
  in 30 Tagen“ (TKV: 100). Unter 20 €/Tag weist der Rechner darauf hin.
- **Break-even-Garantie – Standard an:** „Liegt Ihre Provision nach 90 Tagen unter
  Ihren Kosten für Werbung und Betreuung, betreuen wir Sie ohne Betreuungsgebühr
  weiter – auf Wunsch mit einem anderen Produkt –, bis es sich rechnet (längstens
  6 Monate). Voraussetzung: mindestens 20 € Budget pro Tag, mindestens 80 % der
  gebuchten Termine wahrgenommen und Ergebnisse in der App eingetragen.“
- **Produktwechsel-Garantie – Standard aus** (steckt jetzt in der Break-even-Garantie).

Darunter „Details in unseren AGB“ mit Link auf `/rechtliches/agb` (in den Einstellungen
änderbar, nur eigene Seite oder https). Die AGB müssen dieselben Bedingungen enthalten.
