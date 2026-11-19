# Zahlung nachträglich: AGB-Sonderregel

Stand: 19.11.2026. Interne Prüfung (Ole, 18.11.2026: bis Budget für eine Anwältin da ist, keine Anwaltsfreigabe abwarten).
Keine Rechtsberatung.

## Entscheidung (Ole, 19.11.2026)

Sonderkondition je Angebot (`Offer.paymentInArrears`, Admin: „Zahlung nachträglich (für den abgelaufenen Monat)“):
Die monatliche Vergütung wird jeweils nachträglich für den abgelaufenen Leistungsmonat fällig, erstmals einen Monat nach
dem Start (gleicher Tag), auch nach der Mindestlaufzeit. Die Vergütung für den letzten Leistungsmonat wird nach
Vertragsende fällig. Nur mit monatlicher Zahlung (nicht mit Vorauszahlung, eigenem Abrechnungstag oder kostenlosem Start),
Start am 1. bis 28. eines Monats.

## Befund AGB

„Vergütung und Zahlung“ legt fest: „… die monatliche Vergütung ab dem Startdatum monatlich im Voraus“. Eine Regel nur im
Angebot ginge als Individualabrede zwar vor (§ 305b BGB), für Klarheit steht die Ausnahme aber auch in den AGB
(`src/lib/legal-texts.ts`, `LEGAL_VERSION` „19.11.2026 (Fassung 2)“):

> Ist im Angebot nachträgliche Zahlung vereinbart, wird die monatliche Vergütung abweichend davon jeweils nachträglich
> für den abgelaufenen Leistungsmonat fällig, erstmals einen Monat nach dem Startdatum; das gilt bis zum Vertragsende,
> die Vergütung für den letzten Leistungsmonat wird danach fällig.

## Prüfung

- B2B (§ 14 BGB, Bestätigung bei der Annahme). Die Regel begünstigt den Kunden (Anbieter leistet vor); keine
  überraschende Klausel (§ 305c BGB), keine unangemessene Benachteiligung (§ 307 BGB).
- Transparenz (§ 307 Abs. 1 Satz 2 BGB): Betrag, erste Abbuchung mit Datum, Leistungsmonat und die Zahlung nach
  Vertragsende stehen im Angebot („Zahlweise“, „Bei Annahme fällig“, 2.1 Zahlung), am Annahme-Knopf, in der Angebotsmail
  und in der Auftragsbestätigung.
- Umsatzsteuer: Die Leistung wird monatlich als Teilleistung erbracht; die Steuer entsteht mit Ablauf des
  Voranmeldungszeitraums, in dem der Leistungsmonat endet (§ 13 Abs. 1 Nr. 1 Buchst. a UStG, Soll-Versteuerung), nicht
  erst mit der Zahlung. Die Rechnung nennt den abgelaufenen Leistungszeitraum (§ 14 Abs. 4 Nr. 6 UStG): Zusatzfeld
  „Leistungszeitraum TT.MM.JJJJ bis TT.MM.JJJJ (nachträglich)“ und Beschreibung, gesetzt beim Stripe-Ereignis
  `invoice.created` (`labelArrearsInvoice` in `src/lib/billing.ts`). Hinweis an die Buchhaltung.
- Bestehende Verträge: unverändert (Regel greift nur, wenn im Angebot vereinbart). Keine Mitteilung nach AGB „Änderungen
  dieser AGB“ nötig.
- Ausfallrisiko: Der Anbieter leistet einen Monat vor. Bei Zahlungsverzug gilt das Mahnwesen wie bisher.

## Auflagen

- Im Stripe-Webhook-Endpunkt das Ereignis `invoice.created` aktivieren (sonst fehlt das Zusatzfeld auf der Rechnung).
