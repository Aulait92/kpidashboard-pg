# Zahlen-Seite neu (investorentauglich) – Konzept

Stand 10.11.2026. Prototyp: Scratchpad `zahlen/index.html` (Beispielzahlen).
Umsetzung **nach dem Livegang** (erst dann liegen Kunden, Stripe-Abos und Vertrieb
in einer Datenbank).

## Fundament: Umsatzbuch
Eine Zeile je Monat × Kunde × Strom, alle Kennzahlen rechnen nur daraus.

| Strom | Quelle | Art |
|---|---|---|
| Software | Stripe-Abos aus Angeboten | wiederkehrend (vertraglich) |
| Betreuung | Stripe bzw. Retainer am Kunden | wiederkehrend (vertraglich) |
| Pay-per-Lead | bezahlte LeadOrder minus Gutschriften (Storno) | wiederkehrend (nutzungsbasiert), seit Juni 2026 |
| Einrichtung | Angebote (setupFee) | einmalig – **nicht im MRR** |
| WhatsApp-Gebühren | im Preis enthalten (seit 11.11.2026) | **kein Umsatz**, direkte Software-Kosten (aus den verschickten Nachrichten) |
| Weitere Logins, Bestandskunden-Modul | Abo-Positionen | Software (wiederkehrend) |
| Jährliche Vorauszahlung | Jahresrechnung | MRR = Jahresbetrag ÷ 12 (Monatspreis × 10/12), keine Spitze im Zahlungsmonat |

## Kopfzeile
Laufrate (MRR × 12) · MRR (+ vertraglicher Anteil) · Wachstum zum Vormonat ·
Umsatzbindung (bis 12 Monate Historie als „früh“ markiert, danach NRR) ·
Bruttomarge · Aktive Kunden.

## Bereiche
- **Wachstum:** Umsatz je Strom/Monat, MRR-Brücke (neu, Ausbau, verkleinert,
  gekündigt), Umsatzmix vertraglich/nutzungsbasiert, Einmalumsätze getrennt.
- **Kunden:** Kohorten nach Startmonat, Kunden je Strom, Kündigungsquote,
  Abhängigkeit (Top-5-Anteil, größter Kunde).
- **Wirtschaftlichkeit:** CAC, Rohertrag je Kunde, Amortisation, LTV/CAC
  (LTV auf 24 Monate gedeckelt), Marge je Strom, Kostentabelle mit Zweck.
- **Wirkung beim Vertreter:** „Pro 1 € an uns X € Provision“, Trichter Lead →
  Abschluss, Reaktionszeit, Automatisierungsgrad, Nutzung der App.
- **Vertrieb** (intern) und **Pay-per-Lead** (intern, bisherige Lead-Kennzahlen).
- **Investoren-Ansicht** (Definitionen sichtbar, interne Bereiche aus) und
  **Investoren-Update** (Monatsbericht, eine Seite).

## Entscheidungen (Ole, 10.11.)
- **Kosten:** keine Gehälter. Tools: Instantly, Zapier, Claude (größte Posten);
  Werbung über Meta. Kosten bekommen einen Zweck: *direkt* (Marge) oder
  *Kundengewinnung* (CAC). Meta-Kampagne „Allianz Lead Ads“ = Kundengewinnung.
- **Gründerzeit im CAC:** zusätzlich ausgewiesen, **20 Std./Woche Vertrieb ×
  60 €/Std.** (≈ 5.200 €/Monat).
- **Wirkung:** nur Kunden einrechnen, die ≥ 80 % ihrer Leads mit Ergebnis
  versehen (Retainer-Kunden ja, Pay-per-Lead-Käufer teils nicht). Basis
  („9 von 16 Kunden“) immer mit anzeigen.
- **Provision je Produkt** (Ole, 10.11.; als Einstellung pflegbar machen):

  | Produkt | Provision | Berechnung |
  |---|---|---|
  | PKV-Tarifoptimierung | nur Makler: 8–12 Monatsbeiträge (Standard 10) | × Monatsnettobeitrag; ohne Angabe 2.500 € |
  | Privatschutz | 50–60 % (Mitte 55 %) | × Jahresnettobeitrag |
  | TKV | 50–60 % (Mitte 55 %) | × Jahresnettobeitrag |
  | Kindersparpläne | offen | Ole fragt nach |
  | Kinderwunsch | – | wird nicht mehr angeboten |

  Umgesetzt in `src/lib/provision.ts` (Regelarten fixed / percent / monthly,
  Standardbeiträge Privatschutz 600 €, TKV 350 €; kundenspezifische Sätze als
  `overrides` vorbereitet). `Lead.closeValue` = Monatsbeitrag (PKV) bzw.
  Jahresnettobeitrag (Privatschutz, TKV) bzw. freier Wert (sonstige). In der
  Anzeige ausweisen, wie viele Abschlüsse mit echtem Beitrag gerechnet sind.
- **Vertreter vs. Makler** (Ole, 10.11.): `Customer.vermittlerTyp`. Makler bekommen bei
  Sach (Privatschutz, TKV) keine Abschlussprovision, sondern 20–25 % Bestandsprovision
  p. a. (Standard 22,5 %); PKV-Tarifoptimierung nur Makler. Geschätzte Provision =
  Abschlussprovision + Bestand des 1. Jahres. Admin stellt den Typ in der Kundenakte um.
- **Eigene Sätze der Vertreter** (Ole, 10.11.): Kundenbereich → Einstellungen →
  „Meine Provisionen“ (`/buyer/provisionen`, gespeichert in `Customer.provisionRates`),
  je Produkt fester Betrag, Prozent vom Jahresbeitrag (Abschluss + Bestand) oder
  Monatsbeiträge; vorausgefüllt mit den Standardwerten, nur Inhaber ändern.
  Zahlen-Seite zeigt, bei wie vielen Kunden eigene Sätze hinterlegt sind.
- **Investorentyp:** noch offen – Seite deckt VC (Wachstum, NRR) und
  strategische Investoren (Wirkung, Netzwerk) ab.

## Reihenfolge der Umsetzung
1. Umsatzbuch + Kopfzeile + MRR-Brücke + Ströme + Margen
2. Kohorten, Kündigungen, Abhängigkeit, Wirkung
3. Kostenzweck + CAC/LTV, Investoren-Ansicht und -Update

## Umgesetzt (11.11.2026, vor dem Livegang)
Alle drei Schritte. Seite **/admin/zahlen** (Admin-A-Navigation „Zahlen“; die
alte Seite „/“ heißt dort „Pay-per-Lead (Details)“), Einstellungen unter
**/admin/einstellungen/kosten** („Laufende Kosten“: Tools mit Zweck, Gründerzeit,
Kampagnen der eigenen Kundengewinnung). Migration `20261113090000_kosten_zweck`.

- Rechenlogik ohne Datenbank: `src/lib/revenue-ledger.ts` (Umsatzbuch,
  MRR-Brücke, Kohorten, Bindung, Kündigungsquote, Abhängigkeit), Loader und
  alle Kennzahlen: `src/lib/zahlen.ts`, Ansicht: `src/components/admin/zahlen-view.tsx`.
- **Annahmen Umsatzbuch** (Kopf von revenue-ledger.ts):
  - Pay-per-Lead = nicht stornierte `Revenue`-Zeilen; bezahlte `LeadOrder`
    werden nicht zusätzlich gezählt (sonst doppelt).
  - Betreuung/Software = `Customer.retainerMonthly` ab `retainerStart`,
    tagesanteilig; Software-Anteil = `Offer.softwareFee` des angenommenen
    Angebots, ohne Angebot alles Betreuung; Startpreis-Phase und Kunden-Pausen
    (nur Software zählt) berücksichtigt.
  - Ende: gekündigtes Stripe-Abo → letzte Änderung des Angebots; archivierter
    Kunde ohne Abo → Monat des letzten Leads.
  - Einrichtung = `setupFee` angenommener Angebote im Monat der Zahlung
    (sonst Annahme), nie im MRR. WhatsApp-Gebühren sind kein Umsatz (im Preis enthalten, als Kosten erfasst).
  - Laufender Monat: Pay-per-Lead und Meta-Kosten hochgerechnet, Retainer
    voll. Brücke, Kündigung, Kohorten, Bindung, Marge und CAC nur mit
    abgeschlossenen Monaten.
- **Kosten:** Meta-`Cost` (LEAD) = direkt Pay-per-Lead, außer Kampagnen aus
  den Einstellungen (Standard „Allianz Lead Ads“) = Kundengewinnung;
  `Cost` OTHER = sonstiger Betrieb; Tools als laufende Kosten mit Zweck.
  Achtung: Meta-Kampagnen, die keinem Produkt zugeordnet sind, landen im
  Abgleich nicht in `Cost` (nur als „nicht zugeordnet“) – eigene Kampagnen
  müssen also einem Produkt zugeordnet sein **oder** als laufende Kosten
  „Kundengewinnung“ gepflegt werden.
- **Ehrlich leer**, bis Daten da sind: Bindung bis 3 abgeschlossene Monate,
  Brücke bis 2, Wirkung ohne Kunden mit ≥ 80 % Ergebnissen, Kanäle ohne
  `customerSource`, Automatisierungsquote ohne WhatsApp-Kunden.
- **Offen:** App hat keinen Dunkelmodus (Palette für dunkel vorbereitet),
  Termin-Stufe im Wirkungs-Trichter nur aus der Terminbuchung (`Appointment`).

## Nachvollziehbarkeit, Einrichtungsgebühren, Produkte (11.11.2026)
Anlass: Ole zweifelte an „Aktive Kunden 9“ und Betreuung/Software 0 €. Stand
heute gibt es nur Pay-per-Lead-Kunden (Betreuungskunden sind im Onboarding),
0 € Betreuung/Software ist also richtig. Die Seite zeigt jetzt, woraus jede
Zahl besteht. Migration `20261114180000_zahlen_nachtrag`.

- **„Woraus besteht das?“** unter Laufrate, MRR, Umsatzbindung, Bruttomarge
  und Aktive Kunden (nicht in der Investoren-Ansicht). Zeigt je Kunde den
  Strom, den Betrag im Monat und die Quelle mit Link zur Kundenakte:
  Pay-per-Lead nach Herkunft des Leads (Airtable-Abgleich, Pay-per-Lead-Engine,
  Lead-Eingang, Umsatz ohne Lead), Betreuung/Software aus „Angebot“ oder
  „Retainer in Kundenakte“, Einrichtung aus „Angebot“ oder „Nachtrag“.
  Bruttomarge zusätzlich mit den direkten Kosten und der Rechnung, Umsatzbindung
  je Kunde damals/heute.
- **Aktive Kunden** zusätzlich mit verkauften Leads je Kunde und Hinweisen auf
  mögliche Nicht-Kunden: `intern` (Paket internal), „Test?“ (Test/Demo im
  Namen), „nur Test-Bezug“, „archiviert“, „nur N Leads“ (höchstens 2 verkaufte
  Leads ohne weiteren Strom) und „doppelt?“ (zweite Kundenakte mit gleichem
  Namen ohne Klammerzusatz/Rechtsform oder gleicher E-Mail eines Logins bzw.
  Vertriebskontakts). Filter „nur mit Hinweis“. Hinweise sind Verdachtsfälle,
  die Zählung selbst bleibt unverändert.
- **Kunden ohne hinterlegte Betreuungsgebühr:** Hinweiskarte für Kunden, die
  live sind (Onboarding `liveAt` gesetzt oder `retainerStart` erreicht), nicht
  archiviert, Paket Betreuung oder Software, ohne `retainerMonthly` und ohne
  angenommenes Angebot. Kunden im Onboarding vor dem Start werden nicht
  gemeldet. Link „In der Kundenakte eintragen“ führt zu Kundenakte →
  Abrechnung, Karte **Betreuungsgebühr** (Monatsbetrag netto, Start, optional
  Ende `retainerEnd`; leerer Betrag entfernt sie). Ändert nichts in Stripe,
  wirkt im Umsatzbuch und in den Lead-Kosten des Kunden-Dashboards;
  Änderungsprotokoll `billing.retainer`. Das Ende von Hand geht vor den
  Ableitungen aus Abo und Archiv.
- **Einrichtungsgebühren je Monat** (Tab Wachstum, ersetzt „Einmalige
  Umsätze“): Summe laufender Monat und Kalenderjahr, Balken je Monat getrennt
  nach Angebot, Nachtrag Einrichtung, Nachtrag Sonstiges (eigener Zeitraum bis
  24 Monate zurück, also auch vor Juni 2026). **„Einmal-Umsatz nachtragen“**:
  Monat, Kunde optional, Betrag netto, Art, Notiz; Einträge mit Löschen.
  Tabelle `ManualRevenue`, fließt als Strom `setup` ins Umsatzbuch (nie in den
  MRR, ab Juni 2026 auch in der Tabelle „Umsatz je Monat“), Änderungsprotokoll
  `kpi.nachtrag`.
- **Tab Produkte** (intern; `src/lib/produkte.ts`, Zeitraum über
  `?zeitraum=` 30 / 90 Tage, dieser/letzter Monat, Jahr, seit Juni 2026;
  Standard 90 Tage): je Produkt Leads, Werbekosten, Kosten je Lead,
  Termin-Quote, Abschlüsse, Abschlussquote, gemeldete Jahresbeiträge (Anzahl),
  geschätzte Provision und Pay-per-Lead-Umsatz. Darunter Matrix Produkt ×
  Vertreter mit Leads, Kosten je Lead und Abschlussquote, Name verlinkt zur
  Kundenakte. Leer = „–“, unter 10 Leads „wenig Fälle“ bzw. Stern.
  - Produkt = `Lead.source` über `canonicalProductKey` (PKV Wechsel und
    Tarifoptimierung zusammen), Kosten über `Cost.product`, Umsatz über den Lead.
  - Leads ohne anerkannte Stornos, interne Kunden ausgenommen.
  - Werbekosten = Meta-`Cost` (LEAD) mit Produkt, ohne Kampagnen der eigenen
    Kundengewinnung. Kosten ohne Kunde (Pool) werden in der Matrix nach Anteil
    an den Leads des Produkts verteilt („anteilig“).
  - Termin = Termin im Kalender oder Status „Termin vereinbart“.
  - Jahresbeitrag = gemeldeter Wert bei Prozent-Produkten, Monatsbeitrag × 12
    bei Monats-Produkten (PKV); freie Werte unbekannter Produkte zählen nicht
    als Beitrag. Provision = `estimatedProvision` mit den Sätzen des Kunden.
- Tests: `tests/unit/zahlen-nachtrag.test.ts`, `tests/unit/produkte.test.ts`,
  `tests/integration/zahlen-drilldown.test.ts`.

## BWA (Tab „BWA“, intern)

Vereinfachte betriebswirtschaftliche Auswertung je Monat, netto, Berliner Monate (`lib/bwa.ts`, Aggregation in `lib/bwa-shared.ts`). Zeitraum über `?bwa=2026` (Jahr, Standard laufendes Jahr) oder `?bwa=12m`.

- **Umsatzerlöse:** Software, Betreuung, Pay-per-Lead, Einrichtung/Einmal aus dem Umsatzbuch (ohne interne Kunden). Pay-per-Lead im laufenden Monat **nicht hochgerechnet** (Spalte „bisher“).
- **Direkte Kosten:** Meta-Werbung Pay-per-Lead, WhatsApp-Gebühren (wenn im Preis enthalten), Bank/Karte „Direkt: Pay-per-Lead“ und „Direkt: Software“, laufende Kosten mit Zweck ppl/software → Rohertrag und Rohertragsquote.
- **Kundengewinnung:** Meta-Akquise-Kampagnen, Bank/Karte „Kundengewinnung“, laufende Kosten akquise.
- **Sonstiger Betrieb:** Bankbuchungen gruppiert nach Regel-Bezeichnung (ohne Klammerzusatz), sonst Empfänger; laufende Kosten betrieb; manuelle Kosten (OTHER). Posten unter 1 % der Betriebskosten im Zeitraum → „Sonstiges“.
- **Betriebsergebnis** vor Steuern, ohne Unternehmerlohn, Marge und kumuliert.
- Monate vor dem ersten Bankumsatz sind „unvollständig“ markiert. Hinweise: offene Ausgaben, letzter Amex-Import, Bankdaten ab.
- Jede Zeile: „Woraus besteht das?“ je Monat (Kunden bzw. Buchungen mit Brutto/Netto). „Als CSV“: Semikolon, deutsche Zahlen, Kosten negativ (für den Steuerberater).
- Gleiche Quellen wie `loadCosts`; Abweichung zur Zahlen-Übersicht nur durch die fehlende Hochrechnung im laufenden Monat.

## Sicht „Kerngeschäft“ / „Gesamt“ (`?sicht=kern|gesamt`)

- **Kerngeschäft (Software + Betreuung):** Umsatzbuch ohne Strom `ppl` (Pay-per-Lead-Pilot); Einrichtungsgebühren bleiben. Kosten ohne direkte Pay-per-Lead-Kosten (Meta-Werbung für Kunden-Leads, Bank/Karte und laufende Kosten mit Zweck „Pay-per-Lead“), damit die Bruttomarge nicht verzerrt wird. Gilt für MRR, Laufrate, Wachstum, aktive Kunden, Umsatzbindung, Kündigungen, Kohorten, Konzentration, Bruttomarge, CAC/Payback/LTV und die Drilldowns. Unter den Kopfzahlen steht immer der Gesamtumsatz inkl. Pay-per-Lead („nichts versteckt“).
- **Gesamt:** wie bisher, inkl. Pay-per-Lead.
- Standard: interne Ansicht „Gesamt“, Investoren-Ansicht „Kerngeschäft“; die zuletzt gewählte Sicht wird je Ansicht im Browser gemerkt (`zahlen-sicht`, `zahlen-sicht-investor`).
- Reiter „Pay-per-Lead (Pilot)“ rechnet immer mit allen Daten. Pilotphase ab `FIRST_MONTH`, Ende optional unter Einstellungen → Kosten (`KpiSettings.pplPilotEnd`); erscheint im Investoren-Update („Pilot Juni–November 2026 abgeschlossen; Fokus auf Software + Betreuung“).
- BWA bleibt vollständig; Pay-per-Lead-Zeilen sind mit „(Pilot)“ beschriftet.
- Logik ohne Datenbank in `src/lib/zahlen-sicht.ts` (getestet).
