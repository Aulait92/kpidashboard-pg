# A/B-Test-Lernbuch

Gedächtnis aller A/B-Tests bei Nachrichten und Seiten an Leads (Ole, 19.11.2026). Jeder neue Test wird vom
A/B-Test-Labor (`.claude/agents/ab-test-labor.md`) mit dem ganzen Team entwickelt und baut auf den Lehren hier auf.
Keiner testet aus dem Bauch. Neueste Einträge oben.

## So entsteht ein neuer Test
1. **Lernen:** Ergebnisse aller bisherigen Tests lesen (diese Datei, Diagnose `q=experimente` und `q=ab-test`,
   Data-Agent rechnet nach). Was hat gewonnen, was verloren, was blieb offen, und warum vermutlich?
2. **Hypothesen:** Das Team stellt je Nachricht 3 bis 5 Hypothesen auf, jede mit Begründung aus Lehren oder
   Lead-Psychologie und erwarteter Wirkung. Beteiligt: Conversion-Texter (Creative Director), UX/UI, Kunden-Personas
   (beide Leads), Data/BI; Recht und Datenschutz, sobald Pflichtangaben, Einwilligungen oder Gesundheitsdaten berührt sind.
3. **Auswahl:** Eine Hypothese je Test (eine Änderung, damit das Ergebnis etwas lehrt), die mit der größten erwarteten
   Wirkung bei kleinem Risiko. Red Team prüft kurz.
4. **Eintrag:** Vor dem Start hier eintragen (Hypothese, Fassung A und B, Ziel-Kennzahl, Mindestmenge, Start).
5. **Auswerten:** Nach Entscheidung Ergebnis und Lehre eintragen, Gewinner wird Standard, im selben Arbeitsgang die
   nächste Hypothese starten (AGENTS.md: kein Zeitraum ohne laufenden Test).

## Tests

| Start | Nachricht | Hypothese | A | B | Ziel / Mindestmenge | Status | Ergebnis und Lehre |
|---|---|---|---|---|---|---|---|
| 19.11.2026 | Erstanschreiben (alle Produkte) | Steht die Frage direkt hinter der Anrede, sieht der Lead sie schon in Benachrichtigung und Chatliste und antwortet öfter | v10: Dank bzw. Emotion, dann fette Frage, 2 bis 3 Knöpfe | v11: Frage zuerst, Dank danach oder weg, gleiche Knöpfe | Antwortquote 72 h / 150 je Fassung | startet mit der Freigabe von v10 bei Meta | offen |
| 19.11.2026 | Beratungspräsentation | Einstieg mit dem Anliegen und Wahl zwischen zwei Paketen erhöhen die Zusage im Termin | Fassung B | Fassung C | Zusage / 100 je Fassung | läuft | offen |
| bis 19.11.2026 | Terminvorschlag im Chat | „kostenlos“ senkt die Hürde zum Termin | „kurzen Videotermin“ | „kurzen, kostenlosen Videotermin“ | Termin gebucht | läuft | offen |
| bis 19.11.2026 | Komplettcheck-Frage nach der Buchung | Hinweis auf doppelt gezahlte Absicherung weckt mehr Interesse als „sparen“ | bisheriger Text | Text „doppelt zahlen“ | Komplettcheck ja | läuft | offen |
| bis 19.11.2026 | Buchungsseite /book | Weniger Hürden (nächste Tage zuerst, Datenschutz als Hinweis) bringen mehr Buchungen | bisherige Seite | kompakte Seite | Termin gebucht | läuft | offen |
| bis 19.11.2026 | Letzte Nachfassnachricht | Rücksichtsvolle Frage „Ich möchte Sie nicht weiter stören“ holt mehr Rückmeldungen | v5 | B-Fassung | Antwortquote | läuft | offen |
| bis 19.11.2026 | Kampagne Cross-Sell (Bestandskunden) | Konkretes Angebot „10 Minuten prüfen“ wirkt stärker | v4 | B-Fassung | Antwortquote | läuft | offen |

Ergebnisse der laufenden Tests: Diagnose `q=experimente` bzw. `q=ab-test` (für das Team in dieser Umgebung bisher
gesperrt; nachtragen, sobald der Datenzugang steht).

## Lehren (Querschnitt)
- Erstanschreiben: Lange Texte klappt WhatsApp hinter „Mehr lesen“ ein (etwa ab 4 bis 5 Zeilen, PDF-Kopf zählt mit).
  Antwortknöpfe senken die Hürde. Firmenname und PDF als erster Eindruck wecken Misstrauen (Persona-Test 19.11.2026,
  noch nicht gemessen).
