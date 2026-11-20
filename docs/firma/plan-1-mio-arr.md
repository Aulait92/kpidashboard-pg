# Plan: 1 Mio. € ARR (Entwurf, 19.11.2026)

Auftrag von Ole: „Wie kommen wir mit unserer Software schnellstmöglich auf 1 Mio. € ARR? Seid kreativ.“
Beiträge: CFO, Head of Sales, CMO, CPO, Partnerships, Customer Success, Strategischer Investor. Danach Prüfung durch das
Red Team („tragfähig mit Änderungen“); die Änderungen sind eingearbeitet (Abschnitt 8).
Status: **Entwurf, nichts beschlossen.** Alle Punkte unter „Entscheidungen“ sind Stufe A. Vorlage für die Führungsrunde 23.11.

**Datenlage:** Die Diagnose-Schnittstelle war für das Team gesperrt. Kundenzahl, MRR, Churn und CAC sind unbekannt.
Alle Zahlen sind Rechnungen aus der Preisliste (`src/lib/offer-pricing.ts`) mit Annahmen. Erste Aufgabe ist deshalb,
sie gegen echte Werte zu prüfen.

## 1. Die Rechnung (netto)

1 Mio. € ARR = 83.333 € MRR. Gezählt wird nur Wiederkehrendes, **netto nach geschenkten Monaten (Vorauszahlung) und
laufenden Garantiefällen**, Software, Betreuung und Module getrennt, Pay-per-Lead getrennt. Einrichtung zählt nicht.

| Weg | ARPA im Monat | Kunden nötig |
|---|---|---|
| Einzelvermittler wie heute (990 / 1.390 / 1.790 €) | ~1.050 € | ~80 |
| Einzelvermittler mit Ausbau (2. Produkt +350 €, Verkäufer 49 €) | ~1.400 € | ~60 |
| **Agentur-Lizenz** (Großagentur oder Maklerbüro, 5 bis 50 Berater) | ~2.900–4.000 € | ~21–28 |

Wichtig:
- Jahresvorauszahlung (3 Monate geschenkt) senkt den ARR je Jahreszahler um 25 %. Bei 60 % Jahreszahlern braucht es
  8 bis 10 Kunden mehr.
- Garantien (Break-even, Vertrag, Lead) können bis zu 6 Monate Betreuung kosten. Gebucht ist nicht kassiert.
- Nur 349 € von 990 € sind Software, der Rest ist Betreuung. Investoren bewerten das eher wie Agenturumsatz.

**Zielbild:** 30 Einzelkunden × 1.300 € + 18 Agenturen × 2.500 € ≈ 84.000 € MRR.

| Churn je Monat | Neue Einzelkunden brutto/Monat | Neue Agenturen/Monat | Zeit bis Ziel |
|---|---|---|---|
| 2 % | 3 bis 4 | 1,5 | ~12 bis 15 Monate (Ende 2027) |
| 4 % | 5 | 2 | ~18 Monate |
| 6 % | 6 bis 7 | 2 bis 3 | 24 Monate und mehr |

Ehrliche Spanne: **15 bis 30 Monate.** Ende 2027 klappt nur bei niedrigem Churn und funktionierendem Agentur-Kanal.

## 2. Die Engpässe: Kapazität vor Nachfrage

1. **WhatsApp:** Bis zur Meta-Freigabe als Tech Provider gibt es höchstens einen freien Platz.
2. **Beweis:** Der Assistent läuft bei keinem zahlenden Kunden. Es gibt keine Fallstudie.
3. **Lieferung:** 80 Kunden mit 4 bis 6 Stunden Betreuung im Monat sind 320 bis 540 Stunden, also 2 bis 3 Vollzeitkräfte.
4. **Ole:** Er ist heute Setter, Closer, Betreuer und Partnerverkäufer zugleich.

Grundsatz: **Wir verkaufen nur so viel, wie wir live bringen und betreuen können.** Ole macht Closing und Meta-Freigabe,
alles andere wird abgegeben oder gestoppt. Bezahlte Kanäle starten erst nach Freigabe und 3 sauberen Livegängen.

## 3. Die Hauptwette: Großagenturen und Maklerbüros mit 5 bis 50 Beratern

Vier Rollen schlugen unabhängig vor, an Bündler statt an Einzelkämpfer zu verkaufen. Das Red Team hat die Zielgruppe
geschärft: **Großagenturen und Maklerbüros statt Konzern-Bezirke.**

- Ein Entscheider, keine Konzern-Compliance. Makler dürfen Postfach und Kalender verbinden.
- Zyklus Wochen statt 6 bis 12 Monate. ARPA 2.900 bis 4.000 €. Rund 20 bis 25 Agenturen tragen den Großteil des Ziels.
- Angebot: **Agentur-Lizenz** (Vorschlag CFO: 1.790 € + 59 € je aktivem Verkäufer, 12 Monate, Zahlung per Überweisung).
- Was Agenturen fehlt und was sie kaufen: **Zahlen je Berater** (Leads, Termine, Abschlüsse je Person, faire Verteilung).
  Das ist die **eine Produkt-Ausnahme** vom Feature-Stopp.
- Maklerpools (Fonds Finanz, Jung DMS, blau direkt) früh als **Webinar-Bühne** nutzen, nicht als Integration.

**Bezirks- und Filialdirektionen (Signal Iduna)** laufen als **Empfehlungskanal**: Ein Direktor empfiehlt uns seinen
Vertretern, die Vertreter zahlen selbst. Kein Konzernvertrag, kein Klumpenrisiko, nicht im ARR-Ziel eingerechnet.
Ein Pilot mit 5 freiwilligen Vertretern und echten Zahlen auf der Vertreterversammlung bleibt die kreativste
Abkürzung (Sales), aber erst nach 3 Livegängen.

**Allianz** bleibt zurückgestellt, bis 3 Allianz-Kunden ohne Postfach und Kalender live sind.

## 4. Fahrplan

### Phase 0: Fundament (bis KW 49, im Feature-Stopp)
| Reihenfolge | Was | Wer |
|---|---|---|
| 1 | Umsatzsteuer: Betrag, Frist, Rücklage (vor jeder weiteren Vorauszahlung) | Ole, CFO, Steuerberater |
| 2 | Datenzugang fürs Team (Diagnose, Lesekopie); Kanal, Kosten und Betreuungszeit je Kunde ab sofort erfassen | Ole, Data |
| 3 | Die 7 offenen Vermittler abschließen (Fr 20.11., Mo 23.11.) | Sales, Ole |
| 4 | Meta-Freigabe als Tech Provider mit höchster Priorität | Ole, CTO |
| 5 | 3 Kunden mit Assistent sauber live, als Fallstudie vereinbart (Einwilligung, kein Rabatt) | CS, CTO |
| 6 | Abschluss im Call: Brücke Präsentation → Angebot, „Entscheidungs-Call“ auf der Angebotsseite aus, Stripe-Fehler | CTO |
| 7 | Kapazitätsplan: Stunden je Kunde, ab wann die erste Betreuungskraft nötig ist | CFO, CS |

### Phase 1: Agentur-Maschine (Dez 2026 bis Feb 2027)
| Was | Erwartung (Annahme) |
|---|---|
| Preisblatt Agentur-Lizenz, Muster-Angebot, Zahlen je Berater bauen | Grundlage der Hauptwette |
| Die 20 größten Agenturen und Maklerbüros im CRM, persönliche Ansprache durch Ole | 1 bis 2 Agenturen im Monat ab Januar |
| Erste Betreuungskraft einstellen (vor dem Setter), sobald der Kapazitätsplan es zeigt | Lieferung trägt das Wachstum |
| Kalt-Mail mit korrigierten Texten, **Schwerpunkt Makler**; Signal Iduna nur außerhalb möglicher Pilot-Direktionen; Erschöpfung der Listen einplanen | 3 bis 6 Abschlüsse/Monat |
| Livegang in 5 Tagen statt 14 (Pflicht: Meta, WhatsApp, Kalender, Erstinformation; Rest danach) | weniger Churn in Monat 2 bis 4 |
| Gesundheitswert je Kunde (Logins, Leads mit Ergebnis, Termine, NPS), bei Rot Anruf in 48 h; Garantiefall-Quote als Pflicht-KPI | Churn unter 2 %, NRR über 110 % |
| 1 bis 2 Webinare bei Maklerpools | Termine mit Agenturen |

### Phase 2: Ausbau (März bis Juni 2027)
| Was | Erwartung (Annahme) |
|---|---|
| Setter (Provision erst nach 90 bezahlten Tagen, mit Rückforderung; Scheinselbstständigkeit prüfen) | Ole nur noch Closer |
| Eigene Meta-Kampagne für Vermittler („Wir machen für uns, was wir für dich machen“), 1.000 bis 1.500 €/Monat, Abbruch bei > 300 € je qualifiziertem Termin | 5 bis 15 Termine/Monat |
| Lead-Magnet „Wie viele Abschlüsse verschenkst du?“ auf Basis von /rechner | hebt die Quote aller Kanäle |
| Kollegen-Empfehlung im Erfolgsmoment (nach 1. und 5. Abschluss, nach NPS 9 bis 10) | CAC nahe null |
| Upsell-Auslöser: „Break-even erreicht“, 2. Sparte, mehr Budget, Jahresvertrag im Erfolgsmoment | NRR über 110 % |
| Pay-per-Lead-Abnehmer zur Software führen (Lead-Ausgaben anrechnen) | Software-Anteil am ARR steigt |
| Bezirks-Empfehlungskanal Signal Iduna (Pilot mit 5 Vertretern) | Einzelkunden in Gruppen |

## 5. Wilde Ideen (Ideenspeicher, nach Phase 2 oder nach 1 Mio.)
1. **Bezirks-Pilot mit Bühne** (Sales): echte Zahlen auf der Vertreterversammlung, Abschlüsse vor Ort. In Phase 2 eingeplant.
2. **Der Versicherer zahlt** (CFO, CMO, Partnerships, Investor): Direktion bezahlt Software als Vertriebsförderung. Erst mit Beweis und Sicherheitspaket.
3. **Agenturstart-Booster** (Partnerships): jede neue Agentur eines Versicherers startet mit uns, halb vom Versicherer bezahlt.
4. **Club der 100 Abschlüsse** (Customer Success): Leistungsclub und Beirat, jedes Mitglied bringt zwei Kollegen mit.
5. **Lead-Weitergabe unter Kollegen** (CPO, Investor): jede Weitergabe ist eine Einladung, der einzige Netzwerkeffekt im Modell. Nur nach Prüfung durch Recht und Datenschutz.

## 6. Bewusst nicht (Stopp-Liste)
- Kein Self-Serve-Abo und kein „kleines Paket ohne Sales-Call“ vor 1 Mio. €.
- Keine Expansion (Österreich, Schweiz, Immobilienmakler, Finanzberater), kein Zukauf.
- Keine neuen Policen-Sparten, keine Tarif-Schnittstellen, kein App Store.
- Bestandskunden-Modul bleibt aus, bis der Livegang trägt.
- Keine neuen Preisvarianten außer Agentur-Lizenz.
- LinkedIn und Gruppen-Demos durch Ole erst, wenn Betreuung und Setter ihn entlasten.

## 7. Offene Konflikte
- **Software ohne Betreuung:** Investor will einen Tarif für PPL-Abnehmer und Agenturen (bessere ARR-Qualität,
  weniger Abhängigkeit von Meta). CFO und Sales lehnen Self-Serve für die Masse ab. Vorschlag: nur als Agentur- und
  PPL-Tarif, nicht öffentlich, Entscheidung mit dem Preisblatt.
- **Vorauszahlungsrabatt:** kostet 25 % ARR, bringt Kasse. CFO: beibehalten, bis die USt-Rücklage steht, dann im
  Monats-Board prüfen.
- **Kalt-Mail-Risiko:** E-Mail-Werbung ohne Einwilligung ist auch unter Unternehmen nach UWG unzulässig. Ole hat das
  Risiko am 19.11. bewusst akzeptiert; neu ist, dass Kalt-Mail an Konzernvertreter spätere Gespräche mit deren
  Direktion belasten kann. Darum Schwerpunkt Makler.

## 8. Was das Red Team geändert hat
- Hauptwette von Konzern-Bezirken auf Großagenturen und Maklerbüros verlegt; Bezirke als Empfehlungskanal ohne ARR-Ansatz.
- Allianz zurückgestellt, bis der Livegang ohne Postfach und Kalender belegt ist.
- ARR netto (Freimonate, Garantien), Churn-Szenarien statt einer Zahl, NRR-Ziel 110 % wie im README.
- Phase 0 beginnt mit Umsatzsteuer und Datenzugang; Betreuungskraft vor Setter; Setter-Provision mit Rückforderung.
- Gestrichen bzw. in den Ideenspeicher: kleines Paket ohne Call, Club, Booster, Lead-Weitergabe, Ole-LinkedIn vorerst.

## 9. Entscheidungen für Ole (Stufe A)
1. **Hauptwette Agentur-Lizenz** für Großagenturen und Maklerbüros, Preisblatt vom CFO bis zur Führungsrunde.
2. **„Zahlen je Berater“** als einzige Produkt-Ausnahme vom Feature-Stopp, plus die drei Abschluss-Punkte.
3. **Kapazität vor Nachfrage:** bezahlte Kanäle erst nach Meta-Freigabe und 3 Livegängen; erste Betreuungskraft vor dem Setter.
4. **Umsatzsteuer und Datenzugang** diese Woche klären.
5. **Kalt-Mail:** Schwerpunkt Makler, Texte freigeben, Starttermin.
6. **ARR-Definition** fürs Board: netto, getrennt nach Software, Betreuung, Modulen; PPL getrennt.
7. **Meta-Freigabe als Tech Provider** ist Priorität 1.

## 10. Erste Woche (bis 27.11.)
- Fr 20.11. und Mo 23.11.: 7 offene Vermittler anrufen (Entwürfe beim Head of Sales).
- Ole: Steuerberater (USt), Datenzugang fürs Team freigeben.
- Mo 23.11. Führungsrunde: dieser Plan, Entscheidungen 1 bis 7.
- CFO: Preisblatt Agentur-Lizenz und Kapazitätsplan. Sales: 20 größte Agenturen und Maklerbüros markieren.
- CS: Liste laufender Onboardings mit Blocker. Data: Quoten nachrechnen, sobald der Zugang da ist.
