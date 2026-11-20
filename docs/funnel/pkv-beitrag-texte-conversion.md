# PKV-Funnel: Texte nach Conversion-Durchgang (20.11.2026)

Freigabe Ole 20.11.2026 („Freigabe ja, Conversion-Texter“). Leitsatz auf jeder Seite: „Ein PKV-Experte ruft dich an.“
Optimiert auf erreichte und terminierte Leads, nicht auf Menge. Rechtsgrundlage: `docs/recht/pkv-funnel.md`.
Keine Gedankenstriche. Gespeicherte Antwortwerte bleiben unverändert (Filter, Lead-PDF, Perspective-Felder), nur die
Beschriftungen ändern sich.

## Durchgehend
- Fortschritt „Frage {nr} von {von}“, „Zurück“.

## Start (Frage 1)
- Überschrift: „Über 650 € im Monat für deine PKV? Ein interner Tarifwechsel kann helfen“
- Text 1: „Die Beiträge in der privaten Krankenversicherung sind für viele Versicherte deutlich gestiegen, oft ohne bessere Leistungen.“
- Text 2: „Nach § 204 VVG darfst du bei deiner Versicherung in einen anderen Tarif wechseln, deine Altersrückstellungen werden angerechnet. Ein PKV-Experte prüft kostenlos, ob das für dich günstiger ist, und ruft dich mit dem Ergebnis an.“
- Vertrauenszeile: „Kostenlos und unverbindlich · Du bleibst bei deiner Versicherung · 7 kurze Fragen“
- Frage: „Bist du gesetzlich oder privat versichert?“ · Antworten „Privat versichert“ (Wert Privat) | „Gesetzlich versichert“ (Wert Gesetzlich)
- Überschrift B (nächster Test): „Hat deine PKV den Beitrag zum 1. Januar erhöht? Lass deinen Tarif kostenlos prüfen“

## Versicherung (Frage 2)
- „Bei welcher Versicherung bist du privat versichert?“ · Unterzeile „Geprüft wird ein Wechsel innerhalb deiner Versicherung.“

## Situation (Frage 3)
- „Was machst du beruflich?“ · Beschriftungen: Angestellt, Selbstständig, Beamtin/Beamter, In Ausbildung, Studium, Hausfrau/Hausmann, Schule, Nicht erwerbstätig, In Rente (Werte unverändert)

## Dauer (Frage 4)
- „Wie lange bist du schon bei deiner jetzigen PKV?“ · 0 bis 5 Jahre, 6 bis 10 Jahre, 11 bis 20 Jahre, Über 20 Jahre

## Beitrag (Frage 5)
- „Wie hoch ist dein Monatsbeitrag ungefähr?“ · Unterzeile „Ein runder Wert reicht, zum Beispiel aus deinem letzten Beitragsschreiben.“
- Platzhalter „z. B. 850“, Einheit „€ im Monat“, Fehler „Bitte gib deinen Monatsbeitrag in Euro ein, z. B. 850.“
- Offen (Ole/Sales): Gesamtbeitrag oder Eigenanteil? Bei Gesamtbeitrag Unterzeile: „Gemeint ist dein ganzer Beitrag, vor Abzug eines Arbeitgeberzuschusses.“

## Geburtsdatum (Frage 6)
- „Wann bist du geboren?“ · Unterzeile „Damit dein Experte passende Tarife findet.“

## Wohnort (Frage 7)
- „Wie lauten deine Postleitzahl und dein Wohnort?“ · Unterzeile „Damit wir einen passenden Experten für deine Region finden.“

## Zwischenseite
- „Passt! Deine Angaben eignen sich für eine Tarifprüfung.“
- „Ein PKV-Experte prüft kostenlos, ob und wie viel du sparen kannst, und ruft dich mit dem Ergebnis an. Dafür brauchen wir nur noch deinen Namen und deine Telefonnummer.“ · Knopf „Weiter“

## Name
- Überschrift „Spare bis zu 50 % deines PKV-Beitrags“ · Fußnote „Im Einzelfall möglich, abhängig von Tarif, Leistungen und Selbstbehalt. Ob und wie viel du sparen kannst, zeigt die Prüfung.“
- „Wie darf dich dein Experte ansprechen?“ · Vorname, Nachname · „Deine Daten werden vertraulich behandelt.“ · Knopf „Weiter“

## Kontakt (Absenden)
- „Unter welcher Nummer erreicht dich dein Experte?“ · Unterzeile „Er ruft dich mit deinem Ergebnis an, in der Regel innerhalb von 24 bis 48 Stunden.“
- Telefon zuerst: „Telefon (am besten Handy)“, Platzhalter „z. B. 0151 23456789“, Hinweis „Unter dieser Nummer ruft dich dein Experte an.“, Fehler „Bitte gib eine Nummer ein, unter der du gut erreichbar bist, z. B. 0151 23456789.“
- Dann „E-Mail“.
- Einwilligung direkt über dem Knopf (normale Schrift, nicht grau):
  „Mit Klick auf „Kostenlos prüfen lassen“ willige ich ein, dass pkv-tarife.com (Ole Kannapinn UG) meine Angaben an einen PKV-Experten aus der **Partnerliste** weitergibt und dieser mich zur Prüfung meines Tarifs per Telefon, E-Mail und WhatsApp kontaktiert. Seine Erstinformation erhalte ich elektronisch, auf Wunsch auf Papier. Widerruf jederzeit per E-Mail an {DATENSCHUTZ_EMAIL}. **Datenschutz**“
  (Partnerliste und Datenschutz als Links, neuer Tab. Knopfname im Text = Knopf.)
- Knopf „Kostenlos prüfen lassen“ · darunter klein „Das Absenden kostet nichts und verpflichtet dich zu nichts.“ · Lädt „Wird gesendet …“

## Danke-Seite
- „Danke, deine Anfrage ist angekommen.“ · „So geht es weiter:“
  1. „Ein PKV-Experte aus unserer Partnerliste ruft dich an, in der Regel innerhalb von 24 bis 48 Stunden.“
  2. „Halte dein Telefon bereit und geh auch bei unbekannten Nummern ran.“
  3. „Leg dir am besten dein letztes Beitragsschreiben bereit.“
- „Anruf verpasst? Ruf einfach zurück, dein Experte freut sich.“
- Steht der Abnehmer beim Absenden schon fest: Kasten „Dein Experte: {NAME}, {FIRMA}, Tel. {NUMMER}“.
- Später (L9, E-Mail „Dein Experte“): Betreff „Dein Experte für die PKV-Prüfung: {NAME}“; Text „Hallo {Vorname}, {NAME} von {FIRMA} ruft dich in den nächsten Tagen wegen deiner PKV-Prüfung an, und zwar von dieser Nummer: {NUMMER}. Speichere sie dir am besten gleich. Widerruf jederzeit per E-Mail an {DATENSCHUTZ_EMAIL}.“

## Abbruch gesetzlich
- „Danke für dein Interesse!“ · „Diese Prüfung gibt es nur für privat Krankenversicherte.“ · Knopf „Ich bin doch privat versichert“ (zurück zu Frage 1)

## Abbruch unter 650 €
- „Danke für deine Angaben!“ · „Für Beiträge unter 650 € bieten wir diese Prüfung leider nicht an. Hast du dich vertippt? Dann korrigiere deinen Beitrag.“ · Knopf „Beitrag korrigieren“

## Cookie-Hinweis
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
