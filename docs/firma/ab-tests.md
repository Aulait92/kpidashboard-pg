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
| mit dem Deploy (20.11.2026) | Buchungsseite /book, freiwilliges Häkchen „Erinnerung an die Unterlagen“ (Splittest `buchung_erinnerung`, Einheit zufällige ID je Seitenaufruf, zugeteilt erst bei der Buchung; unabhängig von `buchungsseite_kompakt`) | Steht das Häkchen als hervorgehobene Karte statt als grauer Kleindruck da, wird es wahrgenommen und öfter angehakt | Standard, von Ole am 20.11.2026 direkt freigegeben (ohne Test): fett „Damit in Ihrem Termin nichts fehlt:“ Ja, bitte per WhatsApp an meine Unterlagen erinnern (empfohlen). Abmelden jederzeit mit STOP. (Du-Fassung entsprechend), grauer Kleindruck | gleicher Wortlaut als Karte (Rahmen, Hintergrund, größere Schrift und Häkchen) | `erinnerung_optin` (Anteil der Lead-Buchungen mit Häkchen) / 150 Buchungen je Fassung, p unter 0,01, je 10 Treffer und 10 Nicht-Treffer; Gegenprobe Buchungsquote (`buchungsseite_kompakt`) | läuft mit dem Deploy | offen. Vorher galt „Ich möchte per WhatsApp an die Vorbereitung meines Termins erinnert werden (z. B. an meine Unterlagen) …“; Ole hat den Vorschlag des Labors mit „(empfohlen)“ und fettem Nutzen direkt freigegeben. Nachweis speichert Wortlaut und Textstand (`2026-11-20.<an>` bzw. `2026-11-20.karte.<an>`). Häkchen nur, wenn der Lead selbst bucht. Nächste Ideen: Begrenzung nennen (erst Zahl prüfen), Opt-in im Chat per Knopf „Später schicken“ (A8 b) |
| ab Livegang beitrag.pkv-tarife.com (Freigabe Ole 20.11.2026) | Eigener PKV-Funnel, Überschrift der Startseite (Splittest `funnel_pkv_anlass`, Einheit Besucher-ID je Seitenaufruf, ohne Cookie) | Eine Überschrift mit konkretem Anlass (Beitragserhöhung zum 1. Januar) spricht Betroffene direkt an: Es fragen eher Leute mit echtem Anliegen an, die der Experte auch erreicht | „Über 650 € im Monat für deine PKV? Ein interner Tarifwechsel kann helfen“ (Standard aus dem Conversion-Durchgang 20.11.2026) | „Hat deine PKV den Beitrag zum 1. Januar erhöht? Lass deinen Tarif kostenlos prüfen“ | `ppl_erreicht` (Abnehmer hat den Lead erreicht, Reife 14 Tage, Leads ohne Rückmeldung zählen nicht) / 150 je Fassung, p unter 0,01, je 10 Treffer und 10 Nicht-Treffer; Gegenprobe `funnel_lead` (Anfragequote), Termin, Abschluss | läuft ab Livegang | offen. Achtung: Anlass „1. Januar“ ist saisonal (wirkt vermutlich Nov. bis Feb.); nach Februar neu bewerten. Nächste Ideen: Beitragsfrage auf Platz 2, Zusatzfrage „Wann erreicht dich dein Experte am besten?“ |
| mit dem Deploy (Freigabe Ole 20.11.2026) | Buchungsbestätigung im WhatsApp-Assistenten (Splittest `termin_zusage`, Einheit Lead-ID, nur im Chat gebuchte Termine) | Endet die Bestätigung mit einer Zusage-Frage, sagt der Lead aktiv „Ja“ (Commitment) und erscheint öfter; wer nicht kann, verschiebt per Knopf statt still fernzubleiben | Bestätigung ohne Frage, Komplettcheck-Frage sofort danach als eigene Nachricht | Bestätigung plus fett „Kann Herr Kannapinn fest mit Ihnen rechnen?“ / „Kann [Vorname] fest mit dir rechnen?“ [Ja, sicher] [Lieber andere Zeit]; Komplettcheck (bzw. TKV-Tierfrage) erst nach dem Tipp, ohne Tipp nach 1 Std. (Mo bis Sa 8 bis 20 Uhr); keine zusätzliche Nachricht | Erschienen (nur Termine, die vorbei sind) / 150 je Fassung, p unter 0,01, je 10 Treffer und 10 Nicht-Treffer; Gegenprobe Komplettcheck ja und Anteil verschoben bzw. abgesagt | gebaut, startet mit dem Deploy | offen. Fallzahl derzeit sehr klein (Diagnose 20.11.2026: 6 Zuteilungen im Komplettcheck-Test seit Start), Entscheidung frühestens in vielen Monaten. Halbzeit-Erinnerung bei mehr als 7 Tagen Vorlauf ist ein eigener, späterer Test (Vorlage braucht Meta-Freigabe) |
| 19.11.2026 | Erstanschreiben (alle Produkte) | Steht die Frage direkt hinter der Anrede, sieht der Lead sie schon in Benachrichtigung und Chatliste und antwortet öfter | v10: Dank bzw. Emotion, dann fette Frage, 2 bis 3 Knöpfe | v11: Frage zuerst, Dank danach oder weg, gleiche Knöpfe | Antwortquote 72 h / 150 je Fassung | startet mit der Freigabe von v10 bei Meta | offen |
| 19.11.2026 | Beratungspräsentation | Einstieg mit dem Anliegen und Wahl zwischen zwei Paketen erhöhen die Zusage im Termin | Fassung B | Fassung C | Zusage / 100 je Fassung | läuft | offen |
| bis 19.11.2026 | Terminvorschlag im Chat | „kostenlos“ senkt die Hürde zum Termin | „kurzen Videotermin“ | „kurzen, kostenlosen Videotermin“ | Termin gebucht | läuft | offen |
| bis 19.11.2026 | Komplettcheck-Frage nach der Buchung | Hinweis auf doppelt gezahlte Absicherung weckt mehr Interesse als „sparen“ | bisheriger Text | Text „doppelt zahlen“ | Komplettcheck ja | läuft | offen |
| bis 19.11.2026 | Buchungsseite /book | Weniger Hürden (nächste Tage zuerst, Datenschutz als Hinweis) bringen mehr Buchungen | bisherige Seite | kompakte Seite | Termin gebucht | läuft | offen |
| bis 19.11.2026 | Letzte Nachfassnachricht | Rücksichtsvolle Frage „Ich möchte Sie nicht weiter stören“ holt mehr Rückmeldungen | v5 | B-Fassung | Antwortquote | läuft | offen |
| bis 19.11.2026 | Kampagne Cross-Sell (Bestandskunden) | Konkretes Angebot „10 Minuten prüfen“ wirkt stärker | v4 | B-Fassung | Antwortquote | läuft | offen |

Eigener PKV-Funnel (beitrag.pkv-tarife.com, /f/pkv-beitrag, Bau 20.11.2026): Fassung b je Schritt möglich
(`lib/funnel/definition.ts`, `test.b`), Einheit Besucher-ID. Haupt-Kennzahl `ppl_erreicht` (Abnehmer hat den Lead
erreicht, je Besucher; Leads an Abnehmer ohne Rückmeldung in der App zählen nicht), Neben-Kennzahlen `funnel_lead`,
`ppl_termin`, `ppl_abschluss`, `ppl_umsatz`; nur Besucher mit Zuteilung vor mindestens 14 Tagen. Seit 20.11.2026 ohne
Besucher-Cookie (Auflage L4): Zuteilung je Seitenaufruf, Wiederkehrer zählen doppelt. Erster Test `funnel_pkv_anlass`
(oben), das Beispiel `funnel_pkv_beispiel` bleibt aus. Zahlen: Diagnose `q=funnel`.

Ergebnisse der laufenden Tests: Diagnose `q=experimente` bzw. `q=ab-test` (für das Team in dieser Umgebung bisher
gesperrt; nachtragen, sobald der Datenzugang steht).

## Lehren (Querschnitt)
- Einwilligungen auf Seiten (Buchung 20.11.2026): nie vorausgewählt; was zählt, ist Nutzen und Begrenzung im Text, nicht
  der Haken. Ein freiwilliges Häkchen kostet kaum Buchungen, die Zustimmungsquote ist die eigene Kennzahl (noch nicht gemessen).
- Erstanschreiben: Lange Texte klappt WhatsApp hinter „Mehr lesen“ ein (etwa ab 4 bis 5 Zeilen, PDF-Kopf zählt mit).
  Antwortknöpfe senken die Hürde. Firmenname und PDF als erster Eindruck wecken Misstrauen (Persona-Test 19.11.2026,
  noch nicht gemessen).
