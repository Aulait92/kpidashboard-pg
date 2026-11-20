# Garantien: „Termine wahrgenommen“ klargestellt

Stand: 20.11.2026. Interne Prüfung (Ole, 18.11.2026: bis Budget für eine Anwältin da ist, keine Anwaltsfreigabe
abwarten). Keine Rechtsberatung. Ampel: **grün**.

## Anlass und Entscheidung

Ein Kunde (Generalvertreter) fragte, wie abgesagte Termine und nicht erschienene Interessenten bei der Bedingung
„mindestens 80 % der gebuchten Termine wahrgenommen“ zählen, und verlangte eine transparente Berechnung. Gemeint war
immer: Der Vermittler nimmt die Termine wahr. Ole, 20.11.2026: „ja, für alle in den AGB klarstellen“ (Stufe A, erteilt).

## Conversion-Blick (vor dem Text)

- Nutzen zuerst, Sicht des Kunden: „von Ihnen wahrgenommen“, Ausnahme in Alltagssprache in Klammern.
- Kurzfassung (Angebot, Rechner, Empfehlungsseite, Hilfe) bleibt ein Halbsatz; Details nur in den AGB.
- AGB: eigener Unterpunkt „Wahrgenommene Termine“ statt eines längeren Satzes in „Gemeinsame Voraussetzungen“
  (lesbar, auffindbar). Kein neues Pflichtfeld, keine neue Bestätigung.

## Neuer Wortlaut (src/lib/legal-texts.ts, „Garantien“)

Gemeinsame Voraussetzungen: „… mindestens 80 % der über die Software gebuchten Termine **vom Kunden** wahrgenommen …“

> **Wahrgenommene Termine:** Nicht wahrgenommen sind nur Termine, die der Kunde selbst absagt oder versäumt. Sagt der
> Interessent ab, verschiebt er oder erscheint er nicht, gilt der Termin als wahrgenommen. Verschiebt der Kunde einen
> Termin, zählt nur der neue. Im Zweifel, etwa wenn nicht feststeht, wer abgesagt hat, gilt der Termin als wahrgenommen.
> Auf Anfrage legt der Anbieter dem Kunden die Berechnung beider Quoten in Textform vor, mit der Liste der zugrunde
> liegenden Termine und Leads und dem jeweils eingetragenen Ergebnis.

Kurzfassung: „mindestens 80 % der gebuchten Termine von Ihnen wahrgenommen (Absagen und Nichterscheinen von
Interessenten zählen nicht gegen Sie)“.

## Prüfung

- **§ 305c BGB (überraschend, mehrdeutig):** Die bisherige Fassung war mehrdeutig („wahrgenommen“ von wem?). Nach § 305c
  Abs. 2 BGB ginge der Zweifel ohnehin zulasten des Anbieters; die Klarstellung schreibt die kundenfreundliche Auslegung
  fest und nimmt das Streitrisiko heraus.
- **§ 307 Abs. 1 Satz 2 BGB (Transparenz):** Wer zählt, was nicht zählt, Verschiebung, Zweifelsregel und Anspruch auf
  die Berechnung mit Liste sind benannt. Der Kunde kann seine Quote nachvollziehen.
- **§ 307 Abs. 1, 2 BGB (Angemessenheit):** Die Voraussetzung knüpft nur noch an das Verhalten des Kunden an, nicht an
  das Dritter (Interessenten). Unbedenklich.
- **Bestehende Verträge:** Änderung ausschließlich zugunsten der Kunden, gilt als Klarstellung des schon Gemeinten auch
  für bestehende Verträge. Kein Verfahren nach AGB „Änderungen dieser AGB“ (Mitteilung, 6 Wochen Widerspruch) nötig;
  eine Information an betroffene Kunden ist freiwillig (Stufe A, Ole).
- **UWG / Werbung:** Kurzfassungen in Angebot, Rechner und Empfehlungsseite decken sich mit den AGB (keine
  Irreführung nach § 5 UWG durch abweichende Bedingungen).

## Daten in der Software (Befund)

- Termine: `Appointment.status` (booked, cancelled, completed, no_show) und `cancelledBy` (lead, advisor, team; bei
  älteren Terminen leer). „no_show“ setzt der Vermittler, wenn der Interessent nicht erschienen ist.
- Unterscheidbar: Absage durch Interessent (`lead`) gegen Absage durch den Vermittler (`advisor`, auch: Termin im
  eigenen Kalender gelöscht oder abgelehnt). Verschiebung: alter Termin abgesagt, neuer Termin desselben Leads angelegt.
- **Nicht unterscheidbar:** ob der Vermittler einen vergangenen Termin ohne Eintrag versäumt hat; ob eine Absage ohne
  Herkunft (alte Termine) oder durch uns (`team`) vom Kunden kam. Darum die Zweifelsregel zugunsten des Kunden.
- Berechnung angeglichen (`src/lib/garantien.ts` `terminQuote`, `src/lib/garantien-server.ts`): Gegen den Kunden
  zählen nur vom Kunden abgesagte Termine ohne neuen Termin. „completed“, „no_show“ und vergangene Termine ohne
  Eintrag zählen als wahrgenommen. Bisher zählten „no_show“ und Termine ohne Eintrag dagegen (strenger als die AGB).
- Folge: Die Termin-Bedingung greift praktisch nur noch bei Absagen durch den Kunden. Das Pflegen der Ergebnisse sichert
  weiter die zweite Bedingung (80 % der Leads mit Ergebnis).

## Auflagen

1. Liste auf Anfrage: Termine (Datum, Status, Absage durch) und Leads (Ergebnis) je Garantiezeitraum in Textform
   erstellen können. Bis zu einem Export im Admin von Hand aus den Daten der Kundenakte (offene Aufgabe CTO).
2. Kurzfassungen nur mit dem Halbsatz aus diesem Dokument verwenden; neue Fundstellen angleichen.
3. Keine Neuigkeit (`ProductUpdate`): Ohne das Wort „Garantie“ nicht verständlich, zudem gelten Garantien nicht für
   alle Pakete (Pay-per-Lead). Die Webseite nennt die Bedingung nicht (geprüft 20.11.2026), kein Eintrag nötig.
