# PKV-Funnel: Text-Review (Conversion-Texter), 21.11.2026

Auftrag Ole 21.11.2026 („Champions-League-Niveau“). Geprüft: Live-Stand https://app.performancegrowth.de/f/pkv-beitrag
(alle Schritte mit Playwright, iPhone-13-Ansicht, nicht abgesendet; Fehlerzustände über leere bzw. falsche Eingaben),
Texte aus `src/lib/funnel/pkv-beitrag-texte.ts` (Stand des Repos 21.11.2026), Danke-Seite nur aus dem Code (ohne
Absenden nicht erreichbar). Vergleich: Perspective https://leads.performancegrowth.de/beitrag-halbieren/ bis zur
Kontaktseite (alle POST-Anfragen blockiert, nichts abgesendet, keine Ereignisse gezählt). Rechtsrahmen
`docs/recht/pkv-funnel.md` (L1, L8). Screenshots: Scratchpad der Sitzung, Ordner `review-text/` (nicht im Repo).

**Empfehlung:** 14 Textänderungen aus der Tabelle unten in einem Durchgang umsetzen (beide Fassungen des laufenden Tests
`funnel_pkv_anlass` gleich betroffen), dazu das Advertorial auf der Startseite (Ole, 21.11.2026). Einwilligung im
Wortlaut lassen, nur die Widerrufsadresse tauschen. **Begründung:** Unser Funnel ist bei Erreichbarkeit und Recht klar
besser als Perspective; verloren geht Absendewille an drei Stellen: Startseite ohne Geschichte, Zwischenseite ohne
Bestätigung, Kontaktseite ohne Nutzen und ohne Antwort auf die Angst „Jetzt rufen mich zehn Leute an“.
**Risiko:** gering; „bis zu 50 %“ neu im Advertorial ist eine zweite Fundstelle derselben Aussage (L8, Risiko trägt
Ole). Eine Textänderung mitten im Test verschiebt die Anfragequote vorher/nachher, nicht den Vergleich a/b.
**Kosten:** 0 €, etwa 1 Stunde Technik. **Stufe:** A (Texte an Leads und Rechtstext-Nähe, Freigabe Ole).

## 1. Gesamturteil

| | Wir (pkv-tarife.com) | Perspective |
|---|---|---|
| Einstieg | Überschrift und Frage sofort, Erklärung erst unter der Frage (liest kaum jemand) | Langes Advertorial mit Problem, „Was viele nicht wissen“, Nutzen, dann Frage. Zieht Leser hinein, aber Sie/Du gemischt, Gedankenstriche, unbelegte „bis zu 50 %“ zweimal |
| Fragen | Klar, einheitlich Du, Abbruchseiten mit Rückweg | Sie/Du gemischt („Wie lange sind Sie bereits bei ihrer …“), „Wie ist deine aktuelle Situation?“ unklar |
| Beitragsfrage | Hinweis zum Gesamtbeitrag, Ausstieg erst nach Eingabe (gut: lädt nicht zum Hochschummeln ein) | Warnt schon vor der Eingabe „unter 650 € … nicht mehr optimieren“ (lädt zum Schummeln ein, sachlich falsch) |
| Zwischenseite | Sachlich, drei Absätze Fließtext, kein Lob | „Sehr gut! Wir können deinen Beitrag sehr wahrscheinlich stark reduzieren!“ Starke Belohnung, aber Ergebnisversprechen |
| Name/Kontakt | Telefon zuerst, Erwartung „Anruf in 24 bis 48 Stunden“, Einwilligung vollständig | Nutzen „Spare jetzt bis zu 50 %“ auf beiden Seiten oben; Telefonfeld zeigte bei uns 🇺🇸 +1 als Vorwahl (in unserem Testbrowser, englische Spracheinstellung; prüfen, ob echte deutsche Handys das auch sehen: kostet Erreichbarkeit) |
| Einwilligung | 52 Wörter, 13 px, 7 Zeilen, normale Schrift, über dem Knopf: rechtlich vollständig, gut lesbar | Grau, unter dem Knopf, ohne Empfänger und Kanäle: weniger Reibung, rechtlich rot |
| Danke-Seite | Drei Schritte, „geh auch bei unbekannten Nummern ran“, Experte mit Name und Nummer, wenn schon bekannt | (nicht geprüft, Absenden ausgeschlossen) |
| Vertrauen | Fußzeile mit Anbieter, Partnerliste, „Du bleibst bei deiner Versicherung“, Foto Beraterin mit Headset | Kaum (Logo und Bilder luden im Test nicht) |

**Was Perspective besser macht:** (1) Geschichte vor der Frage (Problem, Aha, Lösung). (2) Belohnung nach der letzten
Frage („Sehr gut!“). (3) Der Nutzen steht bis zum Absenden oben. (4) Knopf beschreibt ein Ergebnis, nicht einen Vorgang.
**Was wir besser machen:** Erreichbarkeit (Telefon zuerst, Anruf angekündigt, Danke-Schritte, Experte namentlich),
saubere Einwilligung, keine Versprechen, einheitliche Du-Form, gute Fehlermeldungen, Abbruchseiten mit Rückweg.

**Nebenfunde (kein Text, an CTO/Recht):**
- Cookie-Hinweis verdeckt auf dem Handy beim ersten Blick die erste Frage (Screenshot own-01). Kleiner oder unten bündig.
- Widerrufsadresse ist Oles persönliche Mailadresse. Eine Rolle wie `datenschutz@…` wirkt seriöser und schützt Ole
  (Einstellung `funnelDatenschutzEmail`; Wortlaut der Einwilligung bleibt, Fassung trotzdem hochzählen, L3).
- Partnerliste: Eintrag „Nico Yagci, Ansprechpartner Dennis Müller, Sitz Kassel“ zeigte im Test keine Registernummer
  (L2 verlangt sie). Recht/Sales prüfen.
- `docs/funnel/pkv-beitrag-texte-conversion.md` ist beim Beitragshinweis veraltet (live steht der Gesamtbeitrag-Hinweis).
- Die Zwischenseite enthält noch „wie viel Sparpotenzial du realisieren kannst“; Recht hatte „ob und wie viel“ verlangt
  (Abschnitt 2, gelb). Ist in der Tabelle unten mit gelöst.

## 2. Advertorial für die Startseite (Ole, 21.11.2026)

Aufbau wie Perspective, aber kurz (etwa 130 Wörter statt 230), Du-Form, ohne Gedankenstriche, ohne unbelegte
Behauptungen („Laut Experten …“, „zahlen unnötig zu viel“ entfallen), „bis zu 50 %“ nur mit Fußnote (L8). Die
Überschrift ist die Testüberschrift: Fassung a und b von `funnel_pkv_anlass` bleiben unverändert.

> **Anzeige**
>
> # Über 650 € im Monat für deine PKV? Ein interner Tarifwechsel kann helfen
> *(Fassung b: „Hat deine PKV den Beitrag zum 1. Januar erhöht? Lass deinen Tarif kostenlos prüfen“)*
>
> ✓ Kostenlos und unverbindlich ✓ Du bleibst bei deiner Versicherung ✓ 7 kurze Fragen
>
> [Bild]
>
> Die Beiträge in der privaten Krankenversicherung sind für viele Versicherte deutlich gestiegen. Oft, ohne dass die
> Leistungen besser geworden sind.
>
> Wer schon länger privat versichert ist, steckt häufig noch in einem älteren Tarif. Deine Versicherung bietet heute
> meist auch andere Tarife an, die günstiger sein können.
>
> ## Was viele nicht wissen
>
> Nach § 204 VVG darfst du innerhalb deiner Versicherung in einen anderen Tarif wechseln. Deine Altersrückstellungen
> werden dabei angerechnet. Du musst die Versicherung also nicht verlassen.
>
> Je nach Tarif, Leistungen und Selbstbehalt sind Ersparnisse von bis zu 50 %\* möglich. Ob und wie viel es bei dir
> ist, zeigt die Prüfung.
>
> **So geht es:** Du beantwortest 7 kurze Fragen. Ein PKV-Experte prüft deinen Tarif kostenlos und ruft dich mit dem
> Ergebnis an.
>
> Frage 1 von 7: **Bist du gesetzlich oder privat versichert?** [Privat versichert] [Gesetzlich versichert]
>
> <small>\* Im Einzelfall möglich, abhängig von Tarif, Leistungen und Selbstbehalt. Ob und wie viel du sparen kannst,
> zeigt die Prüfung.</small>

Hinweise zum Bau:
- Kennzeichnung „Anzeige“ statt „Advertorial“: jeder versteht es, und es ist die übliche Kennzeichnung für redaktionell
  aufgemachte Werbung (§ 5a Abs. 4 UWG). Klein, grau, über der Überschrift.
- Die Vertrauenszeile bleibt direkt unter der Überschrift (erster Blick auf dem Handy). Darunter ein kleiner Link
  „Direkt zu den Fragen“ (springt zur Frage), damit Eilige nicht scrollen müssen.
- Die Fußnote steht unter der Frage (Seitenende), Sternchen an der Zahl. Der heutige Text unter der Frage entfällt
  (steckt im Advertorial).
- Recht kurz gegenlesen lassen: „bis zu 50 %“ jetzt auch auf der Startseite (zweite Fundstelle derselben Aussage).
  Ohne Zahl geht der Absatz auch: „Je nach Tarif, Leistungen und Selbstbehalt kannst du oft spürbar sparen. Ob und wie
  viel, zeigt die Prüfung.“ Meine Empfehlung: mit Zahl und Fußnote, weil die Zahl der stärkste Haken der Anzeigen ist
  und sonst erst auf Seite 9 auftaucht.

## 3. Tabelle: heute → neu, warum

Nur Texte, die ich ändern würde. Gespeicherte Werte bleiben unverändert (nur Beschriftungen). Alle neuen Texte ohne
Gedankenstriche, Du-Form.

| Nr. | Stelle (Schlüssel) | Heute | Neu | Warum |
|---|---|---|---|---|
| 1 | `start.text` | 2 Absätze unter der Frage | entfällt, ersetzt durch Advertorial (Abschnitt 2) über der Frage | Text unter der Frage liest niemand; Geschichte vor der Frage holt Unentschlossene ab (Ole, 21.11.2026) |
| 2 | Label `Sonstige` (Versicherer) | Sonstige | Andere Versicherung | Alltagssprache, wie Perspective; Wert bleibt „Sonstige“ |
| 3 | Label `HALLESCHE` | HALLESCHE | Hallesche | Einheitliche Schreibweise der Liste, Großbuchstaben wirken wie Fehler |
| 4 | `beitrag.hinweis` | Gemeint ist dein ganzer Beitrag, vor Abzug eines Arbeitgeberzuschusses. Ein runder Wert reicht. | Dein ganzer Beitrag vor Arbeitgeberzuschuss. Ein runder Wert reicht, er steht in deinem letzten Beitragsschreiben. | Kürzer, und sagt, wo man nachschaut (45 bis 65, viele wissen den Betrag nicht genau) |
| 5 | `wohnort.hinweis` | Damit wir einen passenden Experten für deine Region finden. | Letzte Frage. Damit dein Experte deine Anfrage vollständig hat. | Die Partnerliste hat derzeit einen Experten; „für deine Region“ ist so nicht belegbar. „Letzte Frage“ zieht durch den Abschluss |
| 6 | `fastFertig.ueberschrift` | Fast fertig! Bei Beiträgen in deiner Höhe steckt oft viel Sparpotenzial. | Sehr gut! Deine Angaben passen für eine kostenlose Prüfung. | Perspectives stärkster Moment ist das Lob. Unseres ist wahr (privat, ab 650 €) und verspricht kein Ergebnis |
| 7 | `fastFertig.text` | 3 Absätze Fließtext (51 Wörter) | 3 Haken: „Ein PKV-Experte prüft kostenlos, ob und wie viel du sparen kannst.“ · „Er ruft dich mit dem Ergebnis an, in der Regel innerhalb von 24 bis 48 Stunden.“ · „Danach entscheidest du in Ruhe. Alles kostenlos und unverbindlich.“ | Scanbar auf dem Handy; setzt die Anruf-Erwartung ein zweites Mal; „ob und wie viel“ nach Recht (Abschnitt 2) |
| 8 | `fastFertig.knopf` | Weiter | Noch 2 Angaben | Nach „Frage 7 von 7“ fehlt jede Fortschrittsangabe; wer weiß, dass es nur noch 2 Schritte sind, bricht seltener ab |
| 9 | `name.ueberschrift` | Spare bis zu 50 % deines PKV-Beitrags\* | bleibt, zusätzlich auch auf der Kontaktseite oben (gleiche Fußnote) | Perspective hält den Nutzen bis zum Absenden sichtbar; bei uns fällt er genau an der entscheidenden Stelle weg |
| 10 | `kontakt.frage` | Unter welcher Nummer erreicht dich dein Experte? | {Vorname}, unter welcher Nummer erreicht dich dein Experte? | Persönliche Ansprache mit dem eben eingegebenen Namen erhöht Verbindlichkeit; ohne Vorname wie heute |
| 11 | `kontakt.telefonHinweis` | Unter dieser Nummer ruft dich dein Experte an. | Deine Nummer bekommt nur ein Experte, nicht mehrere. | Doppelt zur Unterzeile darüber. Die größte Angst bei Vergleichsformularen ist der Anrufsturm; die Aussage ist wahr (Partnerliste: „Du bekommst genau einen Experten“) |
| 12 | `kontakt.email` | E-Mail | E-Mail (für Name und Nummer deines Experten) | Gibt der E-Mail einen Zweck; die Mail „Dein Experte“ (L9) macht den späteren Anruf erkennbar. Nur so formulieren, solange die Mail eingeschaltet ist (`experteMailAn`), sonst „E-Mail“ lassen |
| 13 | `danke.ueberschrift` | Danke, deine Anfrage ist angekommen. | Danke, {Vorname}! Dein Experte ruft dich an. | Der wichtigste Satz für die Erreichbarkeit gehört in die Überschrift, nicht in Punkt 1 |
| 14 | `danke.schritte[1]` | Halte dein Telefon bereit und geh auch bei unbekannten Nummern ran. | Geh auch bei unbekannten Nummern ran, das ist wahrscheinlich dein Experte. Am besten speicherst du dir seine Nummer gleich ein. | Gibt den Grund, warum man rangehen soll; „Nummer speichern“ nur, wenn der Experten-Kasten angezeigt wird, sonst nur Satz 1 |
| 15 | `danke.verpasst` | Anruf verpasst? Ruf einfach zurück, dein Experte freut sich. | Anruf verpasst? Ruf die Nummer einfach zurück. | „freut sich“ klingt nach Verkauf; ohne Experten-Kasten weiß der Lead sonst nicht, welche Nummer |
| 16 | neu unter den Danke-Schritten (nur wenn die Mail „Dein Experte“ rausging) | (fehlt) | Name und Nummer deines Experten haben wir dir auch per E-Mail geschickt. | Von Recht vorgeschlagen (Abschnitt 5); zweiter Anker zum Wiedererkennen der Nummer |
| 17 | `endeGesetzlich.ueberschrift` | Danke für dein Interesse! | Diese Prüfung ist nur für Privatversicherte | Sagt sofort, warum es hier endet; „Danke für dein Interesse“ klingt nach Fehler. Text darunter dann: „Du bist doch privat versichert? Dann geht es hier weiter.“ |
| 18 | `endeBeitrag.ueberschrift` | Danke für deine Angaben! | Unter 650 € prüfen wir leider nicht | Gleiches Muster; Text darunter: „Hast du dich vertippt? Dann korrigiere deinen Beitrag.“ (Knopf bleibt) |
| 19 | `kontakt.fehlerSenden` | Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal. | Das hat leider nicht geklappt. Deine Angaben sind noch da, tippe bitte noch einmal auf „Kostenlos prüfen lassen“. | Nimmt die Angst, alles neu eintippen zu müssen; nennt die Handlung |

Bewusst **nicht** geändert:
- Startüberschrift a und b (Test läuft), Fragen 1 bis 4 und 6, Fehlermeldungen der Felder (klar, mit Beispiel).
- Knopf „Kostenlos prüfen lassen“ (gut und rechtlich grün; Alternative als Test, siehe H1) und „Das Absenden kostet
  nichts und verpflichtet dich zu nichts.“
- Einwilligung: 52 Wörter auf 7 Zeilen sind für den vollen Pflichtinhalt (Empfänger mit Partnerliste, drei Kanäle,
  Erstinformation, Widerrufsweg, Datenschutz) schon knapp. Kürzer ginge nur um 3 bis 4 Wörter („dieser mich zur Prüfung
  meines Tarifs“ → „er mich dazu“), das lohnt eine neue Fassung nicht. Schrift 13 px auf dem Handy ist an der unteren
  Grenze; 14 px würde ich mitnehmen, wenn die Seite ohnehin angefasst wird. Nur die Widerrufsadresse tauschen (oben).
- Cookie-Hinweis (Recht, L6).
- „Deine Daten werden vertraulich behandelt.“ (grün bei Recht, wirkt).

## 4. Zwei Hypothesen für den nächsten A/B-Test

Beide nach `funnel_pkv_anlass`, je eine Änderung, Haupt-Kennzahl `ppl_erreicht` je Besucher, Gegenprobe `funnel_lead`;
150 je Fassung, p unter 0,01, je 10 Treffer und 10 Nicht-Treffer (AGENTS.md). Vor dem Start mit dem A/B-Test-Labor
ausarbeiten und in `docs/firma/ab-tests.md` eintragen.

**H1 Knopf mit Anruf-Erwartung.** Fassung b: Knopf „Rückruf vom Experten anfordern“ statt „Kostenlos prüfen lassen“.
Hypothese: Wer aktiv einen Rückruf anfordert, rechnet mit dem Anruf und geht öfter ran; die Anfragequote sinkt
höchstens leicht, erreichte Leads je Besucher steigen. Achtung: Der Knopfname steht wörtlich in der Einwilligung,
also zweite Einwilligungsfassung (eigene `EINWILLIGUNG_VERSION` je Fassung, Recht prüft nur den Knopfnamen).

**H2 Ein Experte statt Anrufsturm.** Fassung b: auf der Kontaktseite direkt unter dem Telefonfeld fett „Deine Nummer
bekommt nur ein Experte, nicht mehrere.“ (Tabelle Nr. 11 wird dann nicht sofort Standard, sondern als Test gefahren).
Hypothese: Die Angst, nach dem Absenden von vielen Anbietern angerufen zu werden, ist bei 45- bis 65-Jährigen der
Hauptgrund, kurz vor dem Absenden abzubrechen oder eine falsche Nummer einzutragen. Die Zusage erhöht Absendungen und
den Anteil echter, erreichbarer Nummern.

Weitere Ideen für später: Zwischenseite mit Lob (Nr. 6) gegen heute als eigener Test, falls Ole Nr. 6 nicht direkt
freigibt; Nutzenüberschrift auf der Kontaktseite (Nr. 9); Beitragsfrage auf Platz 2 (steht schon im Lernbuch).
