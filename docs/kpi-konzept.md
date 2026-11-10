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
| WhatsApp-Gebühren | Weiterberechnung | durchlaufend – **nicht als Umsatz** |

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
- **Provision je Produkt:** liefert Ole (Durchschnittsprovision je Produkt als
  Einstellung pflegen).
- **Investorentyp:** noch offen – Seite deckt VC (Wachstum, NRR) und
  strategische Investoren (Wirkung, Netzwerk) ab.

## Reihenfolge der Umsetzung
1. Umsatzbuch + Kopfzeile + MRR-Brücke + Ströme + Margen
2. Kohorten, Kündigungen, Abhängigkeit, Wirkung
3. Kostenzweck + CAC/LTV, Investoren-Ansicht und -Update
