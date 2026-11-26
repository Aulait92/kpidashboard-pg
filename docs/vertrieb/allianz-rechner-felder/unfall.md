# Allianz Onlinerechner: Unfallversicherung

**Stand:** 26.11.2026
**URL:** https://www.allianz.de/vorsorge/unfallversicherung/rechner/
**Technik:** eigene Journey App (`live.inno.kxlabs.allianz.de`). Die vollständige Formularkonfiguration wird öffentlich als JSON geladen (`.../journeys/<id>/config`, rund 490 KB) und enthält Felder, Optionen, Validierungen und die Angebotstabelle. Die Angaben unten sind im Ablauf geprüft und mit dieser Konfiguration abgeglichen.
**Testwerte (erfunden):** mich selbst, Geburtsdatum 01.01.1985, kaufmännisch & verwaltend, Invaliditätsfrage Nein, Leistung ab 50 %.
**Erreicht:** Schritt 1 und 2 vollständig. Schritt 3 (Antrag) nicht betreten.

Ablauf: 1 Daten eingeben, 2 Angebot erhalten, 3 Antrag stellen.

## Schritt 1: Daten eingeben

| Nr | Feld / Frage | Typ | Optionen | Pflicht | Abhängigkeiten, Hinweise |
|---|---|---|---|---|---|
| 1 | Unfallschutz für | Auswahl (Radio) | mich selbst; mein Kind | ja (vorbelegt "mich selbst") | "mein Kind" ersetzt 2 durch 2a und blendet 3 aus |
| 2 | Geburtsdatum | Datum | | ja bei "mich selbst" | 18 bis 99 Jahre |
| 2a | Geburtsdatum des Kindes | Datum | | ja bei "mein Kind" | Kind darf zum Beginn das 16. Lebensjahr noch nicht vollendet haben; Antragsteller muss volljährig sein |
| 3 | Berufstätigkeit | Auswahl | kaufmännisch & verwaltend; körperlich & handwerklich; nicht erwerbstätig | ja bei "mich selbst" | Gefahrengruppe |
| 4 | Ist es Ihnen wichtig, schon bei geringer Invalidität Geld zu erhalten? | Ja/Nein | | ja | Ja öffnet 4a, Nein öffnet 4b |
| 4a | Ist Ihnen eine schnelle Einmalzahlung auch bei folgenlos ausheilenden Unfallverletzungen wie z. B. Knochenbrüchen oder Bänderrissen wichtig? | Ja/Nein | | ja bei 4 = Ja | |
| 4b | Ab welchem Grad der Invalidität (Invaliditätsgrad) möchten Sie die Leistung erhalten? | Auswahl (Radio) | 20 %; 50 % | ja bei 4 = Nein | |

Die Fragen 4 bis 4b steuern nur die Empfehlung der Linie.

## Schritt 2: Angebot erhalten

Satz "Ich zahle [Zahlungsperiode] und möchte [Laufzeit] Vertragslaufzeit."

| Feld | Typ | Optionen | Vorbelegung |
|---|---|---|---|
| Zahlungsperiode | Auswahl | monatlich, vierteljährlich, halbjährlich, jährlich | monatlich |
| Vertragslaufzeit | Auswahl | 1 Jahr; 3 Jahre | 3 Jahre (3 Jahre nur in Smart, Komfort, Premium; Basis nur mit 1 Jahr) |
| Produktlinie | Auswahl (Karten) | Basis, Smart, Komfort, Premium | Empfehlung |

Es gibt **keine** Selbstbeteiligung und **kein** Eingabefeld für die Invaliditätssumme, die Summen sind je Linie fest.

Beispielbeiträge (Testfall, monatlich): Basis 4,05 €, Smart 9,53 €, Komfort 27,19 €, Premium 61,83 €.

| Leistung | Basis | Smart | Komfort | Premium |
|---|---|---|---|---|
| Leistung ab Invaliditätsgrad | 50 % | 20 % | 1 % | 1 % |
| Invaliditätssumme | 60.000 € | 60.000 € | 60.000 € | 100.000 € |
| Maximale Invaliditätsleistung (Progression 500) | 300.000 € | 300.000 € | 300.000 € | 500.000 € |

Weitere Leistungszeilen (je nach Linie enthalten): Sofortleistung bei schweren Verletzungen, TopSchutz, Unfallhilfe-Family (Beratung, Therapie und Kosten), Todesfallleistung (sichtbare Werte 10.000 € und 40.000 €), Unfallrente (250 € und 750 € monatlich), Krankenhaustagegeld (5 € und 15 €), Rundum-Service (nicht bei Kindern), Akutleistung (Knochenbrüche, Bänderrisse bis 3.000 €).

In allen Linien: Unfallberater weltweit rund um die Uhr, Wieder-Fit (bis 10.000 €), Progression 500, kosmetische Operationen und Bergungskosten bis 100.000 €, Dynamik (mindestens 5 % jährlich bis zum 55. Geburtstag, danach Beitragsanstieg 5 % jährlich bis 75 ohne Leistungserhöhung).

Keine auswählbaren Zusatzbausteine. Weiter: "WEITER ZUM ANTRAG" ("Bitte geben Sie zum Abschluss im nächsten Schritt Ihre persönlichen Daten ein."). Hier gestoppt. Laut Konfiguration wird dort u. a. das Bezugsrecht für die Todesfallleistung festgelegt.

## Abgleich mit unserer Liste

| Unser Punkt | Fragt die Allianz? | Anmerkung |
|---|---|---|
| Geburtsdatum | ja | bzw. des Kindes |
| Familienstand / Mitversicherte | teilweise | nur Erwachsener selbst oder ein Kind; kein Partner, keine Familienpolice |
| Beruf / Status | teilweise | nur 3 Tätigkeitsgruppen (kaufmännisch, körperlich, nicht erwerbstätig), keine Unterscheidung angestellt, selbstständig, öffentlicher Dienst, Rentner |
| Aktueller Versicherer und Ablauf | nein | |
| Vorschäden 5 Jahre | nein | keine Frage nach Unfällen oder Gesundheit im Rechner |
| Selbstbeteiligung | nein | gibt es im Produkt nicht |

**Fragt die Allianz zusätzlich:** Bedarfsfragen zur Invalidität (geringe Invalidität, Einmalzahlung bei Brüchen, Invaliditätsgrad 20 oder 50 %), Vertragslaufzeit 1 oder 3 Jahre.

Screenshots: `unfall-daten.png`, `unfall-angebot.png`
