# Bestandskunden-Modul: Umbauplan „Champions League“ (19.11.2026)

Rolle: CPO. Auftrag von Ole (19.11.2026): Bestandskunden-Zusatzmodul auf SUS 90+ und maximalen Umsatz für Vermittler bringen.
Quellen: Code im Worktree `/home/user/wt-bestand` (Branch `bestand-champions`, Stand c90e93b), Bewertungen von Sales,
UX/UI (SUS-Ist 48, Spanne 42 bis 55), Recht (Gesamturteil GELB, 2 x ROT) und Personas (Allianz-Vertreter, Makler,
Großagentur), alle vom 19.11.2026. Screenshots vorher: `scratchpad/bestand/vorher/` (Testdaten „Testagentur Bestand“, 120 Kunden).
Keine Live-Zahlen: Das Modul ist für Kunden aus (`BESTAND_MODULE_AVAILABLE = false`) und bleibt aus. Einschalten ist Stufe A (Ole).

## Entscheidung

Wir bauen diese Nacht **einen Kreislauf statt vieler Funktionen**: *Wen heute ansprechen (mit Euro) → ein Knopf → Nachricht
mit Terminlink → ein automatisches Nachfassen → Ergebnis.* Dazu die Einwilligung als zweite Chance auf derselben Seite,
weil sie jede andere Chance vervielfacht. Alles andere wird versteckt, zusammengelegt oder verschoben.

- Begründung: Heute ist das Modul ein Werkzeug für einmaliges Anschreiben, nach Kundenzahl sortiert, auf 9 Handy-Bildschirmen
  mit 12 Hauptknöpfen. Terminlink, Nachfassen und Euro-Rangfolge haben bei allen drei Personas 3/3 Zustimmung und kosten nur
  Entwicklungszeit.
- Risiko: mehr Kontakt bringt mehr Abmeldungen und rechtliche Angriffsfläche. Gegenmittel: höchstens 1 Nachfassen, gleiche
  Prüfung wie beim ersten Versand, 30-Tage-Abstand bleibt, Abmeldequote als Schutzlinie.
- Kosten: nur Entwicklungszeit, kein Budget. Stufe: Bauen B, Einschalten, Preis und Pakete A (Ole).
- Mehrumsatz (Schätzung, große Unsicherheit, keine echten Daten): erreichbare Basis x2 bis x3 durch Einwilligung,
  Antwort zu Termin +20 bis 40 % durch Terminlink, Antworten +30 bis 50 % durch ein Nachfassen.
- SUS-Ziel: 90+. Persona-Schätzung nach diesem Plan 85 bis 90; 90+ nur, wenn Paket 1 und 2 ohne Abstriche gebaut werden
  (eine Hauptaktion, kein grauer Knopf ohne Grund, Rechtliches hinter Klick). Die Persona-Lücken (Versand ohne Postfach,
  MVP-Import, Berater-Sicht) sind bewusst verschoben, siehe „Später“.

## Zielbild

„App öffnen, sehen wen ich heute ansprechen soll und warum, mit Euro-Potenzial, ein Tipp, fertig.“

Wer: Versicherungsvermittler (Allianz-Vertreter, Makler, Leitung einer Großagentur), unterwegs am Handy, 2 Minuten Zeit.
Eine Aufgabe: aus dem eigenen Bestand mit wenig Aufwand mehr Termine und Abschlüsse.
Wo: `/buyer/bestand` ist das Cockpit. Kein neuer Menüpunkt, keine neue Seite für Neues; Kampagne, Einwilligungen und Import
bleiben Unterseiten, werden aber kürzer.

## Hauptablauf

1. **Cockpit öffnen** (`/buyer/bestand`). Ganz oben ein Satz und eine Zahl:
   „Diese Woche zuerst: 22 Kunden ohne Hausrat · ca. 900 bis 1.900 € Provision möglich (Schätzung)“
   Ein primärer Knopf: **„22 Kunden anschreiben“**.
2. **Ein Tipp** öffnet die Kampagne mit Empfängern, Text und Kanal vorbelegt. Ein Bildschirm, ein klebender Knopf unten.
   Fehlt etwas, sagt der Knopf genau das („Erst Agenturvertrag bestätigen“, „Erst Postfach verbinden oder nur WhatsApp“).
3. **Nachricht** enthält den persönlichen Terminlink und die Bitte um Antwort mit Ja. Buchungen über den Link legen Lead
   und Termin mit Kampagnen-Zuordnung automatisch an.
4. **Nach 5 Werktagen** ohne Reaktion geht genau eine Erinnerung raus (Standard an, abschaltbar). Wer antwortet, aber keinen
   Termin hat, steht nach 2 Tagen als Aufgabe „Nachfassen per Nachricht“ in **Heute**.
5. **Ergebnis** als drei Zahlen (Antworten, Termine, Provision in €). Danach schlägt das Cockpit die nächste Chance vor.

Zweite Chance auf derselben Liste: **„+38 Kunden erreichbar mit Einwilligung“** mit Knopf „Einwilligung anfragen“.

## Seitenstruktur

### /buyer/bestand (Cockpit)
Reihenfolge von oben, 390 px Ziel: unter 3 Bildschirme bis zur Kundenliste.
1. Kopf: Titel „Bestand“ (Menü „Wachstum → Bestand“ prüfen und angleichen), rechts Symbol „Mehr“ (Import, Einwilligungen,
   Pakete, Einstellungen).
2. **Heute zuerst** (Hero-Karte): beste Chance nach erwartetem Ertrag, ein Satz, Euro-Spanne, primärer Knopf.
3. **Weitere Chancen**: Liste nach Euro sortiert, je Zeile Titel, Kundenzahl, Spanne, ein sekundärer Knopf „Ansehen“.
   Der bisherige Potenzial-Hinweis geht hier auf. Einwilligung ist eine Zeile dieser Liste.
4. **Hinweise** nur als Chip/Zeile mit Zahl („6 Einwilligungen prüfen“), Rechtstext im Aufklapper „Warum?“.
5. **Ergebnisse**: 3 Kacheln, Zeitraum-Chips bleiben.
6. **Kampagnen** als Karten: Name, Anlass als kleiner Chip, eine Zahl („6 Antworten, 2 Abschlüsse, 154 €“), genau eine
   Aktion je Zustand (läuft: Pausieren im Menü; pausiert wegen Kontingent: „Fortsetzen“ oder „Paket buchen“; Entwurf:
   „Starten“, Löschen im Menü).
7. **Kunden**: Suche ohne „Anzeigen“-Knopf, Filter-Chips (Alle, Ohne Einwilligung, Mit Chance, Angeschrieben), „Mehr laden“.
8. Kontingent erscheint nur, wenn unter 20 % frei sind oder eine Kampagne deshalb steht, mit Grund und einem Knopf.

Nach „Mehr“/Einstellungen: Kontingent und Pakete, Automatisch nachbuchen, Import rückgängig, Vergleichstabellen
„Nach Anlass / Nach Thema“, Erklärsätze zu 60-Tage-Zurechnung und „Meine Sparten“, CSV der Einwilligungslinks,
„Höchstens pro Tag“.

### /buyer/bestand/kampagne
Drei Blöcke auf einem Bildschirm:
- **Wer**: Zahl der Empfänger und Euro-Spanne; Ausschlüsse eingeklappt („12 ausgeschlossen, warum?“). Kanal „WhatsApp
  bevorzugt“ als Standard, Wechsel hinter „Kanal ändern“.
- **Nachricht**: eine Vorschau mit echtem Beispielkunden. Bearbeiten im Aufklapper, Platzhalter als Chips, keine zweite
  Vorschau.
- **Knopf** „22 Kunden anschreiben“, klebt am Handy unten. Agenturvertrag-Bestätigung als eigener kurzer Schritt (Sheet)
  vor dem ersten Start, nicht als Checkbox am Seitenende. Nachfassen als Schalter „Nach 5 Werktagen einmal erinnern“ (an).
- 0 Empfänger: statt Editor ein leerer Zustand „Noch niemand erreichbar“ mit „Einwilligung anfragen“ oder „Vertrag eintragen“.

### /buyer/bestand/kampagnen/[id]
Ergebnis als senkrechte Balkenliste (Angeschrieben → Antwort → Termin → Abschluss), Kanalaufteilung im Aufklapper,
Pausengrund mit Ausweg, „Antwort zuordnen“ hinter Knopf (Sheet), Entwurf mit „Starten“/„Löschen“.

### /buyer/bestand/einwilligungen
Oben eine Statuszeile („40 per WhatsApp, 27 per E-Mail erreichbar · 56 %“) und eine Hauptaktion „Einwilligung anfragen“.
Darunter Aufklapper: Pflichtangaben und § 7 Abs. 3, Widerspruchshinweis, Import-Prüfung, Ansprache, Sparten, Protokoll.
Tabelle je Anlass am Handy als Liste mit zwei Zahlen. Karte „Alle haben eingewilligt“ hinter „Mehr“.

### Gesperrter Zustand (LockedBestand)
Eigene Zahlen statt Fließtext: „Sie haben 74 Kunden mit nur einem Vertrag.“ Ein Knopf „Modul anfragen“/„Buchen“,
Preisliste und Bedingungen (`terms.ts`) im Aufklapper am Knopf. Preise unverändert (Stufe A).

## Begriffe (einheitlich)

| Alt | Neu |
|---|---|
| Ansprechen, Kampagne starten, Senden | Anschreiben |
| Lücke schließen | Weiteres Produkt anbieten |
| Trichter | Ergebnis |
| Kontingent | Nachrichten frei |
| KFZ ohne Hausrat | Kfz-Kunden ohne Hausrat |
| Allen ein Produkt anbieten | {n} Kunden ein weiteres Produkt anbieten |
| § 7 Abs. 3 UWG (in der Oberfläche) | nur im Aufklapper „Warum?“ |

## Texte an Bestandskunden

Immer beide Ansprachen über `a(an, du, sie)` (`src/lib/ansprache.ts`), ohne Gedankenstriche, nie „Garantie“, keine
unbelegten Behauptungen, kein „Sie haben keine …“, nie Euro oder Provision. Bei Kranken, Leben, BU, Unfall und Pflege im
Betreff und in WhatsApp-Platzhaltern neutral „Ihr Vertrag“.

- **Cross-Sell** (WhatsApp-Freitext im 24-h-Fenster und Mail; ersetzt „Viele meiner Kunden haben … eine Lücke“).
  Sie: „Guten Tag Frau Muster, Ihre Kfz-Versicherung läuft über mich, eine Privathaftpflicht habe ich bei Ihnen noch nicht
  notiert. Soll ich kurz prüfen, ob Sie dort gut versorgt sind? Termin wählen: {terminlink} oder einfach mit Ja antworten.“
  Du: „Hallo Erika, deine Kfz-Versicherung läuft über mich, eine Privathaftpflicht habe ich bei dir noch nicht notiert.
  Soll ich kurz prüfen, ob du dort gut versorgt bist? Termin wählen: {terminlink} oder einfach mit Ja antworten.“
  Betreff Sie „{thema}: Sind Sie schon versorgt?“, Du „{thema}: Bist du schon versorgt?“.
- **Ablauf/Wechsel**. Sie: „Ihre {thema} verlängert sich am {datum}. Bis dahin kann man Beitrag und Leistung noch gut
  vergleichen. Soll ich das kurz für Sie prüfen? Termin wählen: {terminlink}“. Du entsprechend. Betreff „Ihre {thema}:
  Verlängerung am {datum}“ / „Deine {thema}: Verlängerung am {datum}“. Ohne Datum bleibt der bisherige Satz ohne „Termin“.
- **Jahresgespräch**. Sie: „Sie haben {anzahl} Verträge bei mir. Einmal im Jahr lohnt ein kurzer Blick, ob Beitrag und
  Leistung noch zu Ihrer Situation passen. 15 Minuten am Telefon reichen: {terminlink}“. Betreff „Ihr Jahrescheck:
  15 Minuten“ / „Dein Jahrescheck: 15 Minuten“.
- **Geburtstag** (nur mit Einwilligung, zurückhaltend, Persona 1/3): Sie: „Guten Tag Frau Muster, herzlichen Glückwunsch
  zum Geburtstag und alles Gute für das neue Lebensjahr! Hat sich bei Ihnen etwas verändert, etwa Umzug, Familie oder Job?
  Dann schauen wir gern kurz gemeinsam drauf.“ Kein Produkt, keine Altersaussage. WhatsApp-Vorlage erst nach neuer
  Meta-Freigabe; bis dahin nur Mail und Freitext im Fenster.
- **Nachfassen** (neu). Sie: „Guten Tag Frau Muster, kurz nachgefragt zu meiner Nachricht von {wochentag}: Passt Ihnen ein
  kurzes Telefonat? Termin wählen: {terminlink}. Kein Bedarf? Dann reicht ein kurzes Nein.“ Du entsprechend.
- **Einwilligungsbitte als P.S.** in zulässigen Mails (§ 7 Abs. 3, `consentRequestByMailAllowed`): „Soll ich Sie auch zu
  anderen passenden Themen informieren? Ein Klick genügt: {einwilligungslink}“ / „Soll ich dich auch …“.
- **Einwilligungsseite** `/einwilligung/[token]`: Titel „Darf ich mich melden, wenn es bei Ihren Verträgen etwas Wichtiges
  gibt?“, Unterzeile „Wählen Sie, wie Sie informiert werden möchten.“, Knopf „Ja, so informieren“. Pflichttext
  (`consentQuestion`) mit Widerruf und Datenschutzlink bleibt direkt über dem Knopf. Kästchen starten leer.
- **Mail-Fuß** (zwei Absätze statt drei): „Sie erhalten diese E-Mail als Kundin bzw. Kunde von {Firma}. Sie können der
  Werbung per E-Mail jederzeit widersprechen, es entstehen nur die üblichen Übermittlungskosten: {Abmeldelink}“, darunter
  Impressum.

Empfehlungsbitte und Steuer-Anlass bleiben in dieser Runde unverändert (siehe „Später“).

## Euro-Schätzung (nur intern)

Erwartete Provision je Chance = erreichbare Empfänger × Antwortquote × Abschlussquote × Provision je Sparte
(eigene Sätze aus `src/lib/provision.ts`/`provision-server.ts`, sonst vorsichtiger Standard). Quoten: anfangs feste
vorsichtige Standards (z. B. Antwort 8 bis 15 %, Abschluss 25 bis 40 % der Antworten), ab 30 eigenen Empfängern aus
`statistik.ts`. Anzeige immer als gerundete Spanne mit „Schätzung“, nie als Versprechen. Euro bestimmt nur die
Reihenfolge, nicht das Produkt (Bedarf vor Provision, § 48a VAG). Ausschließlichkeitsvertreter: nur Sparten nach `mayOffer`.

## Kennzahlen

Im Cockpit sichtbar (höchstens 3): Provision aus dem Bestand im Zeitraum, Termine aus dem Bestand, „Für Angebote
erreichbar: x %“ (Ziel 40 %).
Im Hintergrund (Statistik, Diagnose `nutzung-woche` nach dem Einschalten): neue Einwilligungen je Woche und Rate
Link geöffnet zu bestätigt; Quote angeschrieben zu Termin und Termin zu Abschluss je Anlass und Kanal; Euro je
angeschriebenem Kunden je Anlass; Sparten je Kunde; Antworten ohne Termin älter als 2 Tage (Ziel 0); Abmeldequote je
Kampagne (über 2 %: Text oder Anlass prüfen). Haupt-KPI bleibt Abschlüsse je Vermittler und Monat.

## Was wegfällt oder versteckt wird

- Weg von der Startseite: Kontingent-Balken (außer bei Engpass), 2 x „Paket dazubuchen“, gelber Rechtsabsatz, getrennter
  Potenzial-Hinweis, „Automatisch nachbuchen“, „Import rückgängig“, Vergleichstabellen, Erklärsätze.
- Kampagne: Kanal-Kacheln als erster Block, zweite Vorschau, rohe Platzhalter, 4 Warnkästen am Ende, Pflicht-Checkbox
  am Seitenende, „Höchstens pro Tag“ (Standard der App, Feld in Einstellungen).
- Einwilligungen: Empfehlung „E-Mail-Signatur“ (rechtlich heikel, gestrichen), Absätze mit Rechtstext (Aufklapper),
  CSV als Hauptaktion (nach „Mehr“).
- Detail: offenes Formular „Antwort zuordnen“, Tabelle „Trichter“.
- Nicht gestrichen (rechtlich tragend): Pflichtfeld Wortlaut beim Nachweis, Bestätigungshäkchen, Abmeldelink und Impressum,
  Datenschutzlink, Double-Opt-in-Mail, Bedingungen am Kaufknopf.

## Rechtliche Auflagen (aus der Recht-Bewertung, verbindlich)

- **P0-1 (ROT)**: `src/app/einwilligung/[token]/page.tsx:90` `defaultChecked` entfernen, beide Kanäle starten leer
  (EuGH C-673/17 Planet49). Vor allem anderen.
- **P0-2 (ROT)**: Widerspruchshinweis nach § 7 Abs. 3 Nr. 4 UWG in `campaignMailFooter` (`src/lib/bestand/kampagnen-mail.ts`),
  beide Ansprachen.
- Versandsperre ohne Impressum auch in `runCampaigns`/`campaignMailFor` (`campaigns.ts`), nicht nur auf der Startseite.
- Cross-Sell-Freitext ohne „Viele meiner Kunden haben … eine Lücke“ (`campaigns.ts` `campaignText`); WhatsApp-Vorlagen
  (`templates.ts`) nur mit neuer Version und Meta-Freigabe ändern, nicht in dieser Runde einreichen.
- Einwilligungs-P.S. nur in Mails, die `consentRequestByMailAllowed` bestehen; nie in der Double-Opt-in-Mail und nie in
  Service-Mails. Link per WhatsApp nur als Antwort im vom Kunden geöffneten 24-h-Fenster.
- Nachfassen: höchstens 1, gleicher Anlass, gleiche Rechtsgrundlage, gleiche Prüfung vor dem Versand (Abmeldung, Sperre,
  `emailDecision`/`whatsappDecision`), kein Nachfassen nach Antwort, „Kein Bedarf“ oder „Stopp“; WhatsApp außerhalb des
  Fensters nur mit freigegebener Vorlage; ausdrücklich geregelte Ausnahme vom 30-Tage-Abstand, danach Abstand neu. Kein Druck.
- Aufgaben in Heute heißen „Nachfassen per Nachricht“; Anrufen nur bei Rückrufwunsch oder Telefon-Einwilligung (§ 7 Abs. 2
  Nr. 1 UWG), Rückrufwunsch mit Zeitpunkt, Kanal und recipientId protokollieren (§ 7a UWG).
- Terminlink ändert die Rechtsgrundlage nicht, nur in ohnehin zulässigen Nachrichten.
- Euro und Provision nie in Kundentexten. Gesundheitsspalten bleiben verworfen (`rows.ts:112`).
- Neue Anlässe (falls gebaut: `nachfassen` als Schritt, `kfz_wechsel`) in `NEEDS_CONSENT_REASON`/`isSameNeedOccasion`
  ausdrücklich einordnen, je ein Test „ohne Einwilligung“.
- Rechtlich bedingte Texte vor dem Bauen durch einen Conversion-Texter-Hilfsagenten, danach Pflichtangaben-Check
  (AGENTS.md, Regel vom 18.11.2026). Bei Änderung von `consentQuestion` eine Versionskonstante mitprotokollieren.
- ROT ohne weitere Voraussetzung und deshalb nicht gebaut: Zinsbindung ohne § 34i, Tarifwechsel Leben/BU/PKV/Pflege.

## Später (bewusst nicht in dieser Nacht)

Versand ohne Postfach (Allianz), MVP-/BiPRO-Import und Vollmacht-Anlass (Makler), Berater-Zuordnung, Rollen und Zahlen je
Berater (Großagentur), Empfehlungsbitte im richtigen Moment (hängt am ausgeblendeten Empfehlungsmodul), Steuer-Anlass
Jahresende, Upsell gleiche Sparte (nach Textprüfung Recht), Reaktivierung/Rückgewinnung, QR-Code-PDF, Lebensphasen-Vorschläge
je Kunde, Kunden-Sheet mit Verträgen und Verlauf, WhatsApp-Vorlagen v5 bei Meta. Als Aufgaben vorschlagen, wenn Ole den
Teamplan freigibt.

## Beim späteren Einschalten nötig (Stufe A, Ole)

- `BESTAND_MODULE_AVAILABLE` in `src/lib/bestand/sichtbar.ts` auf true, Neuigkeiten-IDs dort prüfen.
- P0-1 und P0-2 erledigt (in dieser Runde geplant), `docs/datenschutz.md:114-123` auf das heutige Modell nachgezogen,
  AVV-Ergänzung „Vertragsdaten von Bestandskunden“ entschieden, Muster-Datenschutztext für Vermittler, Bewertung als
  `docs/recht/bestand-champions.md`.
- ProductUpdate-Migration `prisma/migrations/<zeitstempel>_neuigkeit_bestand/` (kind `neu`, audience `software`, Sie-Form,
  Weg **Wachstum → Bestand**, ohne Versprechen, ohne „Garantie“, `pushedAt` NULL).
- Eintrag in `docs/webseite-offen.md` (Seite /software, Du-Form, „Bestandskunden gezielt anschreiben“, nur Verfügbares).
- Erklärvideos mit `python3 tools/erklaervideos/betroffen.py` prüfen; das Modul darf bis dahin in keinem Video vorkommen.
- Hilfe-Einträge und Tipps freigeben, WhatsApp-Vorlagen mit neuem Text bei Meta einreichen.
- Probemonat bzw. Preisstaffel je Berater (Persona-Ergebnis) als eigene Entscheidung von Ole.

## Umsetzung in Paketen (nacheinander, je ein Agent)

Gemeinsame Regeln: Arbeit nur in `/home/user/wt-bestand`; Modul bleibt aus; kein ProductUpdate und kein Webseiten-Eintrag;
keine Schemaänderung ohne zwingenden Grund; je Paket Screenshots 390 px und 1280 px (Testdaten `tools/bestand/testdaten.ts`),
SUS-Schätzung mit Liste der behobenen Punkte; `npx tsc --noEmit`, `npx eslint src tests --quiet`, `npx vitest run tests/unit`
grün; Commit je Paket.

1. **Recht P0 und Cockpit „Heute zuerst“** (größte Wirkung: erster Blick, Euro, eine Hauptaktion, Rechtsrisiko weg).
2. **Kampagne in einem Bildschirm, neue Texte mit Terminlink**.
3. **Einwilligung als Umsatzhebel**.
4. **Ein automatisches Nachfassen und warme Kontakte in Heute**.

### Paket 1: Recht P0 und Cockpit „Heute zuerst“
Ziel: Rechtsrisiko vor jedem Test weg; erster Blick zeigt die beste Chance mit Euro und genau eine Hauptaktion.
- P0-1: `src/app/einwilligung/[token]/page.tsx` ohne `defaultChecked`; Texte der Seite kürzen (Titel, Unterzeile, Knopf „Ja, so informieren“), Pflichttext bleibt über dem Knopf.
- P0-2: `src/lib/bestand/kampagnen-mail.ts` `campaignMailFooter` mit Widerspruchshinweis, zwei Absätze, beide Ansprachen; Impressum-Sperre zusätzlich beim Versand in `src/lib/bestand/campaigns.ts` (`campaignMailFor`/`runCampaigns`).
- Euro-Schätzung als reine Funktion (neu `src/lib/bestand/potenzial.ts`): Empfänger × Antwortquote × Abschlussquote × Provision je Sparte aus `src/lib/provision.ts`, Spanne gerundet, Standardquoten, ab 30 eigenen Empfängern aus `statistik.ts`; `opportunities()` in `campaigns.ts` liefert Euro-Spanne und sortiert danach; `potentialHint` geht in der Liste auf; Einwilligungs-Chance als eigener Eintrag.
- `src/app/buyer/bestand/page.tsx` neu ordnen: Hero „Heute zuerst“ mit einem primären Knopf, Chancenliste mit sekundären Knöpfen, Hinweise als Chips mit Aufklapper, 3 Ergebnis-Kacheln, Kampagnenkarten mit einer Aktion je Zustand, Rest hinter „Mehr“. Kontingent (`src/components/bestand/quota-bar.tsx`) nur bei unter 20 % frei oder Pause.
- Fehler beheben: pausierte Kampagne bei freiem Kontingent zeigt „Fortsetzen“ (oder setzt automatisch fort), Warnung „Danach pausieren“ nur bei echtem Engpass; Entwurf mit „Starten“/„Löschen“.
- Begriffe nach Tabelle angleichen (Cockpit, `cross-sell-angebot.tsx`, Kampagnenliste); doppelte Titel „Anlass: Anlass“ vermeiden.
- Tests: `tests/unit/bestand-potenzial.test.ts` (Sortierung nach Euro, Spanne, mayOffer greift, keine Euro-Werte in Kundentexten), Footer-Test mit Widerspruchssatz in beiden Ansprachen, Test Einwilligungsseite ohne Vorauswahl (oder Prüfung im Code).
- Abnahme: 390 px zeigt Hero mit Euro-Spanne und genau einem primären Knopf im ersten Bildschirm; Seite bis zur Kundenliste unter 3 Bildschirme (heute 9); höchstens 1 primärer Knopf sichtbar; kein Kontingent bei 987/1.000 frei; keine Kampagne „pausiert“ ohne Grund und Ausweg; Mail-Fuß enthält Widerspruchshinweis; Einwilligungskästchen leer; SUS-Schätzung Cockpit mindestens 85; Prüfungen grün.

### Paket 2: Kampagne in einem Bildschirm, neue Texte mit Terminlink
Ziel: Vom Tipp im Cockpit bis zum Versand ein Bildschirm, ein Knopf; jede Nachricht endet mit Terminlink.
- `src/app/buyer/bestand/kampagne/page.tsx` als drei Blöcke (Wer, Nachricht, Knopf), Kanal-Standard „WhatsApp bevorzugt“ hinter „Kanal ändern“, Ausschlüsse eingeklappt, eine Vorschau mit Platzhaltern als Chips, klebender Knopf am Handy, Knopftext nennt Fehlendes; Agenturvertrag als Sheet vor dem ersten Start (Text und `AGENT_CONFIRM_VERSION` aus `src/lib/bestand/befugnis.ts` unverändert); „Höchstens pro Tag“ in Einstellungen; leerer Zustand bei 0 Empfängern mit „Einwilligung anfragen“/„Vertrag eintragen“.
- Texte in `src/lib/bestand/campaigns.ts` (`campaignText`) und `src/lib/bestand/kampagnen-mail.ts` (Betreff, Text) nach Abschnitt „Texte“, beide Ansprachen, ohne Gedankenstriche, Personenversicherungen neutral; Cross-Sell-Freitext ohne „Viele meiner Kunden …“. WhatsApp-Vorlagen in `src/lib/whatsapp/templates.ts` nicht ändern.
- Platzhalter `{terminlink}`: vorhandener Buchungslink des Vermittlers (`/book/<slug>`); ohne Buchungslink entfällt der Satz und der Text endet mit „einfach mit Ja antworten“. Zuordnung zur Kampagne über signierten Parameter, nur wenn ohne Schemaänderung möglich, sonst vormerken.
- `src/app/buyer/bestand/kampagnen/[id]/page.tsx` und `src/components/bestand/funnel-table.tsx`: Ergebnis als senkrechte Balkenliste, Kanäle im Aufklapper, Pausengrund mit Ausweg, `reply-form.tsx` hinter Knopf (Sheet).
- Tests: `tests/unit/gedankenstriche.test.ts` bleibt grün; neue Fälle für Texte (beide Ansprachen, Terminlink an/aus, kein „Garantie“, kein „Lücke“-Satz, neutraler Betreff bei Personenversicherung).
- Abnahme: Kampagne 390 px unter 2 Bildschirme (heute 4.264 px); Knopf immer sichtbar und nie grau ohne Grund; genau eine Vorschau; keine rohen `{…}` sichtbar; Detail ohne waagerechtes Scrollen; SUS-Schätzung Kampagne mindestens 90; Prüfungen grün.

### Paket 3: Einwilligung als Umsatzhebel
Ziel: „Für Angebote erreichbar“ von geschätzt 10 bis 15 % Richtung 30 bis 40 %, ohne Rechtsrisiko.
- Cockpit-Kennzahl „Für Angebote erreichbar: x %“ mit Ziel 40 % und Chance „+n Kunden erreichbar mit Einwilligung“ (Paket 1 legt den Platz an).
- „Einwilligung anfragen“ als eine Aktion für alle, die `consentRequestByMailAllowed` bestehen (vorhandene Logik `requestConsent` in `src/lib/bestand/einwilligung-server.ts`, Double-Opt-in, gedrosselt über `mail-drossel.ts`); Leitung bestätigt vor dem Massenversand in einem Sheet mit Zahl.
- Kundenzeile und `src/components/bestand/consent-actions.tsx`: „Link kopieren“ (immer) und „Per WhatsApp schicken“ (nur im vom Kunden geöffneten 24-h-Fenster), Sheet-Text kürzen, Nachweisfelder hinter „Nachweis bearbeiten“.
- P.S.-Zeile mit Einwilligungslink in Kampagnen-Mails nach § 7 Abs. 3, nur wenn `consentRequestByMailAllowed`; nie in DOI- oder Service-Mails.
- `src/app/buyer/bestand/einwilligungen/page.tsx` und `src/components/bestand/recht-forms.tsx`: Statuszeile plus Hauptaktion oben, Aufklapper für Rechtliches, Tabelle je Anlass als Liste, Empfehlung „E-Mail-Signatur“ streichen, CSV (`einwilligungslinks/route.ts`) hinter „Mehr“, Karte „Alle haben eingewilligt“ hinter „Mehr“; Texte nach Abschnitt „kürzer“ der Recht-Bewertung, Pflichtbestandteile erhalten; bei Änderung von `consentQuestion` Versionskonstante.
- Kundenliste im Cockpit: Filter-Chips (Alle, Ohne Einwilligung, Mit Chance, Angeschrieben), Suche ohne „Anzeigen“, „Mehr laden“, ein beschrifteter Knopf je Zeile nur wenn sinnvoll.
- Tests in `tests/unit/bestand-einwilligung.test.ts`: P.S. nur bei Erlaubnis, Massenanfrage überspringt Abgemeldete, Gesperrte und Kunden ohne Werbeerlaubnis.
- Abnahme: Einwilligungen 390 px unter 2 Bildschirme (heute 5.904 px); eine Hauptaktion; Rechtstexte nur hinter Klick, alle Pflichtangaben vorhanden (Pflichtangaben-Check nach Conversion-Texter); kein Versand an Kunden ohne Werbeerlaubnis; SUS-Schätzung mindestens 90; Prüfungen grün.

### Paket 4: Ein automatisches Nachfassen und warme Kontakte in Heute
Ziel: Keine Antwort bleibt liegen; zweite Berührung bringt geschätzt 30 bis 50 % mehr Antworten.
- Nachfassen als zweiter Schritt je `CampaignRecipient` in `src/lib/bestand/campaigns.ts` (`runCampaigns`): nach 5 Werktagen ohne Antwort, Lesen allein zählt nicht als Antwort; genau einmal; gleiche Prüfungen wie beim ersten Versand; Stopp, Antwort, „Kein Bedarf“ und Kampagnenende beenden es; zählt aufs Kontingent; WhatsApp außerhalb des Fensters nur mit freigegebener Vorlage, sonst nur Mail; Ausnahme vom 30-Tage-Abstand dokumentiert, danach Abstand neu. Status möglichst über vorhandene Felder (z. B. `reason`/Zeitstempel); Schemaänderung nur hinzufügend und nur wenn zwingend.
- Schalter „Nach 5 Werktagen einmal erinnern“ (Standard an) in der Kampagne (Paket 2), Nachfass-Text nach Abschnitt „Texte“.
- Heute (`src/components/today-inbox.tsx`): höchstens 10 warme Kontakte aus dem Bestand („geantwortet ohne Termin seit 2 Tagen“), beschriftet „Nachfassen per Nachricht“; Anruf nur bei Rückrufwunsch; nur sichtbar, wenn das Modul für den Kunden sichtbar ist (`sichtbar-server.ts`).
- Kampagnen-Ergebnis zeigt „davon nach Erinnerung“.
- Tests: neuer `tests/unit/bestand-nachfassen.test.ts` (höchstens 1, nicht nach Antwort/Stopp/Abmeldung, Werktage, ohne Einwilligung kein WhatsApp-Nachfassen).
- Abnahme: Testdaten zeigen Nachfass-Empfänger korrekt; keine zweite Erinnerung möglich; Heute zeigt warme Kontakte mit klarer Aktion ohne Anrufaufforderung; SUS-Schätzung Heute unverändert oder besser; Prüfungen grün.
