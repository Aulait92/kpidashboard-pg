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
