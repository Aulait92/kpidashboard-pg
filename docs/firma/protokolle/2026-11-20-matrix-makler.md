# Prüfung Wirtschaftlichkeits-Matrix für Makler (20.11.2026)

Auftrag Ole: Matrix (Bestandskunden vs. Mitarbeiter, Fassung 1 mit 20,80 €/Kunde/Monat, Fassung 2 mit 11 €) auf Wahrheitsgehalt für Makler prüfen. Team: CFO, Kunden-Personas, Red Team. Ergebnis-Präsentation: 2026-11-20-matrix-makler.pdf.

Empfehlung: In keiner Fassung an Makler zeigen. Intern korrigierte Matrix (CFO, 11 € je Kunde, mit Kosten und Zeitprüfung); für Makler Rechner mit eigenen Zahlen (Stufe A).

## CFO
# CFO-Prüfung: Wirtschaftlichkeits-Matrix (Bestandskunden vs. Mitarbeiter)

Stand 20.11.2026. Prüfer: CFO-Agent. Grundlage: zwei Bilder der Matrix (Fassung 1: 20,80 €/Kunde/Monat, Fassung 2: 11 €/Kunde/Monat),
Repo `kpidashboard-pg` (das PDF unter `assets/unterlagen/wirtschaftlichkeits-matrix.pdf` ist **Fassung 1**; im Admin unter
Marketing → Unterlagen mit dem Text „Bestandskunden gegen Mitarbeiter: ab wann sich das Paket rechnet“), Websuche.
Einschränkung: Die Fachportale (versicherungsbote.de, dasinvestment.com) waren in dieser Sitzung nicht abrufbar; Zahlen daraus
stammen aus Suchtreffern (Snippets), nicht aus dem Volltext. Studien (BVK, AfW) sind nicht repräsentativ. Deshalb Bandbreiten.

## 1. Entscheidung zuerst

**Empfehlung:** Fassung 1 (20,80 €) nicht mehr verwenden. Fassung 2 (11 €) ist als vorsichtiger Wert für die *laufende
Bestandscourtage* haltbar, aber die Matrix muss (a) die Frage klar benennen, (b) die Annahmen offen zeigen und (c) eine
zweite Prüfung „Zeit für Leads“ bekommen. Korrigierte Matrix unten (Abschnitt 6).

- **Begründung:** 11 €/Kunde/Monat (rund 130 €/Jahr) passt zu Courtagesätzen im Privatkundengeschäft und zu Umsatz je
  Vollzeitkraft aus der BVK-Strukturanalyse; 20,80 € (rund 250 €/Jahr) ist nur mit Neugeschäft oder gewerbelastigem Bestand
  erreichbar und überzeichnet die Tragfähigkeit um etwa Faktor 2. Fassung 1 stuft dadurch u. a. „1 Mitarbeiter, 1.000 Kunden“
  als „Ja (solide tragbar)“ ein, nach vorsichtiger Rechnung ist das „Nein bis Grenzwertig“.
- **Risiko:** Falsche Einstufung führt zu Kunden, die das Paket (rund 1.500 bis 1.850 € netto/Monat) nicht durchhalten:
  Kündigung nach 2 bis 3 Monaten, offene Forderungen, Churn. Außerdem: Wird die Matrix Kunden gezeigt, wirkt „Definitiv“ wie
  ein Ergebnisversprechen.
- **Kosten:** keine (Unterlage tauschen).
- **Stufe:** B, solange die Matrix nur intern zur Qualifizierung im Vertrieb dient. Stufe A (Ole), falls sie als Unterlage an
  Kunden geht.

## 2. Welche Frage beantwortet die Matrix überhaupt?

Die Matrix vermischt drei verschiedene Fragen:

1. **Tragfähigkeit:** Bleibt nach Kosten des Büros, Gehältern und Inhaber-Lohn genug übrig, um das Paket ein paar Monate
   vorzufinanzieren, bevor die ersten Courtagen aus den Leads fließen? (Das ist die Frage „ab wann rechnet sich das Paket“.)
2. **Bedarf:** Braucht der Makler Entlastung? (Zelle „0 Mitarbeiter, 2.500+ Kunden: Definitiv, braucht dringend Entlastung“.)
3. **Kapazität:** Hat der Betrieb Zeit, rund 40 Leads im Monat (1.500 € / 35 € je Lead) zeitnah zu bearbeiten?

Frage 2 und 3 laufen gegen Frage 1: Der Solo-Makler mit 2.500 Kunden hat Geld, aber keine Zeit für Leads. Für ihn passt eher
Bestandsmodul/Automatisierung als ein großes Leadpaket. „Definitiv“ ist dort für Leads falsch.

Außerdem misst die Matrix nur den **Bestand**. Ob sich das Paket *rechnet*, entscheidet am Ende der Lead-ROI (Abschlussquote ×
Courtage je Abschluss gegen Paketpreis). Der Bestand sagt nur, ob der Makler die Anlaufzeit und die Stornohaftung
durchhält. Die Matrix ist also ein **Liquiditäts- und Kapazitätsfilter**, kein Rentabilitätsnachweis. So sollte sie heißen.

## 3. Was bedeutet „ca. X €/Monat“ realistisch?

Gemeint sein kann nur die laufende Bestandscourtage (ohne Neugeschäft). Herleitung je Privatkunde und Jahr:

| Sparte | Typischer Beitrag | Laufende Vergütung | € je Vertrag/Jahr | Wie viele Kunden haben das |
|---|---|---|---|---|
| Sach/Komposit privat (Haftpflicht, Hausrat, Wohngebäude, Unfall, Rechtsschutz) | 100 bis 600 € je Vertrag | 15 bis 20 % der Nettoprämie (Quelle 4) | 15 bis 120 € | fast alle, 1,5 bis 3 Verträge |
| Kfz | 300 bis 800 € | deutlich niedriger, grob 3 bis 8 % (Schätzung, keine Quelle gefunden) | 10 bis 60 € | gut die Hälfte |
| Leben/Altersvorsorge | 600 bis 1.800 € | Bestandsprovision 1 bis 2 % der Jahresprämie (Quelle 4, Beenken) | 6 bis 36 € | ein Teil |
| PKV (Voll) | 4.000 bis 8.000 € | Bestandsvergütung grob 0 bis 3 % (unsicher; bis 4 % genannt, Quelle 4) | 0 bis 240 € | wenige Prozent |

Ergebnis je Privatkunde: **rund 80 bis 200 € pro Jahr = 7 bis 17 €/Monat** laufende Courtage, Mittelwert um 10 bis 13 €.
Rechnet man das typische Neugeschäft (Abschlusscourtagen) dazu, ergibt sich ein **Gesamtumsatz je Kunde von etwa 12 bis
30 €/Monat**. Gewerbekunden liegen deutlich höher (AfW: Gewerbe 27 % des Versicherungsumsatzes der Makler, Quelle 1).

Gegenprobe mit Branchenzahlen:
- BVK-Strukturanalyse (Geschäftsjahr 2022): Umsatz je fiktiver Vollzeitkraft rund 96.700 €/Jahr = rund 8.050 €/Monat (Quelle 2).
  Bei 11 €/Kunde entspricht das rund 730 Kunden je Vollzeitkraft, bei 20,80 € nur rund 390. 700 bis 1.000 Privatkunden je
  Kopf ist für Maklerbüros plausibel; 390 wirkt zu wenig. Das spricht für die Größenordnung von Fassung 2.
- AfW-Vermittlerbarometer (Ausgabe unklar): Umsatz rund 243.000 €, Gewinn rund 79.000 € je Makler (Quelle 1). Ohne
  Kundenzahl nicht je Kunde umrechenbar.
- BVK: Makler im Schnitt 1.105 Kunden (2022/23) bzw. fast 3.900 (2025, verzerrt durch wenige Großbüros); bei Maklern dominieren
  Bestände von 250 bis 500 Kunden (Quelle 2). Für die Zielgruppe von performancegrowth liegen also die linken Spalten am
  häufigsten.
- Bestandsverkauf: Kaufpreise rund 1,2 bis 1,8 Jahrescourtagen (Quelle 3). Die Bestandscourtage ist also das „sichere“
  Geld, auf das Käufer zahlen, und genau sie gehört in eine vorsichtige Matrix.

**Urteil:** 11 € ist der realistischere Wert für den Bestand (vorsichtiger bis mittlerer Fall). 20,80 € ist ein guter Fall
(gewerbelastig oder inklusive Neugeschäft) und als Planwert für die Einstufung zu hoch.

## 4. Was kostet ein Vollzeit-Mitarbeiter im Innendienst?

| Baustein | Bandbreite | Quelle |
|---|---|---|
| Bruttogehalt Innendienst (Kaufmann/-frau Versicherungen) | 3.300 bis 4.400 €/Monat (rund 40.000 bis 53.000 €/Jahr) | Quelle 5 (StepStone Düsseldorf 36.100 bis 52.800 €, typisch 44.700 €; studyflix, mystipendium) |
| AG-Anteil Sozialversicherung 2026 | rund 21 % | Quelle 6 |
| Umlagen U1/U2, Insolvenzgeld, Berufsgenossenschaft | rund 2 bis 3 % | Quelle 6, Schätzung BG |
| Arbeitsplatz (Büroanteil, Hardware, MVP-Lizenz, Telefon, Weiterbildung) | 300 bis 600 €/Monat | Schätzung |
| **Summe je Vollzeitkraft** | **rund 4.400 bis 6.200 €/Monat, Mittel 5.200 €** | |

Hinweis: Fassung 1 nennt für 250 Kunden „ca. 5.200 €/Monat“. Das entspricht etwa den Kosten **einer** Vollzeitkraft, nicht
dem Umsatz von 250 Privatkunden.

## 5. Weitere Fixkosten eines Maklerbetriebs (ohne Personal)

| Posten | Bandbreite je Monat | Hinweis |
|---|---|---|
| Büro (Miete, Nebenkosten) | 0 (Homeoffice) bis 1.500 € | Solo oft Homeoffice |
| Maklerverwaltungsprogramm, Vergleichsrechner | 0 (über Pool) bis 400 € | keine belastbare Preisquelle gefunden |
| Vermögensschadenhaftpflicht | rund 40 bis 150 € | Schätzung, gesetzliche Pflicht |
| IHK, Verband (AfW/BVK), Weiterbildung (15 h IDD) | rund 50 bis 120 € | Schätzung |
| Steuerberater, Buchhaltung | 150 bis 500 € | Schätzung |
| Auto, Telefon, Marketing, Sonstiges | 300 bis 800 € | Schätzung |
| **Summe** | **rund 800 bis 3.000 €, angesetzt 1.200 € + 150 € je Mitarbeiter** | |

Dazu kommt der **kalkulatorische Inhaber-Lohn**: angesetzt 5.000 €/Monat (AfW-Gewinn rund 79.000 €/Jahr = 6.600 €/Monat vor
Steuern; vorsichtig darunter, weil ein Makler das Paket nicht aus seinem Lebensunterhalt zahlen soll).

## 6. Korrigierte Matrix

### Formel

    Freier Betrag F = Kunden × u − (1.200 € + 150 € × MA) − MA × 5.200 € − 5.000 € Inhaber-Lohn

    u   = laufende Bestandscourtage je Kunde und Monat: vorsichtig 8 €, Mitte 11 €, gut 15 €
    Paket = rund 1.850 €/Monat (Startpaket 1.500 € Leads + Software bis 349 €)

    Nein         F < 0             (Bestand trägt Büro, Team und Inhaber nicht)
    Grenzwertig  0 ≤ F < 1.850 €   (Paket nur mit laufendem Neugeschäft oder Rücklagen)
    Ja           1.850 bis 5.550 € (Paket aus dem Überschuss vorfinanzierbar)
    Definitiv    F ≥ 5.550 €       (mindestens drei Monate Paket aus dem Überschuss)

    Zeitprüfung: Kunden je Kopf (Inhaber + MA) über rund 1.200 → „Zeit knapp“: erst Entlastung, Leads nur klein starten.

### Ergebnis (Mitte u = 11 €; in Klammern F in Tsd. € bei u = 8 / 11 / 15)

| Mitarbeiter (Vollzeit) | 250 Kunden (2.750 €) | 500 Kunden (5.500 €) | 1.000 Kunden (11.000 €) | 1.500 Kunden (16.500 €) | 2.500 Kunden (27.500 €) | 4.000+ Kunden (44.000 €) |
|---|---|---|---|---|---|---|
| 0 (Solo) | Nein (−4 / −4 / −3) | Nein bis Grenzwertig (−2 / −1 / +1) | Grenzwertig bis Ja (+2 / +5 / +9) | Ja, Zeit knapp (+6 / +10 / +16) | Geld ja, Zeit nein: erst Entlastung (+14 / +21 / +31) | Geld ja, Zeit nein (+26 / +38 / +54) |
| 1 | Nein | Nein | Nein bis Grenzwertig (−4 / −1 / +4) | Grenzwertig bis Ja (+1 / +5 / +11) | Definitiv, Zeit knapp (+8 / +16 / +26) | Definitiv, Zeit nein (+20 / +33 / +49) |
| 2 | Nein (kommt kaum vor) | Nein | Nein (−9 / −6 / −2) | Grenzwertig (−5 / 0 / +6) | Ja (+3 / +11 / +21) | Definitiv (+15 / +27 / +43) |
| 3–4 | Nein (kommt kaum vor) | Nein (kommt kaum vor) | Nein | Nein (−13 / −8 / −2) | Grenzwertig (−5 / +3 / +13) | Ja bis Definitiv (+7 / +19 / +35) |
| 5+ | Nein (kommt kaum vor) | Nein (kommt kaum vor) | Nein (kommt kaum vor) | Nein | Nein bis Grenzwertig (−13 / −6 / +5) | Grenzwertig bis Ja (−1 / +11 / +27) |

Lesart: Betriebe in „Nein“-Zellen gibt es trotzdem; sie leben dann vom laufenden Neugeschäft, nicht vom Bestand. Für sie ist
ein großes Leadpaket ein Liquiditätsrisiko, ein kleiner Einstieg (Pay-per-Lead, kleinere Menge) eher passend.

### Abgleich mit den beiden Fassungen

| Zelle | Fassung 1 (20,80 €) | Fassung 2 (11 €) | CFO-Korrektur |
|---|---|---|---|
| Solo, 500 | Grenzwertig | (Spalte: Nein) | Nein bis Grenzwertig |
| Solo, 1.000 | Ja (hoher Überschuss) | Grenzwertig | Grenzwertig bis Ja |
| Solo, 2.500+ | Definitiv (braucht Entlastung) | Definitiv | Geld ja, **Zeit nein**: nicht Leads zuerst |
| 1 MA, 1.000 | Ja (solide tragbar) | Nein | Nein bis Grenzwertig |
| 1 MA, 1.500 | Ja (sehr komfortabel) | Grenzwertig | Grenzwertig bis Ja |
| 2 MA, 1.000 | Grenzwertig | Nein | Nein |
| 2 MA, 1.500 | Ja (gut kalkulierbar) | Nein | Grenzwertig |
| 2 MA, 2.500 | Definitiv | Grenzwertig | Ja |
| 3–4 MA, 1.500 | Grenzwertig | Nein | Nein |
| 3–4 MA, 4.000 | (Ja bei 2.500+) | Grenzwertig | Ja bis Definitiv |
| 5+ MA, 2.500+ | Grenzwertig bis Ja („ab 3.000“) | (Zeile fehlt) | 2.500: Nein bis Grenzwertig; 4.000: Grenzwertig bis Ja |

Fazit: Fassung 1 ist in der Mitte der Matrix durchgehend eine Stufe zu optimistisch. Fassung 2 liegt nah an der vorsichtigen
Rechnung, ist bei großen Beständen mit Team eher eine Stufe zu streng (das ist für den Vertrieb unkritisch) und es fehlt die
Zeitprüfung beim Solo-Makler.

## 7. Was in der Unterlage stehen sollte

1. Titel als Frage: „Trägt Ihr Bestand den Start mit Leads?“ statt „Wirtschaftlichkeit“.
2. Kopfzeile ehrlich beschriften: „laufende Bestandscourtage, Annahme rund 11 € je Privatkunde und Monat (8 bis 15 €)“.
3. Fußnote mit Formel und Kostenannahmen (Mitarbeiter rund 5.200 €, Fixkosten, Inhaber-Lohn).
4. Zeitprüfung als zweite Achse oder Symbol („Zeit knapp“).
5. Statt Kundenzahl besser die **eigene Jahrescourtage** des Maklers abfragen (steht in jedem MVP/Pool-Report): Das ersetzt die
   unsichere 11-€-Annahme durch seine echte Zahl.
6. Keine „Definitiv“-Sprache gegenüber Kunden (Ergebnisversprechen), intern ok. Ohne Emojis in Unterlagen an Kunden.
7. Das PDF im Repo (`assets/unterlagen/wirtschaftlichkeits-matrix.pdf`) ist Fassung 1 und sollte ersetzt werden (nicht in
   dieser Prüfung geändert).

Offen (nicht Teil dieser Prüfung): Lead-ROI je Produkt (Privatschutz 35 €, Kindersparplan 65 €) aus echten Abschlussquoten
und Courtagen der Kunden; erst damit lässt sich sagen, ob sich das Paket *rechnet* und nicht nur *tragen lässt*.

## Quellen

1. AfW-Vermittlerbarometer (Berichte): https://www.cash-online.de/a/afw-gewerbegeschaeft-gewinnt-fuer-makler-deutlich-an-gewicht-722940/ ;
   https://www.dasinvestment.com/afw-vermittlerbarometer-verdienst-gewinn-bundesverband/ (Umsatz rund 243.000 €, Gewinn rund 79.000 €, Ausgabe unklar);
   https://www.cash-online.de/a/afw-vermittlerzahlen-sinken-maklermodell-trotzt-dem-trend-699884/
2. BVK-Strukturanalyse: https://www.versicherungsbote.de/id/4946160/BVK-Strukturanalyse-zeigt-durchschnittliche-Kundenzahl-von-Versicherungsvermittlern/ ;
   https://www.versicherungsbote.de/id/4912404/Was-Versicherungsmakler-2022-an-Gewinn-erzielen-konnten/ (Umsatz 510.067 €, 96.673 € je fiktiver Vollzeitkraft, GJ 2022, nicht repräsentativ);
   https://www.versicherungsbote.de/id/4911954/Einfirmenvertreter-betreuen-im-Durchschnitt-mehr-Kunden-als-Versicherungsmakler/ (Makler 1.105 Kunden)
3. Bestandsverkauf/Bestandswert: https://www.versicherungsbote.de/id/4872464/chapter/1/Studie-Bestandsverkauf-Versicherungsmakler/ (1,8 Jahrescourtagen Sach ohne Kfz, 1,2 Kfz);
   https://www.iww.de/sr/archiv/bewertung-im-rahmen-der-unternehmensnachfolge-kein-simples-thema-die-bewertung-der-bestaende-von-versicherungsmaklern-f127446
4. Courtage- und Bestandsprovisionssätze: https://www.versicherungsbote.de/id/4823616/Versicherungsmakler-Verguetung-Interview-Matthias-Beenken/ ;
   https://www.versicherungsbote.de/id/4805881/Bestandsprovision-moneymeets-versicherung/ ;
   https://www.versicherungsbote.de/id/4904001/Bestand-versus-Neugeschaft---uber-ein-ewiges-Missverstandnis-zwischen-Maklern-und-Versicherern/ ;
   https://cdn.makleraccess.de/wp-content/uploads/sites/1288/2023/07/aufgaben-und-verguetung-eines-versicherungsmaklers.pdf
5. Gehalt Innendienst: https://www.stepstone.de/gehalt/Mitarbeiter-in-Innendienst-Versicherungen/city/Duesseldorf.html ;
   https://www.gehalt.de/beruf/innendienst-versicherungen ; https://studyflix.de/ausbildung/berufe-ausbildung/versicherungskaufmann-versicherungskauffrau-3525/gehalt ;
   https://www.mystipendium.de/berufe/kaufmann-fuer-versicherungen-und-finanzen/gehalt
6. Sozialversicherung 2026: https://www.barmer.de/firmenkunden/sozialversicherung/beitraege-rechengroessen/beitragssaetze-arbeitgeber-1057022 ;
   https://www.tk.de/firmenkunden/versicherung/beitraege-faq-und-mehr/beitragssaetze/aktuelle-beitragssaetze-in-der-sozialversicherung-2031554 ;
   https://www.lexware.de/wissen/mitarbeiter-gehalt/sozialversicherung/
7. Kapazität Innendienst (nur Anbieter- und Beispielwerte, keine Benchmark): https://www.versicherungsbote.de/id/4951094/Skalieren-ohne-einzustellen-Wie-KI-das-Kapazitaetsproblem-im-Maklerbuero-loest/ ;
   https://www.versicherungsbote.de/id/4951128/Struktur-und-Prozesse-im-Maklerunternehmen-Vom-Einzelkaempfer-zum-skalierbaren-Maklerunternehmen/
8. Repo: `docs/firma/entscheidungslog.md` (Startpaket ab 1.500 € Leadumsatz, Software 349 € netto, 35 € je Lead),
   `src/app/admin/marketing/unterlagen/unterlagen-grid.tsx`, `assets/unterlagen/wirtschaftlichkeits-matrix.pdf`.

Schätzungen ohne Quelle sind als „Schätzung“ markiert (Kfz-Courtage, Fixkosten, Kapazität je Kopf).
Rechenskript: `/tmp/claude-0/-home-user-kpidashboard-pg/f2387241-4f93-5e63-a1ab-a2b026db4c2b/scratchpad/rechne.py`.

## Kunden-Personas (simuliert)
# Persona-Test: Wirtschaftlichkeits-Matrix (Bestandskunden vs. Mitarbeiter)

Stand 20.11.2026. Kunden-Personas, simulierter Test, keine echten Makler befragt.
Geprüft: Bild 14 (Fassung 1, 250 bis 2.500+ Kunden, ca. 20,80 €/Kunde/Monat, mit Begründungen in Klammern)
und Bild 15 (Fassung 2, 500 bis 4.000+ Kunden, 11 €/Kunde/Monat, ohne Begründungen).
Kontext aus dem Repo: Makler-Paket 990 / 1.390 / 1.790 € plus Werbebudget (`docs/firma/plan-1-mio-arr.md`, Tabelle Abschnitt 2;
`docs/unterlagen/sprechzettel-vertrieb.md`, Folie 22), Hauptwette Maklerbüros mit 5 bis 50 Beratern
(`plan-1-mio-arr.md`, Abschnitt 3), Bestandskunden-Modul ausgeblendet, „bleibt aus, bis der Livegang trägt“
(`plan-1-mio-arr.md` Z. 114; `docs/unterlagen/README.md` Z. 85).

## Entscheidung zuerst

**Empfehlung: Beide Fassungen so nicht zeigen.** Ersetzen durch einen kleinen Rechner bzw. eine Folie
„Was Ihr Bestand heute trägt, und was ein Termin mehr im Monat bringt“, gerechnet mit den Zahlen des Maklers
im Gespräch (Courtage je Jahr, Kosten, Mitarbeiter), mit Spannen und offen genannten Annahmen.
Begründung: Die Matrix beantwortet keine erkennbare Frage und urteilt mit Ja/Nein/„Definitiv“ über die Wirtschaftlichkeit
eines Betriebs, den wir nicht kennen; genau das nimmt ein Makler persönlich. Zwei Fassungen mit fast halbiertem Wert je Kunde
zeigen intern selbst, dass die Grundannahme nicht steht.
Risiko: Glaubwürdigkeitsverlust im Erstgespräch, bei Maklerbüros (unsere Hauptwette) sogar Kränkung („5+ Mitarbeiter: Nein“).
Kosten: gering (Folie oder vorhandener Rechner unter „Wachstum → Rechnet sich das?“).
Stufe: B für die Folie/den Rechner (Vertriebsunterlage). Sobald Preise oder ein Bestandskunden-Modul-Preis darauf stehen: A (Ole).

## 1. Welche Frage beantwortet die Matrix? Unklar.

Kein Makler kann aus dem Bild sagen, worauf sich „Ja“ bezieht. Mögliche Lesarten:
1. „Lohnt sich performancegrowth für mich?“ (dann fehlen unser Preis und der Mehrertrag, die Zellen hängen aber nur vom Bestand ab)
2. „Trägt mein Bestand meine Mitarbeiter?“ (dann ist es eine Betriebsberatung, die wir nicht leisten, und die keiner bestellt hat)
3. „Lohnt sich das Bestandskunden-Modul?“ (das Modul ist derzeit ausgeblendet, Preis „auf Anfrage“)
4. „Brauche ich Entlastung?“ (Zelle Solo/2.500+: „Braucht dringend Entlastung“ ist ein Bedarf, keine Wirtschaftlichkeit)

Die Zeilen- und Spaltenlogik mischt also Bezahlbarkeit und Bedarf. Bei 1 Mitarbeiter, 2.500 Kunden steht „Definitiv
(Hohe Liquidität)“, bei Solo, 2.500 „Definitiv (Braucht dringend Entlastung)“: gleiches Urteil, zwei verschiedene Gründe.

## 2. Erkennen sich Makler wieder?

Teilweise. Die Achsen Bestand und Mitarbeiter sind die richtigen Gesprächsthemen, aber die Einheiten nicht:
- **Kunden statt Courtage.** Makler denken in Bestandscourtage p. a. (aus der Abrechnung von Pool oder Gesellschaften)
  und in Verträgen bzw. Verträgen je Kunde. „1.000 Kunden“ sagt ohne Mix nichts. 1.000 Kfz/Hausrat-Kunden und 1.000
  Gewerbe- oder PKV-Kunden liegen um ein Vielfaches auseinander.
- **Euro je Monat als Bestandsumsatz** ist ungewohnt; gerechnet wird im Jahr (Courtageabrechnungen, BWA, Bestandsbewertung).
- **„Mitarbeiter (Vollzeit)“** passt nicht: typisch sind Teilzeit-Innendienst, Minijob, Azubi, mitarbeitende Ehefrau,
  freie Untervermittler. Im Maklerbüro sind „Mitarbeiter“ oft Berater mit eigenem Umsatz, keine reinen Kosten.
- **Die zwei Fassungen widersprechen sich:** 1.000 Kunden ergeben einmal 20.800 €, einmal 11.000 € im Monat. Gleicher
  Makler, Solo: einmal „Ja (Hoher Überschuss)“, einmal „Grenzwertig“. Wer beide sieht, glaubt keiner.

Plausibilitätsblick (Personas-Einschätzung, keine Quelle im Repo, bitte vom Data/CFO gegenprüfen):
reine Bestandscourtage je Privatkunde und Jahr eher rund 80 bis 250 €, stark abhängig vom Mix; Fassung 1 (ca. 250 € im Jahr)
liegt am oberen Rand und wirkt für Privatkunden-Makler geschönt, Fassung 2 (132 € im Jahr) ist realistischer, aber
ebenfalls ohne Herleitung. Ein Innendienst in Vollzeit kostet den Arbeitgeber grob 3.500 bis 4.500 € im Monat.
Damit stimmt das Urteil in Fassung 2 auch nicht: Solo mit 1.000 Kunden und 11.000 € Monatsumsatz (132.000 € p. a.) ist für
die meisten Solo-Makler kein „Grenzwertig“, sondern ein gutes Einkommen. Die Matrix wirkt dadurch nicht vorsichtig, sondern falsch.

## 3. Glaubwürdig oder unseriös?

Eher unseriös, aus vier Gründen:
- **Emojis** (Kreuz, Warnschild, Haken, Rakete) wirken wie Social-Media-Infografik. Makler bekommen täglich Pool- und
  Coaching-Werbung in genau diesem Stil.
- **„Definitiv“ und Rakete** sind Verkaufsdruck; im Zusammenhang mit Ertrag liest es sich wie ein Versprechen
  (verträgt sich nicht mit „keine Zahlen versprechen“, `sprechzettel-vertrieb.md` Folie 19/21, und der Regel ohne Ergebnisversprechen).
- **Scheingenauigkeit:** „ca. 5.200 €“, „ca. 31.200 €“ sind exakt linear hochgerechnet (Kunden mal fester Wert),
  das „ca.“ ändert daran nichts. Keine Spanne, keine Quelle, kein Stand.
- **Urteile ohne Kosten:** Es gibt keine Zeile für Kosten (Gehälter, Büro, MVP, VSH, IHK, Pool-Abzug), trotzdem wird
  über „Defizitär“ und „Kaum Marge“ geurteilt. Fassung 2 streicht sogar die Begründungen, Urteil bleibt.
- Dazu: „Nein“ für 5+ Mitarbeiter fast überall widerspricht unserer eigenen Hauptwette (Maklerbüros 5 bis 50 Berater).

## 4. Annahmen, die ein Makler sofort anzweifelt

| Annahme in der Matrix | Einwand |
|---|---|
| Fester Wert je Kunde | Kunde ist nicht Vertrag; Verträge je Kunde schwanken (1,5 bis 4+). |
| Kein Spartenmix | Sach/Kfz: laufende Courtage, klein je Vertrag. Leben/BU: überwiegend Abschlusscourtage, wenig Bestand, Stornohaftung. KV: Abschluss nach Monatsbeiträgen, kleine Bestandsprovision. Gewerbe: deutlich höher. |
| Abschluss und Bestand vermischt | Matrix nennt nur „Bestand“, urteilt aber mit „Nur bei hohem Neugeschäft“. Neugeschäft ist die eigentliche Stellgröße und fehlt als Achse. |
| Brutto gleich verfügbar | Pool-Einbehalt (Courtage-Abgabe an Pool), Stornoreserve, Haftungszeit 5 Jahre bei Leben. |
| Kosten fehlen | MVP/Software, VSH, IHK, Weiterbildungspflicht (IDD 15 h), Büro, Kfz. |
| Mitarbeiter = Kosten | Berater im Maklerbüro bringen eigenen Umsatz; Innendienst entlastet und schafft Zeit für Neugeschäft. |
| Bestand ist statisch | Bestandsübertragungen, Bestandskauf, Altersnachfolge, Bestandswert (Faktor auf Jahrescourtage) fehlen. |
| Unser Angebot fehlt | Kein Preis, kein Werbebudget, kein erwarteter Mehrertrag: woran wird „lohnt sich“ gemessen? |

## 5. Persona-Stimmen (Ich-Form, wörtlich)

### Persona 1: Solo-Makler (Sach-lastig, über Pool, ca. 800 Kunden, Fundstelle: Zeile „0 (Solo-Makler)“)
1. „Woher haben Sie meine 11 Euro je Kunde? Ich bekomme meine Abrechnung vom Pool, da steht nichts von Kunden, da stehen Verträge.“
2. „Bei Ihnen steht ‚Grenzwertig‘ bei 1.000 Kunden. Ich lebe davon ganz ordentlich. Wollen Sie mir erzählen, dass mein Betrieb grenzwertig ist?“
3. „Und was genau ist ‚Ja‘? Dass ich mir Sie leisten kann? Dann schreiben Sie hin, was Sie kosten und was mir das bringt.“
4. „Die Raketen und ‚Definitiv‘ kenne ich von jedem zweiten Coaching auf LinkedIn. Das macht mich eher misstrauisch.“
5. „Mein Leben-Geschäft ist Abschlusscourtage mit fünf Jahren Haftung. Das kann man nicht einfach auf den Monat verteilen.“

### Persona 2: Makler mit 1 bis 2 Innendienstlerinnen (Mischbestand inkl. Gewerbe, ca. 1.500 Kunden, Fundstelle: Zeilen „1 Mitarbeiter“, „2 Mitarbeiter“)
1. „Meine Innendienstlerin ist Teilzeit, 25 Stunden. Wo bin ich da, bei null oder bei eins?“
2. „Bei 2 Mitarbeitern und 1.500 Kunden steht ‚Nein‘. Ich habe genau das, und es trägt. Also stimmt Ihre Tabelle nicht, und dann glaube ich den Rest auch nicht.“
3. „Ein Gewerbekunde bringt mir so viel wie zwanzig Hausratkunden. Ohne Spartenmix ist das Kaffeesatz.“
4. „Einmal 20,80, einmal 11 Euro je Kunde. Welche gilt denn jetzt? Das haben Sie doch selbst nicht im Griff.“
5. „Wenn Sie mir zeigen wollen, ob sich Ihr Produkt rechnet: Rechnen Sie mit meinen Zahlen, nicht mit einer Tabelle für alle.“

### Persona 3: Maklerbüro mit 3 bis 5 Mitarbeitern (2 Berater, 2 Innendienst, Azubi, ca. 3.000 Kunden, Fundstelle: Zeilen „3–4“ und „5+ Mitarbeiter“)
1. „Bei ‚5+ Mitarbeiter‘ steht fast überall ‚Nein‘. Sie sagen mir also, mein Büro rechnet sich nicht. Warum sollte ich dann mit Ihnen reden?“
2. „Meine Berater sind keine Kosten, die machen Umsatz. Ihre Tabelle zählt sie wie Kostenstellen.“
3. „Ich brauche Zahlen je Berater: wer schreibt wie viel Neugeschäft. Das zeigt mir die Matrix gar nicht.“
4. „Pool-Einbehalt, Stornoreserve, Bestandswert beim Verkauf: nichts davon drin. Das ist keine Wirtschaftlichkeitsrechnung, das ist eine Folie.“
5. „‚Skalierbar‘ und ‚Starkes Fundament‘ sind Wörter aus der Werbung. Mein Steuerberater würde damit nichts anfangen.“

### Kurz die Leads und der Allianz-Vertreter (Nebenbefund)
- Allianz-Vertreter: „Ich habe keine Courtage, ich habe Provision und Bestandsprovision vom Konzern. Die Tabelle ist nicht für mich.“
  Die Matrix nicht in der Vertreter-Fassung verwenden.
- Leads: nicht betroffen (Vertriebsunterlage an Vermittler).

## 6. Was drinstehen müsste, damit ein Makler glaubt und entscheidet

1. **Eine Frage als Überschrift**, z. B. „Rechnet sich ein Termin mehr pro Woche für Ihr Büro?“ Nicht „Bestandskunden vs. Mitarbeiter“.
2. **Seine eigenen Zahlen statt Rastern:** Bestandscourtage p. a. (aus der Abrechnung), Abschlusscourtage p. a., Anzahl
   Berater und Innendienst (Stunden statt Köpfe). Ausfüllen im Gespräch, 3 bis 5 Felder.
3. **Unser Teil getrennt und offen:** Paketpreis, Werbebudget, erwartete Termine je Monat als Spanne, Abschlussquote als
   seine eigene Annahme, Ergebnis „Break-even nach X bis Y Monaten“. Der bestehende Rechner unter **Wachstum → Rechnet sich das?**
   und die Makler-Folie „Mit Tarifvergleich alles zurück nach 7 Monaten“ (mit dem ehrlichen Satz „20 % ist eine Annahme“) sind das bessere Muster.
4. **Spannen und Quelle:** „132 bis 250 € Bestandscourtage je Kunde und Jahr, je nach Mix, Quelle, Stand“. Kein „ca. 31.200 €“.
5. **Spartenmix als Schalter:** Privat Sach, Leben/BU, KV, Gewerbe. Mindestens Hinweis „Kunde ≠ Vertrag“.
6. **Kosten und Abzüge sichtbar:** Pool-Einbehalt, Stornoreserve, Personalkosten je Stunde.
7. **Ton:** keine Emojis, kein „Definitiv“, keine Rakete; Ampel höchstens als neutrale Farbe mit Wort („trägt sich“, „knapp“, „trägt sich noch nicht“).
8. **Für Maklerbüros:** Blick je Berater (Neugeschäft je Berater), damit die Hauptwette nicht mit „Nein“ begrüßt wird.

Zustimmung je Test (Neben-KPI): Solo 1/5, Makler mit Innendienst 1/5, Maklerbüro 0/5 (Persona-Schätzung, „würde der Folie glauben und danach handeln“).

## 7. Gefundene Fehler vor dem Livegang (Haupt-KPI)

1. Frage der Matrix nicht erkennbar (Bezahlbarkeit, Bedarf, Modul oder Betrieb vermischt).
2. Zwei widersprüchliche Grundwerte (20,80 vs. 11 € je Kunde und Monat), ohne Quelle und Stand.
3. Urteile ohne Kostenzeile; Solo mit 132.000 € p. a. als „Grenzwertig“ unplausibel.
4. Maklerbüros (Hauptwette) überwiegend „Nein“: widerspricht `plan-1-mio-arr.md` Abschnitt 3.
5. Emojis und „Definitiv“ lesen sich als Ergebnisversprechen.
6. Bezug auf das ausgeblendete Bestandskunden-Modul möglich, Preis „auf Anfrage“, Paketfrage offen.
7. Fassung 2 ohne Begründungen: weniger nachvollziehbar als Fassung 1.
8. Achse „Vollzeit-Mitarbeiter“ passt nicht zur Realität (Teilzeit, Azubi, Berater mit Umsatz).
9. „3–4“ in der Tabelle: Bis-Strich im Zahlenbereich ok; sonst keine Gedankenstriche gefunden.

## Red Team
# Red Team: Wirtschaftlichkeits-Matrix (Bestandskunden vs. Mitarbeiter)

Stand 20.11.2026. Geprüft: Fassung 1 (images/14.png, ca. 20,80 €/Kunde/Monat) und Fassung 2 (images/15.png, 11 €/Kunde/Monat,
ohne Zeile 5+ und ohne Begründungen). Repo-Kontext: docs/rechner.md (Makler-Modus, Preise), docs/firma/kaltakquise.md
(§ 5 UWG schon einmal Befund), AGENTS.md (keine Ergebnisversprechen nach außen). Im Repo nichts geändert.

## Entscheidung zuerst

**Empfehlung: Matrix in keiner der beiden Fassungen im Vertrieb einsetzen.** Stattdessen den bestehenden Rechner
(`/rechner?typ=makler`) mit den eigenen Zahlen des Maklers nutzen, ergänzt um eine einfache Personal-/Kapazitätszeile.
Begründung: Die Matrix beantwortet keine benannte Frage, ihr Urteil kippt allein durch eine nicht gezeigte Annahme
(Faktor 1,9 zwischen den Fassungen), und sie hat keine Kostenseite. Als Verkaufsargument ist sie eine Angriffsfläche
nach § 5 UWG und bei zahlenaffinen Maklern ein Glaubwürdigkeitsrisiko.
Risiko bei Einsatz: mittel (Abmahnung, Reputationsschaden), bei Verzicht: gering. Kosten der Alternative: rund 1 Tag
(Rechner um Personalzeile ergänzen) oder 0 € (Rechner wie er ist). **Stufe A** (Verkaufsunterlage an viele Externe mit
Zahlenaussagen, rechtliche Wirkung), vorher Prüfung durch Recht.

## Die drei stärksten Einwände

### 1. Die Matrix hat keine Frage und keine Kostenseite, deshalb ist jedes „Ja/Nein“ beliebig
- Beleg: Es steht nirgends, wozu „Ja“ gesagt wird. Die Begründungen mischen zwei verschiedene Fragen: Leistbarkeit
  („Budget zu knapp“, „Defizitär“, „Hohe Liquidität“) und Bedarf („Braucht dringend Entlastung“). Kosten fehlen
  völlig: kein Gehalt, kein Unternehmerlohn, keine Sachkosten, kein Preis unseres Angebots. Unser Makler-Standard laut
  docs/rechner.md kostet rund 990 € Betreuung plus 40 €/Tag Werbung (ca. 1.200 €), zusammen grob 2.300 bis 2.600 €/Monat.
- Widerspruch in der Logik: Ein Solo-Makler mit 2.500 Kunden „braucht dringend Entlastung“ und bekommt „Definitiv“.
  Wir verkaufen aber Leads, also mehr Arbeit. Für einen überlasteten Solo-Makler ist zusätzlicher Leadfluss eher ein
  Nein (oder: erst Software/Innendienst, dann Leads).
- Was entkräften würde: Eine ausdrücklich benannte Frage (z. B. „Kann ich mir 2.500 €/Monat für Neukunden leisten?“)
  und eine sichtbare Rechnung je Zelle: Courtage minus Personal minus Sachkosten minus Unternehmerlohn = freier Betrag.

### 2. Rechen- und Konsistenzfehler: gleiches Urteil bei vierfachem Überschuss, gleicher Makler mit gegensätzlichem Urteil
Grobe Nachrechnung (Annahmen offen: Sachkosten 1.500 €/Monat, Unternehmerlohn 5.000 €/Monat, Vollkosten je
Vollzeitkraft 4.800 bis 6.300 €/Monat, siehe Branchenwerte unten):

| Zelle | Umsatz/Monat | freier Betrag (Spanne) | Urteil in der Matrix |
|---|---|---|---|
| F2 Solo, 1.000 Kunden | 11.000 € | ca. 4.500 € | Grenzwertig |
| F2 1 MA, 1.500 Kunden | 16.500 € | 3.700 bis 5.200 € | Grenzwertig |
| F1 2 MA, 1.500 Kunden | 31.200 € | 12.100 bis 15.100 € | Ja |
| F2 2 MA, 2.500 Kunden | 27.500 € | 8.400 bis 11.400 € | Grenzwertig |
| F2 3 bis 4 MA, 4.000+ Kunden | 44.000 € | 15.500 bis 20.700 € | **Grenzwertig** |
| F1 5+ MA, 2.500+ Kunden | 52.000 € | 14.000 bis 21.500 € | Grenzwertig bis Ja |

- 3 bis 4 Mitarbeiter bei 44.000 €/Monat bleiben nach Personal und Unternehmerlohn rund 15.000 bis 20.000 €. Das ist
  mehr als bei „2 MA, 31.200 €: Ja“ und das Drei- bis Vierfache von „Solo, 11.000 €: Grenzwertig“. Gleiches Etikett,
  völlig andere Lage; höherer Überschuss bekommt das schlechtere Etikett. „Grenzwertig“ ist dort nicht plausibel.
- Plausibilitätscheck Produktivität: VEMA-Betriebsvergleich 2022 nennt ca. 96.673 € Umsatz je Vollzeitstelle
  (ca. 8.050 €/Monat). 3 bis 4 MA plus Inhaber (4,5 bis 5 VZ) entsprechen damit typisch 36.000 bis 40.000 €/Monat. Wer
  44.000 € macht, liegt über dem Schnitt, also eher „Ja“.
- Zwischen den Fassungen kippt das Urteil für denselben Makler: 1.000 Kunden + 1 MA: F1 „Ja (solide tragbar)“, F2
  „Nein“. 1.500 Kunden + 2 MA: F1 „Ja“, F2 „Nein“. 2.500 Kunden + 2 MA: F1 „Definitiv“, F2 „Grenzwertig“. 1.500 Kunden
  + 3 bis 4 MA: F1 „Grenzwertig“, F2 „Nein“. Ursache ist allein der Wert je Kunde (20,80 € vs. 11 €), der im Bild nur
  als Spaltenkopf auftaucht. In Euro gerechnet sind die Schwellen beider Fassungen ungefähr gleich, das heißt: Die
  Achse „Kunden“ ist eine Scheinachse, entscheidend ist eine Annahme, die der Makler nicht sieht.
- Unmögliche Zellen: „5+ MA bei 250 Kunden (5.200 €)“ beschreibt keinen existierenden Betrieb (Personal allein
  24.000 €+). Solche Zellen füllen die Tabelle mit „Nein“ und lassen das Angebot strenger wirken, als es ist.
- Was entkräften würde: eine hinterlegte Tabellenrechnung mit festen Schwellen (z. B. „Ja ab freiem Betrag ≥ 2× Kosten
  des Pakets“), aus der beide Fassungen automatisch entstehen, und nur realistische Kombinationen.

### 3. Der Wert je Kunde ist ungesichert, die Spanne ist größer als der Unterschied zwischen „Nein“ und „Definitiv“
- Beleg: Es gibt keine belastbare Branchenzahl „Bestandscourtage je Kunde“. Ableitungen aus öffentlichen Zahlen
  streuen stark: VEMA 2022 ca. 510.000 € Umsatz je Maklerbüro; BVK-Strukturanalyse nennt je nach Jahrgang ca. 1.105
  (2022/23) bzw. ca. 3.900 Kunden (2025) je Makler. Das ergibt grob 130 bis 460 € Umsatz je Kunde und Jahr, also
  11 bis 38 €/Monat, und das ist **Gesamtumsatz inklusive Abschlusscourtage**, nicht reine Bestandscourtage.
  Reine Bestandscourtage liegt je nach Sparten-Mix deutlich darunter (Sach 10 bis 25 % des Beitrags, KFZ eher 4 bis 8 %,
  Leben/KV laufend nur wenige Prozent). Ehrliche Spanne: ca. 8 bis 25 €/Monat je Kunde, mit Ausreißern.
- Fassung 2 (11 €) liegt am unteren, Fassung 1 (20,80 €) am oberen Rand. Dieselbe Matrix sagt also je nach Laune
  „Nein“ oder „Ja“. Zudem fehlt das Neugeschäft ganz, obwohl es bei vielen Maklern einen großen Teil des Umsatzes
  ausmacht.
- Was entkräften würde: Statt Pauschalwert die echte Jahres-Bestandscourtage des Maklers (steht in jeder
  Pool-/MVP-Abrechnung) als Eingabe.

## Rechtliches (§ 5 UWG) und Reputation

- § 5 UWG schützt ausdrücklich auch „sonstige Marktteilnehmer“, also Makler als B2B-Kunden. Irreführend sind u. a.
  Angaben über wesentliche Merkmale einschließlich der Ergebnisse, die von der Inanspruchnahme zu erwarten sind
  (§ 5 Abs. 2 Nr. 1). Wird die Matrix im Verkauf so gezeigt, dass „Ja/Definitiv“ als „unser Angebot rechnet sich für
  Sie“ verstanden wird, ist das eine Ergebnisaussage auf Grundlage einer ungesicherten, nicht offengelegten Annahme.
  Zusätzlich § 5a (Vorenthalten wesentlicher Informationen: Annahmen, Kosten).
- Beweislast: grundsätzlich beim Kläger, aber sekundäre Darlegungslast des Werbenden für Tatsachen aus seiner Sphäre
  (BGH „Mondpreise“, I ZR 94/01). Wir müssten erklären können, woher 20,80 € bzw. 11 € kommen. Heute nicht möglich.
- Angriffsfläche: Kalt-Mail läuft schon mit bewusstem Abmahnrisiko (docs/firma/kaltakquise.md), ein § 5-Befund ist dort
  bereits offen. Eine Zahlen-Matrix mit Emojis in denselben Kanälen erhöht das Risiko für Mitbewerber- bzw.
  Verbandsabmahnungen. Einschätzung (intern, keine Anwaltsprüfung): geringe bis mittlere Wahrscheinlichkeit, aber
  leicht zu vermeiden. Hauseigene Regel AGENTS.md: keine Ergebnisversprechen nach außen.
- Reputation: Makler rechnen täglich mit Courtagen. Wer ihnen eine Tabelle zeigt, in der der eigene Betrieb „Nein“
  bekommt, obwohl er profitabel ist (z. B. 1 MA, 1.000 Kunden in F2), verliert den Termin. Zwei Fassungen im Umlauf
  mit gegensätzlichen Urteilen wirken unseriös. Raketen-Emojis und „Definitiv“ verstärken den Eindruck einer
  KI-generierten Verkaufsfolie.
- Interne Regeln: „3–4“ ist ein Bis-Strich (zulässig); „Garantie“ kommt nicht vor. Kein Konflikt dort.

## Bessere Alternative: ehrliche Entscheidungshilfe

1. **Eine Frage, eine Antwort:** „Wie viel können Sie monatlich in Neukunden stecken, und lohnt es sich?“
2. **Eingaben vom Makler, nicht von uns:** Jahres-Bestandscourtage (aus Pool-/MVP-Abrechnung), Neugeschäft der letzten
   12 Monate, Zahl der Vollzeitkräfte (Standard 5.500 € Vollkosten je Kraft, änderbar), Sachkosten, gewünschter
   Unternehmerlohn. Sinnvolle Standardwerte, sichtbar.
3. **Zwei Ergebnisse statt Ampel:** (a) freier Betrag pro Monat in Euro, (b) Kapazität: Kunden je Vollzeitkraft gegen
   eine offen benannte Faustregel. Daraus ergibt sich die Empfehlung: viel Spielraum und Kapazität frei = Leads;
   Spielraum, aber keine Kapazität = erst Software/Entlastung; kein Spielraum = kleineres Budget oder später.
4. **Unseren Preis und den erwarteten Rückfluss daneben** stellen: genau das kann der bestehende Rechner im
   Makler-Modus schon (Kosten je Vertrag, Break-even, Courtage/Jahr, mit Storno). Personalzeile dort ergänzen statt
   neue Folie.
5. **Kennzeichnung:** „Beispielrechnung mit Ihren Angaben, keine Ergebnisaussage“, Quelle und Stand der Standardwerte.
6. Falls doch eine Übersicht gewünscht ist: Achse „Jahrescourtage in €“ statt „Kunden“, Zellen mit Euro-Spannen statt
   Ja/Nein, nur realistische Kombinationen, keine Emojis.

## Branchenwerte (mit Vorbehalt: Umfragen, nicht repräsentativ)

- Umsatz Maklerbüro 2022 Ø 510.067 €, Gewinn vor Steuern 174.068 €, 96.673 € Umsatz je Vollzeitstelle (VEMA/Studie,
  berichtet von Versicherungsbote).
- Kunden je Makler: ca. 1.105 (BVK-Strukturanalyse 2022/23), ca. 3.900 (BVK 2025); ca. 4,5 Personen je Maklerbetrieb;
  je zusätzlichem Mitarbeiter ca. 69.000 € Mehrumsatz/Jahr (BVK 2025, berichtet).
- Gehalt Innendienst Versicherungen: ca. 3.600 bis 4.800 € brutto/Monat (Destatis-Verdiensterhebung 2025 laut
  MyStipendium ca. 4.800 €; StepStone Innendienst Düsseldorf 44.700 €/Jahr). Mit Arbeitgeberanteilen (ca. 21 %) und
  Arbeitsplatz grob 4.800 bis 6.300 € Vollkosten/Monat.
- Keine öffentliche Benchmark „Kunden je Innendienst-Kraft“ gefunden. Jede Zahl dazu wäre eine Annahme und muss als
  solche gekennzeichnet sein.
- Hinweis: versicherungsbote.de war in dieser Sitzung nicht direkt abrufbar (Netz-Freigabe fehlt); die Zahlen stammen
  aus Suchergebnis-Auszügen und sollten vor externer Verwendung im Original geprüft werden.

## Quellen
- [Versicherungsbote: Was Versicherungsmakler 2022 an Umsatz und Gewinn erzielen konnten](https://www.versicherungsbote.de/id/4912404/Was-Versicherungsmakler-2022-an-Gewinn-erzielen-konnten/)
- [Versicherungsbote: Schaden- und Unfallversicherung bringen die meiste Courtage](https://www.versicherungsbote.de/id/4912419/Versicherungsmakler-Schaden-und-Unfallversicherung-bringen-die-meiste-Courtage)
- [Versicherungsbote: Einfirmenvertreter betreuen mehr Kunden als Makler (BVK)](https://www.versicherungsbote.de/id/4911954/Einfirmenvertreter-betreuen-im-Durchschnitt-mehr-Kunden-als-Versicherungsmakler/)
- [Versicherungsbote: BVK-Strukturanalyse Kundenzahl](https://www.versicherungsbote.de/id/4946160/BVK-Strukturanalyse-zeigt-durchschnittliche-Kundenzahl-von-Versicherungsvermittlern/)
- [Versicherungsbote: Versicherungsvertrieb geprägt von Kleinstbetrieben](https://www.versicherungsbote.de/id/4911933/Versicherungsvertrieb-gepragt-von-Kleinstbetrieben)
- [DAS INVESTMENT: BVK Andreas Vollmer über Courtagen, Konsolidierung und KI](https://www.dasinvestment.com/bvk-andreas-vollmer-ueber-courtagen-konsolidierung-und-ki/?viewall)
- [Maklerratgeber: Aufgaben und Vergütung eines Versicherungsmaklers (PDF)](https://cdn.makleraccess.de/wp-content/uploads/sites/1288/2023/07/aufgaben-und-verguetung-eines-versicherungsmaklers.pdf)
- [gehalt.de: Mitarbeiter Innendienst Versicherungen](https://www.gehalt.de/beruf/innendienst-versicherungen)
- [MyStipendium: Kaufmann für Versicherungen und Finanzen, Gehalt](https://www.mystipendium.de/berufe/kaufmann-fuer-versicherungen-und-finanzen/gehalt?page=0%2C2)
- [StepStone: Mitarbeiter Innendienst Versicherungen Düsseldorf](https://www.stepstone.de/gehalt/Mitarbeiter-in-Innendienst-Versicherungen/city/Duesseldorf.html)
- [§ 5 UWG (gesetze-im-internet.de)](https://www.gesetze-im-internet.de/uwg_2004/__5.html)
- [omsels.info: § 5 UWG, Beweislast](https://www.omsels.info/die-verbote-oder-was-darf-ich-nicht/5-uwg-irrefuehrende-werbung/12-beweislast)
- Repo: docs/rechner.md (Makler-Modus, Preise 990 €, 40 €/Tag), docs/firma/kaltakquise.md, AGENTS.md
