# CPL gegen Budget: Vorprüfung „PPL im Werbekonto des Vermittlers“ (20.11.2026)

Auftrag: Ole über Chief of Staff, Vorprüfung aus `protokolle/2026-11-20-ppl-im-kundenkonto.md` (Beschlussvorschlag 1).
Frage: Steigt der Leadpreis (CPL) in unseren eigenen Werbekonten mit dem Tagesbudget, und wäre er in Kundenkonten niedriger?
Bearbeitet: Data & BI. Stand der Daten: 20.11.2026, 14:52 UTC.

## Ergebnis zuerst

**Offen. Mit den heute zugänglichen Daten lässt sich die Kernannahme weder stützen noch widerlegen.**
Es gibt keine einzige Datenreihe, in der Tagesausgaben und Leads je Kampagne oder Konto gemeinsam abrufbar sind. Die
Tageswerte liegen zwar in der Datenbank (`AdSpendDaily`: Ausgaben, Impressionen, Klicks, Meta-Leads je Anzeige und Tag),
aber keine Diagnose-Abfrage gibt sie aus, und die Zuordnung Lead zu Kampagne fehlt bei 98 % der Leads.

**Empfehlung:** Pilot nicht mit „CPL steigt mit Budget“ begründen, solange das nicht gemessen ist. Erst die ohnehin geplante
Diagnose-Abfrage Werbeausgaben bauen (offene Aufgabe, Termin 24.11., Data/BI mit CTO), dann 1 Tag Auswertung über 90 Tage.
Parallel der Kontotest unten (B, kostet nur das ohnehin laufende Budget). Stufe: Auswertung C, Kontotest B, Pilot bleibt A.

## Was die Daten zeigen

Quelle: Diagnose-Schnittstelle `app.performancegrowth.de/api/ops/diagnose`, Abfragen `anzeige-abdeckung`, `kette`, `ppl`,
`meta`; Stand 20.11.2026 14:52 UTC. Direkter Lesezugriff auf die Meta-API war in dieser Sitzung nicht freigegeben.

### 1. Werbekosten in der Datenbank

| Bereich | Zeilen (Anzeige × Tag) | Ausgaben | Zeitraum | Leads zuordenbar |
|---|---:|---:|---|---|
| Agentur-/Pool-Konten (ohne Kunde) | 837 | 10.469,59 € | bis 90 Tage zurück, genaue Spanne nicht ausgegeben | nein (siehe 2.) |
| Kundenkonto Allianz Schwarzkopf (Privatschutz) | 51 | 144,45 € | 13.11. bis 17.11.2026 (5 Tage) | 0 Leads im System |
| Übrige Kundenkonten (eigenes Werbekonto) | 0 | 0 € | keine Kostenzeilen | entfällt |

Quelle: `q=anzeige-abdeckung`, Felder `gesamt.kostenOhneKunde`, `kunden[].kosten`.
Folge: **Ein Vergleich eigene Konten gegen Kundenkonten ist nicht möglich.** Es gibt genau ein Kundenkonto mit Kosten, mit
5 Tagen und ohne Leads.

### 2. Zuordnung Lead zu Anzeige/Kampagne

| Kennzahl | Wert |
|---|---:|
| Leads ab Kundenstart (11 Kunden) | 1.353 |
| davon mit Anzeigen-ID | 23 (1,7 %) |
| davon mit Kampagne | 23 (1,7 %) |
| davon mit Formular | 25 (1,8 %) |
| Leads mit Meta-Lead-ID | 0 |

Quelle: `q=anzeige-abdeckung`, `gesamt`. Damit ist kein CPL je Kampagne, Anzeigengruppe oder Gebiet rechenbar.

### 3. Leads nach Herkunft (ohne Testleads)

| Zeitraum | alle | Vermittler-Konten | PPL | davon PPL aus Pool | davon PPL über Airtable |
|---|---:|---:|---:|---:|---:|
| 30 Tage | 242 | 177 | 65 | 43 | 22 |
| 90 Tage | 1.305 | 1.181 | 124 | 43 | 81 |
| gesamt | 2.766 | 2.620 | 146 | 43 | 103 |

Quelle: `q=kette`, `zeitraeume.*.herkunft`. Pool-Leads gibt es erst in den letzten 30 Tagen. Leads aus Meta direkt: 0
(sie kommen über Airtable bzw. Zapier, ohne Kampagnenbezug).

### 4. Grobe Spanne für den durchschnittlichen CPL der Agenturkonten

Nur als Plausibilitätsprüfung, nicht als Befund:
- 10.469,59 € ÷ 124 PPL-Leads (90 Tage) = **rund 84 € je Lead**, falls alle Agentur-Ausgaben PPL dienten.
- 10.469,59 € ÷ 1.305 alle Leads (90 Tage) = **rund 8 € je Lead**, falls auch Vermittler-Leads aus Agenturkonten kommen
  (z. B. Tier-Leads Rutsch, 542 Leads ohne eigenes Konto).

Die Spanne 8 bis 84 € ist zu breit für eine Aussage. Die Annahmen in unseren Papieren streuen ähnlich: Ole 10 bis 15 €
(Entscheidungslog 20.11., HvK), CFO 20 € (Protokoll PPL im Kundenkonto), HvK-Planung PKV 36 € Basis. **Es gibt heute keine
belegte CPL-Zahl je Produkt.**

### 5. Tagesbudget gegen CPL, Wochen mit Erhöhung, Frequenz

Nicht auswertbar. Die Tageswerte (Ausgaben, Impressionen, Klicks, Meta-Leads je Anzeige) sind in `AdSpendDaily`
gespeichert, Reichweite und Frequenz werden nicht gespeichert. Eine Budget-Historie je Kampagne gibt es nicht
(`CustomerBudget` und `BudgetChange` betreffen nur Kundenbuchungen, kein Snapshot des Meta-Tagesbudgets je Kampagne;
im Media-Buyer-Plan als Stufe 2 vorgesehen).

## Grenzen

- Keine Tagesreihe abrufbar, daher keine Korrelation, keine Regression, keine Signifikanz.
- Pool-Betrieb erst seit gut 30 Tagen mit 43 Pool-Leads: selbst mit Tageswerten wären es wenige Budgetstufen.
- Meta-Leads in `AdSpendDaily` zählen Formular-Einsendungen laut Meta, nicht abrechenbare Leads (Dubletten, Ablehnungen).
- Kundenkonten: ein Konto, 5 Tage. Ein Konto-Vergleich ist mit diesem Stand nicht möglich.
- Selbst ein gemessener Anstieg mit dem Budget unterscheidet nicht zwischen den beiden Erklärungen (Konto gegen gesättigte
  Zielgruppe). Dafür braucht es Frequenz und einen Test mit gleicher Zielgruppe in zwei Konten.

## Was man messen müsste

1. **Diagnose-Abfrage Werbeausgaben** (offene Aufgabe 24.11.): je Konto, Kampagne, Tag: Ausgaben, Impressionen, Klicks,
   Meta-Leads, CPL; dazu je Pool die abrechenbaren Leads je Tag. Dann: CPL je Tag gegen Ausgaben je Tag je Pool (Privatschutz,
   PKV, Tier), Steigung als „CPL-Zuwachs je 10 € Tagesbudget“ mit Spanne.
2. **Frequenz und Reichweite** je Kampagne und Tag mit speichern (Meta-Insights `reach`, `frequency`). Das ist der
   eigentliche Prüfstein für das Red-Team-Argument: Steigt der CPL, während die Frequenz steigt und die Reichweite stagniert,
   ist es Sättigung, nicht das Konto.
3. **Budget-Snapshot** je Kampagne täglich (Media-Buyer-Plan Stufe 2), damit Erhöhungen datiert sind (Vorher 7 Tage gegen
   Nachher 7 Tage, nach Ende der Lernphase).
4. **Kontotest (der eigentliche Beweis):** dieselbe Kampagne (Motiv, Formular, Zielgruppe) mit gleichem Tagesbudget
   gleichzeitig in unserem Konto und in einem Kundenkonto, Gebiete getrennt (z. B. PLZ-Hälften), 14 Tage, mindestens
   50 Leads je Seite. Danach beide Seiten verdoppeln. Hält der Kundenkonto-CPL bei Verdopplung, während unserer steigt, ist
   die Annahme gestützt. Steigen beide gleich, ist es Sättigung (Red Team).
   Vorsicht: Bei 20 € CPL heißt das rund 1.000 € je Seite, insgesamt über 500 €, also Freigabe Ole (A), oder im laufenden
   Budget eines Pilotkunden (B).

## Risiko, Kosten

- Risiko ohne Messung: Der Pilot wird mit einer Annahme verkauft, deren Gegenteil (Sättigung) ihn unwirtschaftlich macht:
  Ab echtem CPL 26,47 € verdienen wir nichts (CFO).
- Kosten: Abfrage rund 0,5 bis 1 Tag CTO, Auswertung 1 Tag Data/BI; Kontotest siehe oben.
