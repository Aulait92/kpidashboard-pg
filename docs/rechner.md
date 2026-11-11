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
  - Echte Daten (Cost LEAD ÷ Leads der letzten 180 Tage, Abgleich über den Text „tkv“,
    mindestens 200 Leads) ersetzen den Wert **nur, wenn sie höher sind**.
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

## Garantien (Freigabe Ole, 11.11.)

- **Lead-Garantie – Standard an:** „Bei mindestens 20 € Werbebudget pro Tag bekommen
  Sie in den ersten 30 Tagen nach Kampagnenstart mindestens 100 Leads – sonst ist die
  Betreuung im Folgemonat kostenlos.“ Erscheint nur bei Produkten mit „Mindest-Leads
  in 30 Tagen“ (TKV: 100). Unter 20 €/Tag weist der Rechner darauf hin.
- **Break-even-Garantie – Standard an:** „Liegt Ihre Provision nach 90 Tagen unter
  Ihren Kosten für Werbung und Betreuung, betreuen wir Sie ohne Betreuungsgebühr
  weiter – auf Wunsch mit einem anderen Produkt –, bis es sich rechnet (längstens
  6 Monate). Voraussetzung: mindestens 20 € Budget pro Tag, mindestens 80 % der
  gebuchten Termine wahrgenommen und Ergebnisse in der App eingetragen.“
- **Produktwechsel-Garantie – Standard aus** (steckt jetzt in der Break-even-Garantie).

Darunter „Details in unseren AGB“ mit Link auf `/rechtliches/agb` (in den Einstellungen
änderbar, nur eigene Seite oder https). Die AGB müssen dieselben Bedingungen enthalten.
