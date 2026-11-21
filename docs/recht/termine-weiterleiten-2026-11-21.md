# Termine per Weiterleitung blockieren: Datenschutz-Kurzcheck

Stand: 21.11.2026. Interne Prüfung (Ole, 18.11.2026: bis Budget für eine Anwältin da ist, keine Anwaltsfreigabe abwarten).
Keine Rechtsberatung.

Gegenstand: Vermittler mit App-Kalender (kein Google/Outlook verbunden) leiten Outlook-Einladungen an ihre persönliche
Adresse `termine-<token>@antwort.dein-beratungstermin.de` weiter. Die App liest Beginn und Ende aus der Kalenderdatei
und blockiert die Zeit (`CalendarBlock`, Quelle „weitergeleitet“). Code: `src/lib/calendar/termin-weiterleitung.ts`,
`src/lib/calendar/termin-weiterleitung-server.ts`.

## Ergebnis

**Ampel: GRÜN, live ohne Auflagen; zwei Empfehlungen.**

- **Was wir speichern:** Beginn, Ende, Hash der UID (nicht die UID selbst), SEQUENCE, bei Serien das ursprüngliche
  Vorkommen, Quelle „weitergeleitet“. Dazu wie bei jeder Mail an die Eingangs-Domain eine Zeile `MailEingang` (Resend-ID,
  Ergebnis, Kurzgrund, Kunde; keine Inhalte). **Nicht gespeichert:** Betreff, Teilnehmer, Organisator, Ort, Beschreibung,
  Absenderadresse, Mailtext. Getestet in `tests/unit/termin-weiterleitung.test.ts`.
- **Betroffene und Rolle:** In erster Linie der Vermittler selbst (eigene Termine als Auftraggeber, Vertragserfüllung,
  Art. 6 Abs. 1 lit. b DSGVO). Daten Dritter in der Einladung (Teilnehmer, Organisator, Inhalt) werden nur flüchtig im
  Speicher gelesen und sofort verworfen; nur Zeiten bleiben. Datenminimierung (Art. 5 Abs. 1 lit. c) ist erfüllt.
- **Schutz:** Adresse mit 100 Bit Zufall, nicht erratbar; Mails ohne gültige Kalenderdatei werden ignoriert; Antworten
  (Bestätigung bzw. Hinweis) gehen nur an Absender, die zum Konto gehören (Login oder Berater-Adresse), sonst als Push.
  Keine Rückstreu-Mails an fremde Absender. Höchstens 60 Eingänge je Kunde und Tag. Keine KI-Auswertung.
- **Löschung:** Blockierungen wie „Zeit blockieren“ (mit dem Kalender bzw. den Kundendaten, `ruhend.ts`), Adresse mit
  den Kundendaten (Kaskade bzw. `ruhend.ts`), `MailEingang` ohne Kontakt nach 90 Tagen (`erasure.ts`).

## Unterauftragsverarbeiter (`SUBPROCESSORS` in `src/lib/legal-texts.ts`)

Nur geprüft, nicht geändert. Resend steht mit Zweck „Versand von E-Mails (z. B. Terminbestätigungen)“. Der Empfang über
Resend Receiving (Region EU) läuft schon seit Paket M2 (Antwortadresse, `docs/datenschutz.md`, dort als „Prüfen vor dem
Einschalten“ vermerkt). Für diese Funktion ist der Vermittler selbst der Betroffene und kein Lead-Datum wird gespeichert;
eine Änderung ist deshalb nicht zwingend. **Empfehlung E1:** Beim nächsten AVV-Stand den Zweck auf „Versand und Empfang
von E-Mails (z. B. Terminbestätigungen, Antworten, weitergeleitete Termine)“ erweitern, dann sind M2 und diese Funktion
abgedeckt. Bei Resend gilt deren Aufbewahrung empfangener Mails (die Rohmail mit Betreff liegt dort, bis Resend sie löscht).

## Hinweis für Vermittler (Firmenrichtlinien)

**Empfehlung E2:** Manche Gesellschaften verbieten, Firmentermine an externe Adressen weiterzuleiten. Die Verantwortung
liegt beim Vermittler (selbständiger Handelsvertreter, eigene IT-Regeln der Gesellschaft). Wer unsicher ist, kann für
private oder sensible Termine weiter „Zeit blockieren“ von Hand nutzen. Kein Pflichthinweis in der App nötig; bei Fragen
im Support so beantworten.
