# SMS an Leads ohne WhatsApp bei ausgeschalteten E-Mail-Funktionen (22.11.2026)

Anlass: Kunden mit ausgeschalteten E-Mail-Funktionen (`Customer.mailFeaturesOff`, typisch Allianz-Agenturen wie Lohmann)
bekamen bei „kein WhatsApp“ (Meta 131026) gar keine Nachricht an den Lead; der Vermittler sah nur „bitte direkt anrufen“.
Ole (22.11.2026): „SMS einschalten, E-Mail bleibt aus, ja, aber Rückruf nur zu Geschäftszeiten.“
Interne Rechtsprüfung (Rechts- und Datenschutz-Agent, keine Anwaltsfreigabe, AGENTS.md 18.11.2026). Umsetzung:
`src/lib/mail-strecke/nur-sms.ts`, `src/lib/mail-strecke/server.ts`.

## Ergebnis: Ampel Gelb (gering), bauen mit Auflagen

### 1. UWG (§ 7 Abs. 2 Nr. 2, Abs. 3 UWG; SMS = elektronische Post)
- SMS ist „elektronische Post“, nicht „Telefon“. Werbung per SMS braucht eine vorherige ausdrückliche Einwilligung. Die
  Einwilligung im Lohmann-Formular nennt „WhatsApp, E-Mail oder Telefon“, SMS steht nicht ausdrücklich darin. Einwilligungen
  werden eng ausgelegt; sich allein auf „Telefon“ zu stützen, wäre angreifbar (Gelb).
- Tragend ist der zweite Grund: Die SMS ist die **Antwort auf die eigene Anfrage** des Leads. Er hat seine Handynummer im
  Formular angegeben, damit man ihn zu genau dieser Anfrage kontaktiert („Ihr Angebot und Ihren Termin erhalten Sie …“,
  „Sie auf diesen Wegen zu dieser Anfrage kontaktiert“). Eine kurze Nachricht nur zur Terminabstimmung dieser Anfrage ist
  keine unzumutbare Belästigung; dieselbe Begründung trägt bereits die Mail-Strecke (Kommentar in
  `src/lib/whatsapp/kein-whatsapp.ts`, Punkt 4). Die SMS ersetzt nur den Kanal, der technisch nicht ankam (WhatsApp).
- Restrisiko: Eine Terminanfrage eines Vermittlers kann als Absatzförderung (Werbung) gewertet werden. Gering, solange nur
  zur konkreten Anfrage, höchstens zwei Nachrichten und jederzeit abbestellbar. Abmahnrisiko im unteren Bereich.

### 2. DSGVO
- Rechtsgrundlage Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche Maßnahme auf Anfrage der betroffenen Person), daneben die
  Einwilligung aus dem Formular. Zweckbindung: nur diese Anfrage.
- seven communications GmbH & Co. KG (seven.io, Deutschland) ist als Unterauftragsverarbeiter in `src/lib/legal-texts.ts`
  (SUBPROCESSORS) und in den Datenschutzhinweisen der Vermittler (`src/lib/datenschutz-vermittler.ts`) genannt.
- Datenminimierung: SMS sind auf dem Sperrbildschirm sichtbar. Inhalt nur Name, Thema der Anfrage (Produktname, keine
  Gesundheitsangaben), Vermittler, Link, Rückrufnummer.

### 3. Versicherungsvermittlerrecht und KI-VO
- Erstinformation (§ 15 VersVermV): Die Antwortseite `/t/<token>` zeigt im Fuß die Anbieterangaben; die Erstinformation geht
  wie bisher mit der Terminbestätigung bzw. spätestens vor der Beratung raus. Die SMS selbst ist keine Beratung.
- KI-VO Art. 50: erste SMS nennt „KI-Assistent von …“ (wie die übrigen Texte der Strecke).

## Auflagen (alle umgesetzt)
1. Nur bei „kein WhatsApp“ (Meta 131026) und nur an **Handynummern**; Festnetz nie. Nur Leads mit eigener Anfrage
   (Erstanschreiben lief schon). Inhalt nur zur konkreten Anfrage, keine anderen Sparten, keine Werbung für anderes.
2. **Höchstens 2 SMS** je Lead (sofort bzw. zur nächsten Geschäftszeit, die zweite frühestens am zweiten Geschäftstag).
3. Senden **nur zu Geschäftszeiten** (Kalender-Zeiten des Kunden, sonst Mo bis Fr 9 bis 18 Uhr, ohne bundesweite Feiertage);
   die SMS nennt die Rückrufzeiten.
4. **Abmeldung** in jeder SMS („Abmelden über den Link“; Antwort mit „STOPP“ geht bei Namen als Absender technisch nicht),
   Abmeldelink sichtbar auf der Antwortseite, danach keine SMS mehr. Sperrliste (Nummer, alle Kanäle), Betroffenenrechte
   (Sperre nach `lib/dsgvo`) und Abmeldung per E-Mail werden vor jeder SMS geprüft.
5. Stopp bei jeder Reaktion (Seite geöffnet, Antwort, Buchung, Anruf erreicht), Lead nicht mehr offen, ruhender Kunde,
   Assistent aus, Pay-per-Lead und Produkte ohne automatische Nachrichten.
6. Absender wie bisher (Name des Vermittlers bis 11 Zeichen, sonst `SMS_ABSENDER`), keine Täuschung über den Absender.
7. Jede SMS steht mit Text im Verlauf beim Lead (Nachweis), ohne den persönlichen Link.

## Empfehlung (nicht Voraussetzung)
- In den Meta-Leadformularen bei der nächsten Textfassung „per WhatsApp, SMS, E-Mail oder Telefon“ schreiben (Einwilligung
  deckt SMS dann ausdrücklich ab, Ampel für neue Leads Grün). Stufe A, Freigabe Ole; Conversion-Texter vorher.
- Schalter `STRECKE_NUR_SMS=aus` stoppt den Versand sofort, falls eine Beschwerde kommt.
