# Closing im Call: Feedback des Teams (19.11.2026)

Beteiligt: Head of Sales, Kunden-Personas (Allianz-Vertreter, Makler, Großagentur), UX/UI, CFO. Nur gelesen, nichts geändert.
Anlass: Vermittler schieben den Abschluss auf, 7 stehen kurz davor. Ziel: Annahme und Zahlung im Call oder kurz danach.

## Kernbefund
Präsentation und Angebotsseite sind heute auf zwei Termine gebaut, das Aufschieben ist eingebaut:
1. Letzte Folie: QR-Code „Selbst nachrechnen“ (Hausaufgabe statt Abschluss).
2. Angebotsseite: Kasten „Entscheidungs-Call buchen“ steht über „Angebot annehmen“ (Standard).
3. Kein Weg von der Präsentation zum Angebot (`/praesentation/[token]` und Admin-Präsentation ohne Knopf).
4. Widersprüche zwischen Folie und Angebot: Einrichtung „5 Min.“ vs. „20 bis 30 Min.“ vs. „1–2 Wochen“; „mit einem Klick“ vs. 10 bis 12 Taps; Garantie-Voraussetzungen unterschiedlich formuliert; „ohne Laufzeit“ als Sicherheit, aber Setup 2.490 € statt 990 €.
5. Rechnung mit fremden Zahlen (Beispiel-Vertreter), keine Bedarfsfrage, Preis erst auf Folie 21/22 von 25, Folien 2 bis 6 nur über uns.
6. Fehler: Scheitert die Stripe-Zahlseite, sieht der Kunde „Auftrag bestätigt“, obwohl nichts bezahlt ist (`src/app/angebot/[token]/actions.ts:57`).

## Gesprächsablauf (45 Min.)
Rahmen (Nein erlaubt, Entscheider dabei, Abschluss im Call angekündigt) → Bedarf mit 4 Zahlen → eine Folie „über uns“ → Demo → Probeabschluss → Rechnung mit seinen Zahlen → eine Preisempfehlung → Abschlussfrage, schweigen → gemeinsam annehmen und bezahlen per Bildschirmfreigabe. Erst auflegen, wenn „Zahlung eingerichtet“ erscheint.
Termineinladung: „Bitte halten Sie für den Fall eines Starts Ihre IBAN bereit.“

## Preis und Zahlung (CFO)
Kein neuer Rabatt. Bestehende Hebel nutzen: Abschlussbonus 300 € mit echter, nicht verschobener Frist; SEPA-Mandat; Risiko über Absicherung (AGB § 12), Pause und Startdatum bis 90 Tage abbauen. Bonus für alle 7 höchstens 2.100 € netto.

## Plan für die 7 offenen Vermittler
Heute: Gruppen bilden (A nicht geöffnet, B geöffnet, C angenommen ohne Zahlung, D kein Angebot). Fr 20.11. und Mo 23.11. 9 bis 11:30 Uhr anrufen, Ziel Abschluss am Telefon, sonst fester 15-Minuten-Termin. Mail-Entwürfe liegen beim Head of Sales (Versand nach Oles Freigabe).

## Entscheidungen für Ole (Stufe A)
- Zahlweise im Call: Vorauszahlung zuerst oder monatlich zuerst
- Folien 2 bis 6, 21 bis 25 überarbeiten (Widersprüche, „Garantie“-Wortlaut, Gedankenstriche)
- Haken in der Annahme zusammenlegen (Rechtsprüfung)
- Überweisung auf Rechnung für Großagenturen
- Produktpunkte trotz Feature-Stopp als Ausnahme (Brücke Präsentation → Angebot, Entscheidungs-Call im Call aus, Stripe-Fehler)
