# PKV-Funnel: Texte nach Conversion-Durchgang (20.11.2026), Redesign 21.11.2026

**Stand 21.11.2026 (Redesign, Ole: „Champions-League-Level, Usability 90+“):** Texte nach
`docs/funnel/review-2026-11-21/texte.md` mit Oles Ausnahmen: Einwilligung im Wortlaut unverändert
(`EINWILLIGUNG_VERSION` bleibt), Zwischenseite „ob und wie viel“, keine Telefonnummer des Experten auf der Danke-Seite
oder in der Mail, kein „Symbolbild“, E-Mail bleibt Pflichtfeld ohne „optional“, Partnerliste unverändert. Keine
Ausrufezeichen in Überschriften (CI). Quelle der Wahrheit bleibt `src/lib/funnel/pkv-beitrag-texte.ts`.

Freigabe Ole 20.11.2026 („Freigabe ja, Conversion-Texter“). Leitsatz auf jeder Seite: „Ein PKV-Experte ruft dich an.“
Optimiert auf erreichte und terminierte Leads, nicht auf Menge. Rechtsgrundlage: `docs/recht/pkv-funnel.md`.
Keine Gedankenstriche. Gespeicherte Antwortwerte bleiben unverändert (Filter, Lead-PDF, Perspective-Felder), nur die
Beschriftungen ändern sich.

## Durchgehend
- Fortschrittsbalken über alle 10 Schritte bis zum Absenden, ohne Zähler; beim Kontakt „Letzter Schritt“ und höchstens 90 %, voll (100 %) erst auf der Danke-Seite (Feinschliff 21.11.2026)
  (Screenreader: „Schritt {nr} von {von}“). „Zurück“ mit Pfeil.

## Start: Advertorial und Frage 1 (Ole, 21.11.2026)
Aufbau: „Anzeige“ (klein, über der Überschrift) · Überschrift (A/B-Test `funnel_pkv_anlass`, beide Fassungen
unverändert) · Einleitung · Sofortlink „Direkt zur kostenlosen Prüfung“ · Absatz 1 · Bild · Absätze 2 bis 4 · Frage-Karte.
Am Handy zusätzlich ein Sticky-Knopf „Zur kostenlosen Prüfung“, nur solange die Frage-Karte nicht zu sehen ist und nie
zusammen mit dem Cookie-Hinweis.
- Überschrift A: „Über 650 € im Monat für deine PKV? Ein interner Tarifwechsel kann helfen“
- Überschrift B: „Hat deine PKV den Beitrag zum 1. Januar erhöht? Lass deinen Tarif kostenlos prüfen“
- Einleitung: „Die Beiträge in der privaten Krankenversicherung sind für viele Versicherte deutlich gestiegen. Oft, ohne dass die Leistungen besser geworden sind.“
- Absatz 1: „Wer schon länger privat versichert ist, steckt häufig noch in einem älteren Tarif. **Deine Versicherung bietet heute meist auch andere Tarife an, die günstiger sein können.**“
- Absatz 2: „**Nach § 204 VVG darfst du innerhalb deiner Versicherung in einen anderen Tarif wechseln.** Deine Altersrückstellungen werden dabei angerechnet. Du musst die Versicherung also nicht verlassen.“
- Absatz 3: „Je nach Tarif, Leistungen und Selbstbehalt sind **Ersparnisse von bis zu 50 %\*** möglich.“ direkt darunter
  die Fußnote (L8): „\* Im Einzelfall möglich, abhängig von Tarif, Leistungen und Selbstbehalt. Ob und wie viel du sparen kannst, zeigt die Prüfung.“
- Absatz 4: „**So geht es:** Du beantwortest ein paar kurze Fragen, das dauert etwa 1 Minute. Ein PKV-Experte prüft deinen Tarif kostenlos und ruft dich mit dem Ergebnis an.“
- In der Karte über der Frage: „Kostenlos und unverbindlich · Du bleibst bei deiner Versicherung · Dauert etwa 1 Minute“
- Frage: „Bist du gesetzlich oder privat versichert?“ · Antworten „Privat versichert“ (Wert Privat) | „Gesetzlich versichert“ (Wert Gesetzlich)

## Versicherung (Frage 2)
- „Bei welcher Versicherung bist du privat versichert?“ · Unterzeile „Geprüft wird ein Wechsel innerhalb deiner Versicherung.“
- Kacheln: die 8 häufigsten (Debeka, DKV, Allianz, AXA, Signal Iduna, HUK-Coburg, Barmenia, Continentale; vorerst nach
  Marktgröße, mit den Perspective-Zahlen abgleichen). Darunter Suchfeld „Andere Versicherung suchen“ mit Liste aller
  übrigen; „Andere Versicherung“ (Wert „Sonstige“) immer als Ausweg am Ende, ohne Treffer: „Nicht dabei? Wähle „Andere Versicherung“.“
- Beschriftungen: „Sonstige“ → „Andere Versicherung“, „HALLESCHE“ → „Hallesche“ (Werte unverändert, Liste vollständig).

## Situation (Frage 3)
- „Was machst du beruflich?“ · Reihenfolge nach Zielgruppe: Angestellt, Selbstständig, Beamtin/Beamter, In Rente, Nicht erwerbstätig, Hausfrau/Hausmann, In Ausbildung, Studium, Schule (Werte unverändert)

## Dauer (Frage 4)
- „Wie lange bist du schon bei deiner jetzigen PKV?“ · 0 bis 5 Jahre, 6 bis 10 Jahre, 11 bis 20 Jahre, Über 20 Jahre

## Beitrag (Frage 5)
- „Wie hoch ist dein Monatsbeitrag ungefähr?“ · Unterzeile je Situation (Frage 3):
  - Angestellt: „Dein ganzer Beitrag vor Arbeitgeberzuschuss. Ein runder Wert reicht, er steht in deinem letzten Beitragsschreiben.“
  - Beamtin/Beamter: „Dein Eigenanteil nach Beihilfe. Ein runder Wert reicht, er steht in deinem letzten Beitragsschreiben.“
  - alle anderen: „Dein ganzer Monatsbeitrag. Ein runder Wert reicht, er steht in deinem letzten Beitragsschreiben.“
- Platzhalter „z. B. 850“, Einheit „€ im Monat“, Fehler „Bitte gib deinen Monatsbeitrag in Euro ein, z. B. 850.“ („z. B.“ mit geschütztem Leerzeichen)

## Geburtsdatum (Frage 6)
- „Wann bist du geboren?“ · Unterzeile „Damit dein Experte passende Tarife findet.“
- Fehler: leer/unvollständig „Bitte gib dein Geburtsdatum ein, z. B. 14.03.1975.“, unmögliches Datum „Dieses Datum gibt es
  nicht. Bitte prüfe Tag und Monat.“, Alter außerhalb 18 bis 99 „Bitte prüfe dein Geburtsjahr. Die Prüfung gibt es ab 18 Jahren.“

## Wohnort (Frage 7)
- „Wie lauten deine Postleitzahl und dein Wohnort?“ · Unterzeile „Letzte Frage. Damit dein Experte deine Anfrage vollständig hat.“
- Ort aus der PLZ: nicht gebaut (im Repo gibt es keine PLZ-Tabelle).

## Zwischenseite
Nah am Perspective-Original (Ole, 21.11.2026, ausdrücklich bestätigt), ohne Ergebnisversprechen, „ob und wie viel“ (Recht):
- „Fast fertig! Bei Beiträgen in deiner Höhe steckt oft viel Sparpotenzial.“ (Ausrufezeichen wie Perspective, Ausnahme von der CI)
- „Nachdem du dich auf der nächsten Seite eingetragen hast, prüft ein PKV-Experte kostenlos für dich, ob und wie viel Sparpotenzial du realisieren kannst. Mit dem Ergebnis meldet er sich telefonisch bei dir.“
- „Die Prüfung vorab und das persönliche Gespräch sind für dich kostenlos und unverbindlich.“
- „Danach entscheidest du ganz entspannt, ob du in deinem aktuellen Tarif bleibst oder einen günstigeren wählst.“ · Knopf „Weiter“

## Name
- Reine Frage, ohne Nutzenzeile und Fußnote (Feinschliff 21.11.2026: „bis zu 50 %“ nur noch auf Kontakt).
- „Wie darf dich dein Experte ansprechen?“ · Vorname, Nachname · „Deine Daten werden vertraulich behandelt.“ · Knopf „Weiter“

## Kontakt (Absenden)
- Oben kleine Nutzenzeile (Petrol, 15 px) „Spare bis zu 50 % deines PKV-Beitrags“ mit Fußnote „Im Einzelfall möglich, abhängig von Tarif, Leistungen und Selbstbehalt. Ob und wie viel du sparen kannst, zeigt die Prüfung.“ (L8, texte.md Nr. 9). Im Funnel nur hier, außerdem im Advertorial auf dem Start.
- „{Vorname}, unter welcher Nummer erreicht dich dein Experte?“ (ohne Vorname wie bisher) · Unterzeile „Er ruft dich mit deinem Ergebnis an, in der Regel innerhalb von 24 bis 48 Stunden.“
- Telefon zuerst: „Telefon (am besten Handy)“, Platzhalter „z. B. 0151 23456789“, Hinweis „Nur ein Experte bekommt deine Nummer.“ (gekürzt, Feinschliff 21.11.2026), Fehler „Bitte gib eine Nummer ein, unter der du gut erreichbar bist, z. B. 0151 23456789.“
- Dann „E-Mail“ (Pflichtfeld, Ole 21.11.2026; bewusst ohne Zusatz „für Name und Nummer deines Experten“, weil die Mail
  „Dein Experte“ nur bei selbst beratenden Abnehmern rausgeht und keine Nummer enthält). Telefon und E-Mail werden schon
  beim Verlassen des Felds geprüft; beim Absenden springt der Fokus aufs erste fehlerhafte Feld.
- Einwilligung direkt über dem Knopf (normale Schrift, nicht grau):
  „Mit Klick auf „Kostenlos prüfen lassen“ willige ich ein, dass pkv-tarife.com (Ole Kannapinn UG) meine Angaben an einen PKV-Experten aus der **Partnerliste** weitergibt und dieser mich zur Prüfung meines Tarifs per Telefon, E-Mail und WhatsApp kontaktiert. Seine Erstinformation erhalte ich elektronisch, auf Wunsch auf Papier. Widerruf jederzeit per E-Mail an {DATENSCHUTZ_EMAIL}. **Datenschutz**“
  (Partnerliste und Datenschutz als Links, neuer Tab. Knopfname im Text = Knopf.)
- Gestaltung der Einwilligung: 13 px, leiser Text, Adresse ohne Umbruch im Wort (Wortlaut und Adresse unverändert).
- Knopf „Kostenlos prüfen lassen“ · kein Satz darunter (Feinschliff 21.11.2026: „Kostenlos“ steht im Knopf) · Lädt mit Spinner „Wird gesendet …“
- Netzfehler: „Das hat leider nicht geklappt. Deine Angaben sind noch da.“ mit Knopf „Noch einmal senden“.

## Danke-Seite
- „Danke, {Vorname}. Dein Experte ruft dich an.“ (ohne Vorname „Danke. Dein Experte ruft dich an.“) · „So geht es weiter:“
  1. „Ein PKV-Experte aus unserer Partnerliste ruft dich an, in der Regel innerhalb von 24 bis 48 Stunden.“
  2. „Geh auch bei unbekannten Nummern ran, das ist wahrscheinlich dein Experte.“
  3. „Leg dir am besten dein letztes Beitragsschreiben bereit.“
- Nur wenn die Mail „Dein Experte“ rausging: „Den Namen deines Experten haben wir dir auch per E-Mail geschickt.“
- „Anruf verpasst? Ruf die Nummer einfach zurück.“
- Steht der Abnehmer beim Absenden schon fest: Kasten „Dein Experte: {NAME}, {FIRMA}“ (ohne Telefonnummer, Ole 21.11.2026).
- E-Mail „Dein Experte“ (L9): Betreff „Dein Experte für die PKV-Prüfung: {NAME}“, ohne Telefonnummer (lib/funnel/server.ts experteMail).

## Abbruch gesetzlich
- „Diese Prüfung ist nur für Privatversicherte“ · „Du bist doch privat versichert? Dann geht es hier weiter.“ · Knopf „Ich bin doch privat versichert“ (zurück zu Frage 1; oberes „Zurück“ ausgeblendet)

## Abbruch unter 650 €
- „Diese Prüfung gibt es ab 650 € im Monat“ · „Danke für deine Angaben. Steigt dein Beitrag einmal über 650 €, prüft ein Experte gern kostenlos für dich. Falls du dich vertippt hast, kannst du den Betrag ändern.“ · Knopf „Beitrag ändern“

## Cookie-Hinweis
- Kompakt unten (13 px, Knöpfe nebeneinander 44 px), Text unverändert (L6); am Start verdeckt er keine Antwort, weil die
  Frage-Karte unter dem Advertorial steht und unten Platz frei bleibt.
- „Dürfen wir Meta (Facebook) mit Cookies und, wenn du anfragst, mit unkenntlich gemachten Kontaktdaten zeigen, welche Werbung wirkt? Meta nutzt die Daten auch selbst, auch in den USA. **Mehr dazu**“
- Knöpfe „Nein danke“ | „Einverstanden“, gleich gestaltet.

## Fußzeile
- „pkv-tarife.com ist ein Angebot der Ole Kannapinn UG (haftungsbeschränkt). Wir vermitteln keine Versicherungen, sondern bringen dich mit einem PKV-Experten zusammen.“
- „Impressum · Datenschutz · Cookies · Partnerliste“ („Cookies“ öffnet den Hinweis erneut)

## Nicht verwenden
„Unabhängig“, „ohne Gesundheitsprüfung“, Bewertungen/Sterne/Kundenzahlen, „garantiert“, „Auswertung“, „Berechnung“,
Logos von Versicherern.

## Ideen für Tests (A/B-Test-Labor)
- Überschrift B mit Anlass „Beitragserhöhung zum 1. Januar“.
- Beitragsfrage von Platz 5 auf Platz 2 (frühes Aussteigen unter 650 €).
- Zusatzfrage „Wann erreicht dich dein Experte am besten?“ (braucht neues Feld in der Zustellung).

## Abbruch Debeka (Ole, 21.11.2026)
- Debeka ist nicht optimierbar: keine Kachel mehr (dafür Gothaer), Auswahl über die Suche führt auf die Endseite.
- „Bei der Debeka lohnt sich diese Prüfung leider nicht“ · „Durch den Tarifaufbau der Debeka lässt sich der Beitrag mit einem internen Tarifwechsel in der Regel nicht senken. Deshalb bieten wir die Prüfung für Debeka-Versicherte nicht an. Danke für dein Interesse.“ · Knopf „Andere Versicherung wählen“

## Abbruch Beamte (Ole, 21.11.2026)
- Beamte sind nicht optimierbar: Auswahl „Beamtin/Beamter“ (Frage 3) führt auf die Endseite.
- „Für Beamte lohnt sich diese Prüfung leider nicht“ · „Mit Beihilfe bist du nur für deinen Eigenanteil privat versichert. Ein interner Tarifwechsel senkt diesen Beitrag in der Regel nicht spürbar. Deshalb bieten wir die Prüfung für Beamtinnen und Beamte nicht an. Danke für dein Interesse.“ · Knopf „Andere Situation wählen“

## Feinschliff auf SUS 90+ (Ole, 21.11.2026: „Alle 4“)
Grundlage: docs/funnel/review-2026-11-21/neubewertung.md.
- Kontakt entlastet: Satz unter dem Knopf gestrichen, Telefon-Hinweis gekürzt. Einwilligung und Knopftext unverändert (Fassung pkv-beitrag-2026-11-20).
- „bis zu 50 %“ mit Fußnote nur noch auf Kontakt (und im Advertorial), Name ist eine reine Frage.
- Fortschritt: Kontakt 90 %, Danke-Seite 100 %.
- Schriftstufen 13/15/17/22/28 px (Gewichte 400/600; Wortmarke im Logo ausgenommen), „Mehr dazu“ im Cookie-Hinweis mit 44 px Tippfläche, weiche Trennstellen in langen Kachelwörtern (Selbst·ständig, erwerbs·tätig, Conti·nentale, ver·sichert, Aus·bildung; nur Anzeige, Werte unverändert).
