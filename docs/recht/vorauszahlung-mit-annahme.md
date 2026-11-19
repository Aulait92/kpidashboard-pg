# Vorauszahlung mit Annahme fällig: AGB-Änderung

Stand: 19.11.2026. Interne Prüfung (Ole, 18.11.2026: bis Budget für eine Anwältin da ist, keine Anwaltsfreigabe abwarten).
Keine Rechtsberatung.

## Entscheidung (Ole, 19.11.2026)

Vorauszahlungen (jährlich: 12 Monate, 3 geschenkt; 6 Monate im Voraus: 1 geschenkt) werden für den Cashflow mit der
Annahme des Angebots in Rechnung gestellt und fällig, nicht erst zum Start der Kampagne. Monatszahler unverändert.
Die Leistungszeit (Laufzeit, Garantie-Fristen, Verlängerung, Kündigungsfrist) beginnt weiter mit dem Startdatum.

## Befund AGB

Die AGB regelten die Fälligkeit ausdrücklich (Abschnitt „Vergütung und Zahlung“, Unterpunkt „Vorauszahlung“): „… zum
Start und danach zu Beginn jedes Zahlungszeitraums fällig“. Deshalb reicht eine Regel nur im Angebot nicht; der Text
ist angepasst (`src/lib/legal-texts.ts`, Stand `LEGAL_VERSION` 19.11.2026):

> Ist sie vereinbart, wird die Vergütung für 12 Monate (jährlich, mit 12 Monaten Laufzeit) bzw. für 6 Monate (mit 6
> Monaten Laufzeit) im Voraus gezahlt (Nachlass laut Angebot). Die Vorauszahlung für den ersten Zahlungszeitraum ist mit
> Vertragsschluss fällig, die für jeden weiteren Zahlungszeitraum zu dessen Beginn. Zahlungszeiträume und Laufzeit
> beginnen mit dem Startdatum. Für Verträge, die vor dem 19.11.2026 angenommen wurden, ist die erste Vorauszahlung zum
> Start fällig. …

## Prüfung

- Vertragspartner sind Unternehmer (§ 14 BGB, Bestätigung bei der Annahme). Eine Vorleistungspflicht des Kunden ist im
  B2B-Verkehr frei vereinbar (§ 271 BGB: Fälligkeit nach Vereinbarung); keine überraschende Klausel (§ 305c BGB), weil
  dieselbe Regel im Angebot direkt am Annahme-Knopf, im Angebotsdokument („Bei Annahme fällig“ mit Betrag), in der
  Angebotsmail und in der Auftragsbestätigung steht.
- Transparenz (§ 307 Abs. 1 Satz 2 BGB): Betrag, Fälligkeit (mit Annahme), Leistungszeitraum (ab Start) und nächste
  Fälligkeit (Start plus 12 bzw. 6 Monate) werden vor dem Klick genannt; der feste Satz lautet „Die Vorauszahlung wird
  mit Annahme fällig, die Laufzeit beginnt mit dem Start der Kampagne.“
- Bestehende Verträge: unverändert (Übergangssatz in den AGB, Abrechnung nach `Offer.prepayAtAcceptance`). Deshalb keine
  Mitteilung nach AGB „Änderungen dieser AGB“ nötig.
- Rechnung (§ 14 Abs. 4 Nr. 6 UStG): Leistungszeitraum steht auf der Rechnung (Zusatzfeld „Leistungszeitraum“ im
  Rechnungskopf, bei Überweisung zusätzlich an jeder Position). Umsatzsteuer 19 % wie bisher. Steuerlich ist es eine
  Anzahlung vor Ausführung der Leistung (Mindest-Ist-Versteuerung, § 13 Abs. 1 Nr. 1 Buchst. a Satz 4 UStG): Die
  Umsatzsteuer entsteht mit Ablauf des Voranmeldungszeitraums der Vereinnahmung. Hinweis an die Buchhaltung.
- Ende vor dem Start (z. B. Kündigung aus wichtigem Grund vor Beginn): wie bisher keine Erstattung außer bei Kündigung
  des Kunden aus wichtigem Grund; dann von Hand erstatten.

## Auflagen

- Keine. Bei einer Anwaltsprüfung später die Übergangsregel und die Vorleistung mit prüfen lassen.
