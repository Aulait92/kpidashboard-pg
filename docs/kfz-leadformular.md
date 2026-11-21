# Meta-Leadformular Kfz (Entwurf, Ole 21.11.2026)

Ziel: wenige Antworten per Tipp, damit der Assistent nach der Buchung weniger fragen muss, ohne Leads zu kosten.
Die App erkennt die Fragen an der Beschriftung (`KFZ_FORMULAR` in `src/lib/whatsapp/produkt-fragen.ts`); was das
Formular liefert, fragt der Assistent nicht noch einmal. Beschriftungen bitte genau so übernehmen (Sie oder Du, je nach
Ansprache des Kunden).

## Felder

| # | Art bei Meta | Beschriftung (Sie) | Beschriftung (Du) | Antworten |
|---|---|---|---|---|
| 1 | Mehrfachauswahl | Worum geht es? | Worum geht es dir? | Versicherung wechseln (jetziges Auto) · Neues Auto versichern |
| 2 | Mehrfachauswahl | Welchen Schutz wünschen Sie? | Welchen Schutz wünschst du dir? | Haftpflicht · Teilkasko · Vollkasko · Weiß ich noch nicht |
| 3 | Vorausgefüllt | Postleitzahl | Postleitzahl | (von Meta) |
| 4 | Vorausgefüllt | Geburtsdatum | Geburtsdatum | (von Meta) |
| 5 | Vorausgefüllt | Vollständiger Name, Telefonnummer, E-Mail | wie links | (von Meta) |

Reihenfolge: erst die beiden Tipp-Fragen (Einstieg ohne Hürde), dann die vorausgefüllten Felder.

## Bewusst nicht im Formular

Führerschein seit, weitere Fahrer, km pro Jahr, Finanzierung, Schäden der letzten 3 Jahre, öffentlicher Dienst: fragt der
Assistent nach der Buchung (je ein Tipp oder eine kurze Antwort). HSN, TSN, SF-Klasse, Versicherer und
Versicherungsscheinnummer kommen aus den Fotos von Fahrzeugschein und letzter Rechnung.

## Später als A/B-Test

Kurze Fassung (oben) gegen eine längere mit „Wie viele Kilometer fahren Sie im Jahr?“ (Auswahl: bis 9.000 · 9.000 bis
15.000 · über 15.000). Messgröße: Kosten je Termin, nicht je Lead.
