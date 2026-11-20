# Eigener PKV-Funnel beitrag.pkv-tarife.com: interne Rechts- und Datenschutzprüfung

Stand: 20.11.2026. Interne Prüfung (Ole, 18.11.2026: bis Budget für eine Anwältin da ist, keine Anwaltsfreigabe
abwarten). Keine Rechtsberatung. Geprüft (Arbeitsstand, nicht committet): `src/lib/funnel/pkv-beitrag-texte.ts`,
`definition.ts`, `server.ts`, `host.ts`, `meta.ts`, `src/app/f/[funnel]/` (Seite, Cookie-Hinweis), `src/middleware.ts`
(Cookie pf_bid), `src/lib/capi/server.ts` (`postEventsData`), `src/lib/ppl/engine.ts` und `delivery.ts` (Weitergabe),
`docs/datenschutz.md`. Bezug: `docs/recht/hvk-pkv-anzeigen-2026-11-20.md` (gleiche Abnehmer, gleiche Bedingungen für
„kostenlos“).

## Kurzfassung

**Empfehlung:** Livegang erst nach den Auflagen L1 bis L4 (Einwilligungstext, Partnerliste, Einwilligungsnachweis je
Lead, pf_bid ohne Cookie). Die Seite ist technisch sauber gebaut (Pixel und Conversions API nur mit Einwilligung,
gleichwertige Knöpfe, keine Gesundheitsdaten); die roten Punkte liegen fast nur im Text der Einwilligung.
**Begründung:** Die Einwilligung nennt weder den Empfänger noch die Kanäle; damit ist jeder Anruf, jede WhatsApp und
jede E-Mail der Abnehmer wettbewerbswidrig (§ 7 Abs. 2 Nr. 1 und 2 UWG) und die Weitergabe ohne Rechtsgrundlage
(Art. 6 Abs. 1, Art. 7 DSGVO). Das trifft zuerst die Abnehmer (Bußgeld bis 300.000 €, § 20 UWG), dann über Reklamation
und Haftung uns.
**Risiko:** heute rot (2 Punkte), nach L1 bis L4 gelb (Rest: „bis zu 50 %“, von Ole getragen).
**Kosten:** 0 € extern; Technik etwa 1 Tag (CTO). **Stufe:** Bewertung C; Einwilligungstext, Seitentexte und
Datenschutzerklärung sind Rechtstexte bzw. Texte an Leads, Freigabe A (Ole).
**Ablauf nach AGENTS.md:** Die Textvorschläge unten sind schon kurz und mit Nutzen zuerst geschrieben; vor dem Bauen
macht der Conversion-Texter/UX einen Durchgang, danach prüft Recht, dass die Pflichtbestandteile (markiert mit P)
erhalten sind.

## Ampel

| Nr. | Punkt | Heute | Nach Auflagen |
|---|---|---|---|
| 1a | Einwilligung: Empfänger („ein spezialisierter PKV-Experte“) | rot | grün mit Partnerliste (L1, L2) |
| 1b | Einwilligung: Kanäle (Telefon, E-Mail, WhatsApp fehlen) | rot | grün (L1) |
| 1c | Einwilligung: Widerruf, Platzierung, Nachweis (§ 7a UWG, Art. 7 Abs. 1 DSGVO) | gelb | grün (L1, L3) |
| 1d | Nur Abnehmer mit Erlaubnis nach § 34d GewO, die intern wechseln | gelb | grün (L5) |
| 2a | „bis zu 50 %“ | rot ohne Beleg | gelb mit Beleg und Fußnote; Ole trägt das Risiko (Entscheidung 20.11.2026) |
| 2b | Startseite, Zwischenseite, Endseite, Knopf „Auswertung“ | gelb | grün (Texte unten) |
| 2c | „kostenlos“ | gelb | grün, wenn die Bedingungen aus dem HvK-Dokument für alle Abnehmer gelten (L5) |
| 3a | Cookie-Hinweis, Meta-Pixel | gelb | grün (Text, Link „Cookies“ zum Widerrufen) |
| 3b | Conversions API | grün (nur mit Einwilligung, so lassen) | grün |
| 3c | Besucher-Cookie pf_bid (30 Tage, ohne Einwilligung) | rot | grün ohne Cookie (L4) |
| 4a | Impressum und Datenschutz auf performancegrowth.de | gelb | grün (Geltung für die Domain, Abschnitt Funnel) |
| 4b | Anbieterkennung auf der Seite | gelb | grün (Fußzeile) |
| 4c | Erstinformation | grün für uns (kein Vermittler), Pflicht der Abnehmer | grün |

## 1. Einwilligung in Weitergabe und Kontakt

**Rechtslage.** Anruf bei Verbrauchern nur mit vorheriger ausdrücklicher Einwilligung (§ 7 Abs. 2 Nr. 1 UWG);
E-Mail und WhatsApp (elektronische Post) ebenso (§ 7 Abs. 2 Nr. 2 UWG). Die Einwilligung muss für den konkreten Fall,
in Kenntnis der Sachlage und für bestimmte Werbende erteilt werden (Art. 4 Nr. 11 DSGVO; BGH, Urteil vom 25.10.2012,
I ZR 169/10; BGH, Urteil vom 14.03.2017, VI ZR 721/15: Einwilligung muss erkennen lassen, welche Unternehmen werben
dürfen; EuGH, Urteil vom 01.10.2019, C-673/17, Planet49: aktive Handlung, informiert). Wer Verbraucher anruft, muss die
Einwilligung bei Erteilung angemessen dokumentieren und 5 Jahre ab jeder Verwendung aufbewahren (§ 7a UWG; Bußgeld
§ 20 Abs. 1, 2 UWG). Widerruf: Hinweis vor Abgabe, so einfach wie die Erteilung (Art. 7 Abs. 3 DSGVO). Für die
Weitergabe an den Abnehmer sind wir Verantwortlicher; Empfänger bzw. Kategorien sind bei Erhebung zu nennen
(Art. 13 Abs. 1 lit. e DSGVO); der Abnehmer informiert bei der ersten Mitteilung selbst (Art. 14 Abs. 3 lit. b DSGVO).

**Befund.**
- Empfänger: „ein spezialisierter PKV-Experte“ bzw. „den Berater“. Der Lead geht über den Pool an einen von mehreren
  Abnehmern (HvK und andere), geparkt bis 48 h auch an einen später freien. Ein unbenannter Empfänger erfüllt die
  Bestimmtheit nicht. **Rot.**
- Kanäle: nur „kontaktieren“. Die Danke-Seite kündigt einen Anruf an, die Abnehmer nutzen auch E-Mail und (mit unserer
  App) WhatsApp. Ohne Nennung der Kanäle keine „ausdrückliche“ Einwilligung je Kanal (auch offene Aufgabe zu WhatsApp).
  **Rot.**
- Widerruf: „(Jederzeit widerrufbar.)“ ohne Weg. Text steht klein unter dem Knopf, nach dem Schloss-Hinweis. **Gelb.**
- Knopf-Einwilligung ohne Häkchen ist zulässig (aktive Handlung, kein Kopplungsproblem, weil der Rückruf ohne Weitergabe
  nicht möglich ist, Art. 7 Abs. 4 DSGVO), wenn der Text vor dem Klick sichtbar ist: direkt über den Knopf.
- Nachweis: Bei der Zustellung geht `LeadSubscription.consentText` (Text am Bezug) und als Zeitpunkt
  `PoolLead.createdAt` mit (`delivery.ts`). Der tatsächlich angezeigte Funnel-Text und seine Fassung werden nicht am
  Lead gespeichert; weicht der Bezugstext ab, kann der Abnehmer die Einwilligung nicht belegen. **Gelb**, für § 7a UWG
  wichtig.
- Keine Gesundheitsfragen (Versicherer, Situation, Dauer, Beitrag sind keine Gesundheitsdaten, Art. 9 DSGVO). **Grün.**

**Auflagen.**
- **L1** Einwilligungstext unten (P: Empfänger mit Partnerliste, Kanäle, Widerrufsweg, Datenschutz-Link), direkt über
  dem Knopf.
- **L2** Öffentliche Partnerliste (z. B. performancegrowth.de/partner oder pkv-tarife.com/partner): alle Abnehmer, die
  PKV-Funnel-Leads bekommen können, mit Firma, Sitz und Registernummer. Kurz halten (Richtwert höchstens 10); neue
  Abnehmer erst nach Eintrag beliefern. Lange, wechselnde Listen tragen die Einwilligung nicht.
- **L3** Je Lead speichern und mit ausliefern: Einwilligungstext wörtlich (Fassung), Zeitpunkt, Kanäle, Funnel und
  Knopftext; nicht den Text vom Bezug. Aufbewahrung des Nachweises 5 Jahre (§ 7a UWG), Rest nach Löschkonzept.
- **L3b (empfohlen, auch Conversion):** Sofort nach dem Absenden E-Mail an den Lead „Dein Experte: Name, Firma,
  Telefonnummer“. Das erfüllt die Transparenz und erhöht die Erreichbarkeit (Lead erkennt die Nummer).
- **L5** Nur Abnehmer mit Erlaubnis als Makler oder Versicherungsberater (§ 34d Abs. 1 bzw. 2 GewO, Registerauszug
  vermittlerregister.info), die einen Wechsel innerhalb des eigenen Versicherers (§ 204 VVG) prüfen; Honorarberatung von
  Verbrauchern nur durch Versicherungsberater. Bedingungen für „kostenlos“ wie im HvK-Dokument schriftlich je Abnehmer.

## 2. Werbeaussagen (§ 5 UWG)

- **„Spare jetzt bis zu 50 % deines PKV-Beitrags“** (Schritt Name). Ole hat am 20.11.2026 entschieden, dass die Aussage
  bleibt; kein Veto, Risiko dokumentiert. Höchstwerbung mit „bis zu“ ist irreführend, wenn der Höchstwert nur in
  vernachlässigbar wenigen Fällen erreicht wird oder nur mit deutlich weniger Leistung (§ 5 Abs. 1, 2 Nr. 1 UWG); im
  Streit müssen wir die Grundlage darlegen. Gerade PKV-Tarifwechsel-Werbung mit Prozentzahlen wird von
  Verbraucherzentralen und Wettbewerbsverbänden beobachtet; wir haben die Zahl in Anzeigen schon gesperrt
  (HvK-Dokument, A4). Risiko: Abmahnung mittel (etwa 10 bis 25 % im ersten Jahr), Kosten je Fall etwa 1.500 bis 5.000 €
  plus Unterlassungserklärung. **Rot ohne Beleg, gelb mit:** (a) Beleg ablegen (anonymisierte Fälle der Abnehmer mit
  mindestens 50 %, Anteil an allen Prüfungen), (b) Fußnote unter der Überschrift (Text unten). Die Fußnote nimmt die
  Zahl nicht weg.
- **Startseite:** „Viele PKV-Kunden mit Beiträgen über 700 € zahlen unnötig zu viel“ ist eine unbelegte
  Tatsachenbehauptung. **Gelb**, Frage statt Behauptung.
- **Zwischenseite „Fast fertig!“:** Der Text ist vorsichtig genug; „wie viel Sparpotenzial du realisieren kannst“ setzt
  eine Ersparnis voraus, besser „ob und wie viel“. Der Knopf „Weiter zur Auswertung“ verspricht eine Auswertung, die
  nie angezeigt wird (danach folgt das Namensfeld). **Gelb.**
- **Endseite:** „Beiträge unter 650 € lassen sich leider nicht mehr optimieren“ ist sachlich falsch (wir prüfen sie nur
  nicht). **Gelb.**
- **Knopf „Jetzt Tarifoptimierung erhalten!“:** Der Nutzer erhält einen Rückruf mit Prüfung, keine Optimierung. Geringes
  Risiko; empfohlen „Kostenlos prüfen lassen“ (zugleich klarere Handlung). Wenn Ole den Knopf behalten will: als Fassung
  b testen. **Gelb gering.**
- **„Für die genaue Berechnung notwendig“** (Geburtsdatum, Wohnort): Wir berechnen nichts. Transparenz (Art. 5 Abs. 1
  lit. a DSGVO). **Gelb gering.**
- **„kostenlos“** (§ 3 Abs. 3 mit Anhang Nr. 20, § 5a UWG): zulässig, wenn die Prüfung bei jedem Abnehmer nichts kostet
  und das Absenden nichts kostenpflichtig auslöst (L5). **Gelb bis grün.**
- **„Deine Daten werden vertraulich behandelt“:** zulässig, weil die Weitergabe im Einwilligungstext steht. **Grün.**

## 3. Cookies, Meta-Pixel, Conversions API, pf_bid

- **Pixel** wird erst nach „Einverstanden“ geladen, die Knöpfe sind gleich gestaltet, Ablehnen auf erster Ebene
  (§ 25 Abs. 1 TDDDG, Art. 6 Abs. 1 lit. a DSGVO; BGH, Urteil vom 28.05.2020, I ZR 7/16, Cookie-Einwilligung II). Gut.
  Lücken: (a) Der Text nennt nur „Cookies … messen“, nicht dass beim Absenden unkenntlich gemachte (gehashte)
  Kontaktdaten an Meta gehen, dass Meta die Daten auch für eigene Zwecke nutzt (gemeinsame Verantwortung bei der
  Erhebung, EuGH, Urteil vom 29.07.2019, C-40/17, Fashion ID; Art. 26 DSGVO) und dass Daten in die USA gehen.
  (b) Kein Weg, die Entscheidung später zu ändern (Art. 7 Abs. 3 DSGVO). **Gelb.**
- **Conversions API** nur mit Einwilligung, wie gebaut. Ohne Einwilligung (berechtigtes Interesse) nicht empfohlen:
  gehashte Kontaktdaten bleiben personenbezogen, und Werbeauswertung bei Meta lässt sich kaum auf Art. 6 Abs. 1 lit. f
  stützen (EuGH, Urteil vom 04.07.2023, C-252/21, Meta Platforms). Die Antwort auf die offene Frage in `meta.ts`:
  **nein, bei Einwilligung bleiben.** Das spätere Qualitäts-Ereignis (mit Wert, bis 60 Tage) ist von der Einwilligung
  gedeckt, wenn Cookie-Text und Datenschutzerklärung es nennen. Datensparsamkeit (Art. 5 Abs. 1 lit. c): Geburtsdatum
  im Abgleich weglassen, wenn die Trefferquote es erlaubt (gelb gering). USA: Meta Platforms Inc. ist nach dem
  EU-US Data Privacy Framework zertifiziert (Art. 45 DSGVO, Angemessenheitsbeschluss vom 10.07.2023). Meta Business
  Tools Terms und Controller Addendum im Werbekonto akzeptiert halten. **Grün.**
- **pf_bid:** zufällige ID, 30 Tage, ohne Einwilligung gesetzt, für eigene Messung je Schritt, feste A/B-Fassung und
  Verknüpfung mit dem Lead. Ausnahme § 25 Abs. 2 Nr. 2 TDDDG greift nur, wenn das Speichern für den vom Nutzer
  gewünschten Dienst unbedingt erforderlich ist; Reichweitenmessung und A/B-Tests sind das nach Auffassung der
  Aufsichtsbehörden nicht (DSK, Orientierungshilfe für Anbieter von Telemedien). Der Ablauf selbst braucht den Cookie
  nicht (Schritte liegen im Browser-Speicher der Seite). Ein Sitzungs-Cookie (Laufzeit 0) ist ebenso Speichern im
  Endgerät. **Rot.**
  **L4:** Keinen Cookie setzen. Die ID je Seitenaufruf auf dem Server erzeugen und nur im Seitenzustand halten (wie
  heute über die Kopfzeile `x-funnel-besuch`); A/B-Zuteilung je Seitenaufruf. Folge: Wiederkehrer zählen doppelt, das
  ist vertretbar. Verarbeitung auf dem Server dann nach Art. 6 Abs. 1 lit. f DSGVO (pseudonym, in der
  Datenschutzerklärung nennen). Der Cookie `pf_meta` (nur die Cookie-Entscheidung) ist zulässig (§ 25 Abs. 2 Nr. 2).

## 4. Pflichtangaben

- **Impressum** (§ 5 DDG): Link auf jeder Seite, Ziel performancegrowth.de. Zulässig, wenn das Impressum dort
  ausdrücklich auch für beitrag.pkv-tarife.com gilt; sonst ist für den Nutzer nicht erkennbar, wer hinter der Marke
  „pkv-tarife.com“ steht. **Gelb**, ein Satz im Impressum genügt.
- **Datenschutz:** Link vorhanden; die Erklärung auf performancegrowth.de hat noch keinen Abschnitt zum Funnel (Inhalt
  unten). **Gelb.**
- **Anbieterkennung auf der Seite** (§ 5 Abs. 2 Nr. 3, § 5a UWG, Identität): Marke ohne Firma. Ein Satz in der
  Fußzeile macht klar, dass wir Kontakte herstellen und nicht vermitteln. **Gelb.**
- **Erstinformation** (§ 15 VersVermV): Pflicht der Vermittler beim ersten Geschäftskontakt, also der Abnehmer beim
  ersten Anruf. Wir sind Lead-Anbieter (Tippgeber): keine Beratung zu einzelnen Verträgen, feste Leadpreise ohne
  Abschlussprovision, keine Mitwirkung am Vertragsschluss; damit keine Versicherungsvermittlung (§ 34d Abs. 1 GewO,
  Art. 2 Abs. 1 Nr. 1 RL (EU) 2016/97). Bleibt so, solange die Seite keine Tarife empfiehlt und unser Entgelt nicht vom
  Abschluss abhängt. Abnehmer, die unsere App nutzen, brauchen für die elektronische Erstinformation eine Zustimmung
  (§ 16 VersVermV); die übernimmt der Einwilligungstext unten als einen Halbsatz. **Grün.**

## 5. Textvorschläge (Du-Form, ohne Gedankenstriche)

**Einwilligung, direkt über dem Knopf** (ersetzt `kontakt.einwilligung`; P = Pflichtbestandteil):
> Mit Klick auf „Kostenlos prüfen lassen“ willige ich ein, dass pkv-tarife.com (Ole Kannapinn UG) meine Angaben an
> einen PKV-Experten aus der [Partnerliste] (P) weitergibt und er mich dazu per Telefon, E-Mail und WhatsApp (P)
> kontaktiert. Seine Erstinformation bekomme ich elektronisch, auf Wunsch auf Papier. Widerruf jederzeit per E-Mail an
> [Datenschutz-Adresse] (P). [Datenschutz] (P)

**Knopf:** „Kostenlos prüfen lassen“ (bleibt es bei „Jetzt Tarifoptimierung erhalten!“, im Einwilligungstext genau
diesen Knopfnamen verwenden).

**Startseite:** Überschrift „Über 700 € im Monat für deine PKV? Ein interner Tarifwechsel kann helfen“ (wie die
vorhandene Fassung b). Erster Absatz statt der Behauptung: „Die Beiträge in der privaten Krankenversicherung sind für
viele Versicherte deutlich gestiegen, oft ohne bessere Leistungen.“

**Schritt Name, unter der Überschrift (Fußnote, klein):**
> Im Einzelfall möglich, abhängig von Tarif, Leistungen und Selbstbehalt. Ob und wie viel du sparen kannst, zeigt die
> Prüfung.

**Hinweis Geburtsdatum und Wohnort:** „Damit dein Experte passende Tarife findet.“

**Zwischenseite:** „… prüft ein Experte kostenlos für dich, ob und wie viel du sparen kannst. Mit dem Ergebnis meldet
er sich telefonisch bei dir.“ Knopf: „Weiter zum letzten Schritt“.

**Endseite Beitrag:** „Für Beiträge unter 650 € bieten wir diese Prüfung leider nicht an.“

**Danke-Seite (nur mit L3b):** zusätzlich „Name und Nummer deines Experten findest du gleich in deinem Postfach.“

**Cookie-Hinweis:**
> Dürfen wir Meta (Facebook) mit Cookies und, wenn du anfragst, mit unkenntlich gemachten Kontaktdaten zeigen, welche
> Werbung wirkt? Meta nutzt die Daten auch selbst, auch in den USA. [Mehr dazu]

Knöpfe bleiben „Nein danke“ und „Einverstanden“, gleich gestaltet.

**Fußzeile:**
> pkv-tarife.com ist ein Angebot der Ole Kannapinn UG (haftungsbeschränkt). Wir vermitteln keine Versicherungen,
> sondern bringen dich mit einem PKV-Experten zusammen.
> Impressum · Datenschutz · Cookies · Partnerliste

(„Cookies“ öffnet den Hinweis erneut und löscht bei „Nein danke“ die Meta-Cookies bzw. lädt den Pixel nicht mehr.)

**Impressum performancegrowth.de, ein Satz:** „Dieses Impressum gilt auch für pkv-tarife.com und
beitrag.pkv-tarife.com.“

**Datenschutzerklärung performancegrowth.de, neuer Abschnitt „PKV-Tarifprüfung (pkv-tarife.com)“**, Inhalt:
1. Verantwortlicher: Ole Kannapinn UG (haftungsbeschränkt), Anschrift, Kontakt Datenschutz.
2. Formular: Daten (Versicherungsart, Versicherer, Situation, Versicherungsdauer, Monatsbeitrag, Geburtsdatum, PLZ,
   Ort, Name, E-Mail, Telefon); Zweck: Weitergabe an einen PKV-Experten aus der Partnerliste zur kostenlosen Prüfung
   und Kontaktaufnahme per Telefon, E-Mail, WhatsApp; Rechtsgrundlage Art. 6 Abs. 1 lit. a DSGVO; Widerruf mit Wirkung
   für die Zukunft. Der Experte ist ab Erhalt eigener Verantwortlicher. Ohne Angaben keine Prüfung.
3. Prüfregeln: Gesetzlich Versicherte und Beiträge unter 650 € werden nicht weitergegeben; keine Entscheidung mit
   rechtlicher Wirkung (Art. 22 DSGVO nicht berührt).
4. Messung des Ablaufs ohne Cookie: pseudonyme ID je Seitenaufruf, Schritte, Herkunft der Anzeige (UTM, Kampagne),
   Fassung im A/B-Test, später Ergebnis beim Experten (erreicht, Termin, Abschluss); Zweck: Seite und Leadqualität
   verbessern; Art. 6 Abs. 1 lit. f DSGVO; Widerspruch Art. 21.
5. Meta-Pixel und Conversions API (nur mit Einwilligung, § 25 Abs. 1 TDDDG, Art. 6 Abs. 1 lit. a DSGVO): Cookies _fbp,
   _fbc; beim Absenden Ereignis „Lead“ mit gehashter E-Mail, Telefonnummer, Name, Geburtsdatum, PLZ, Ort, dazu IP und
   Browserkennung; nach Erreichen durch den Experten ein Ereignis mit dem Leadpreis. Empfänger Meta Platforms Ireland
   Ltd.; gemeinsame Verantwortung für die Erhebung (Art. 26 DSGVO, Vereinbarung von Meta, Link); Übermittlung an Meta
   Platforms Inc. (USA) auf Grundlage des Data Privacy Framework (Art. 45 DSGVO). Speicherung der Meta-Kennungen bei uns
   bis zum Qualitäts-Ereignis, höchstens 60 Tage. Widerruf über „Cookies“ in der Fußzeile.
6. Weitere Empfänger: Hosting (Railway), E-Mail-Versand (Resend), Fehlerüberwachung (Sentry, EU).
7. Speicherdauer: nicht weitergegebene Anfragen 30 Tage, geparkte 48 h; weitergegebene nach Löschkonzept; Nachweis der
   Einwilligung 5 Jahre (§ 7a UWG).
8. Rechte (Art. 15 bis 21 DSGVO), Beschwerde bei der Berliner Beauftragten für Datenschutz und Informationsfreiheit.

**Intern `docs/datenschutz.md` nachziehen:** Verzeichnis „Eigener PKV-Funnel“ (Rolle Verantwortlicher, Abschnitt 1 vom
„Prüfen“ auf „Verantwortlicher, Abnehmer eigener Verantwortlicher“), Löschfrist gelieferter Pool-Leads (fehlt heute),
Meta Ireland als Empfänger für Website-Ereignisse.

## Auflagen vor dem Livegang

| Nr. | Auflage | Wer |
|---|---|---|
| L1 | Einwilligungstext und Knopf nach Abschnitt 5, Text über dem Knopf | CTO, nach Conversion-Texter/UX |
| L2 | Partnerliste veröffentlichen, nur gelistete Abnehmer beliefern | Sales, CTO |
| L3 | Einwilligung je Lead (Text wörtlich, Fassung, Zeitpunkt, Kanäle) speichern und mit ausliefern; 5 Jahre Nachweis | CTO, Datenschutz |
| L4 | pf_bid ohne Cookie (ID je Seitenaufruf) | CTO |
| L5 | Abnehmer: Registerauszug § 34d GewO, interner Wechsel nach § 204 VVG, Prüfung kostenlos (Mail je Abnehmer) | Sales |
| L6 | Cookie-Text, Link „Cookies“ in der Fußzeile, Fußzeile mit Anbieter | CTO |
| L7 | Impressum-Satz und Datenschutzabschnitt auf performancegrowth.de (Lovable, Rechtstext: Freigabe Ole) | Ole, Recht |
| L8 | Beleg für „bis zu 50 %“ ablegen, Fußnote einbauen (Risiko trägt Ole) | Sales, CTO |
| L9 (empfohlen) | E-Mail „Dein Experte“ nach dem Absenden | CTO |
