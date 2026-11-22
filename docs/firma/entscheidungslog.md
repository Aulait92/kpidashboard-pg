# Entscheidungslog

Neueste oben. Je Eintrag: Datum, Beschluss, Stufe, wer, Begründung, Quelle. Freigaben von Ole wörtlich oder sinngemäß.

## 21.11.2026
- **„Entscheidet noch jemand mit?“ vor dem Terminvorschlag** (A, Ole, 21.11. spät: als eigene Frage vor dem
  Terminvorschlag, damit der Termin nicht verlegt werden muss). Standard (Fassung a); ohne Antwort kommen die Zeiten nach
  30 Min. trotzdem, Terminwunsch geht immer vor. Nach AGENTS.md läuft trotzdem ein Test (`partner_vor_termin`, Fassung b:
  Halbsatz im Terminvorschlag plus Frage nach der Buchung); entschieden wird über die Buchungsquote, Verschiebequote als
  Gegenprobe (docs/firma/ab-tests.md).
- **Meilenstein: erste Agentur ongeboardet, erste Leads** (Allianz Henrik Lohmann). Führungsrunde (CEO, Customer Success,
  CPO): Lohmann erst „live“, wenn ein echter Lead geantwortet hat; 14-Tage-Begleitplan; Feature-Stopp außer Korrekturen
  für Lohmann und Einrichtung; Allianz-Einrichtungs-Branches bis 24.11. mergen.
- **Admin liest mit** (A, Ole, 21.11.): Push an Admins bei Lead (nur eigener Funnel bzw. Software, nicht Perspective),
  Termin und Abschluss, je Kunde über die Glocke abschaltbar. **Assistent automatisch an** beim Verbinden von WhatsApp,
  bei allen verbundenen Kunden eingeschaltet (A, Ole).
- **50/50-Test PKV: vorerst Ersatzkennzahl „gültige Leads je Besucher“** (A, Ole: „erstmal nur Ersatzkennzahl“): geliefert,
  verkauft, nicht storniert, nicht reklamiert. Grund: Von 66 PKV-Leads in 30 Tagen ist nur einer als erreicht markiert
  (Socki 0 von 29, Müller 1 von 3, verrata24 und HvK nur per E-Mail ohne Rückmeldung; Diagnose q=ppl-rueckmeldung).
  Klick-Rückmeldung in Mail/PDF vorerst nicht gebaut.
- **Qualitäts-Ereignis „LeadErreicht“ an Meta eingeschaltet** (A, Ole: „Ja“): FUNNEL_META_QUALITAET=an (Railway). Gesendet
  über die Conversions API, sobald der Vermittler einen Funnel-Lead als erreicht markiert (stündlich, nicht erst nach 14 Tagen),
  nur mit Cookie-Einwilligung, mit dem Leadpreis als Wert. Kampagnen optimieren weiter auf „Lead“; Umstellung auf das neue
  Ereignis erst bei genug Ereignissen je Woche (Lernphase). Perspective-Leads ohne Einwilligung zur Weitergabe: nie.
- **Eigener PKV-Funnel live, 50/50 gegen Perspective** (A, Ole: „50/50 vom Traffic, wenn unsere Version besser ist,
  Perspective abschalten“; DNS-Weg statt Anzeigen ändern): start.pkv-tarife.com (Ziel aller PKV-Anzeigen) zeigt seit
  21.11.2026 auf die App; die Weiche (`src/lib/funnel/weiche.ts`, `/f/pkv-beitrag/go`) schickt je Aufruf zufällig 50 % nach
  beitrag.pkv-tarife.com, 50 % zu Perspective (leads.performancegrowth.de/beitrag-halbieren). HvK-Anzeigen (utm_campaign
  hvk) immer Perspective. Entscheidung nach A/B-Regel (p < 0,01) auf erreichte bzw. terminierte Leads je Besucher; Testaufrufe
  (utm_source test, deploycheck, weichecheck) nicht mitzählen. L7 (Impressum, Datenschutz 6a) über Lovable veröffentlicht.
- **Kfz: Einstiegsfrage im Erstanschreiben** (B, Ole: „Bei KFZ brauchen wir noch eine Einstiegsfrage, die nicht direkt auf
  den Termin geht.“). Je Anlass aus dem Kfz-Leadformular eine feste Frage mit Knöpfen (Wechsel: „Wann läuft Ihr jetziger
  Vertrag aus?“, neues Auto: „Ist das neue Auto schon da?“, ohne Angabe: „Für Ihr jetziges Auto oder ein neues?“), danach
  direkt der Terminvorschlag mit der Antwort. A ist Standard (direkt beauftragt), B „Frage zuerst“ im A/B-Test
  (docs/firma/ab-tests.md). Vorlagen werden automatisch bei Meta eingereicht, bis zur Freigabe das bisherige Erstanschreiben.
  Wortlaut vom A/B-Test-Labor; Ole sieht ihn im Bericht und kann ihn vor dem Deploy ändern (sonst neue Version).
- **Kfz-Versicherung als Lead-Produkt** (B, Ole: „Folgendes braucht der Allianzer, um Preise zu rechnen: aus letzter
  Rechnung von Vorversicherer die SFR, Versicherungsscheinnummer und Versicherer. Typ (3 Ziffern oder Buchstaben),
  Hersteller (4 Ziffern), Fahrzeugschein.“; „Volle Versicherungsscheinnummer bitte mit auslesen“; „Bei Kfz auch
  Cross-Selling betreiben, also nach anderen Policen fragen“). Assistent bittet nach der Buchung um Fahrzeugschein und
  letzte Rechnung (Rückfall: HSN/TSN und Versicherer/SF-Klasse im Chat), lädt ein, weitere Policen mitzuschicken
  (Komplettcheck). Auslesen: HSN, TSN, Erstzulassung, volle Vers.-Nr. nur bei Kfz (Zweck SF-Übertragung,
  docs/recht/policen-whatsapp-gesundheitsdaten.md). Einwilligungs- und Vorlagentexte unverändert.
- **Kleine Fixes sofort deployen** (A, Ole: „bei kleinen fixes direkt pushen“): Kleine Fehlerkorrekturen mit grünen Tests
  gehen direkt live, auch tagsüber. Größere Änderungen (neue Funktionen, Umbauten, Migrationen mit Datenänderung) weiter
  abends ab 20 Uhr bzw. früher nur mit Oles Freigabe.
- **Abschlussbonus abgeschafft, stattdessen Jahresplan in der Präsentation** (A, Ole: „Nimm den Abschlussbonus raus
  überall und nimm in die Vertriebspräsentation den Jahresplan für 3 Monate sparen auf.“; Nachtrag: „Bei den offenen
  drin lassen. Habe ich schon versprochen.“). Neue Angebote haben keinen Bonus mehr (Formularfeld weg, serverseitig nur
  noch bei neuen Versionen bzw. Entwürfen offener Angebote, die ihn schon haben). Offene Angebote mit Bonus behalten ihn
  samt Anzeige, Erinnerungen und Abrechnung; angenommene Angebote werden wie vereinbart abgerechnet. Präsentation
  (Web, PPTX/PDF Vertreter und Makler): Folie „Jahresplan: 3 Monate sparen“ vor „Ihr Start in 3 Schritten“ (12 Monate
  Laufzeit, jährlich im Voraus, 9 statt 12 Monatsbeträge, Ersparnis in Euro); Bonusfolie nur noch bei Angeboten mit
  zugesagtem Bonus. Leitfaden Setter-Call, Einwandbehandlung und Sprechzettel ohne Bonus. Aufgabe „Abschlussbonus nur
  im Call ab 21.11.“ entfällt.

## 20.11.2026
- **Leitfaden Setter-Call, Fassung 4** (Ole): Interessent soll das Problem bei Neukundengewinnung oder Wachstum selbst
  aussprechen (Fragen nach Ursache, Versuchen, Dauer, Folgen, dann Bedarf bestätigen); neu Mitarbeiter und Bestand als
  Maßstab fürs Budget; Budget erst Bereitschaft, dann Zahl, dann Verfügbarkeit; Entscheider mit Nachfrage und Einladung.
  Rahmen „Auftrag im Termin, IBAN bereithalten“ samt Zögern-Satz gestrichen. `docs/firma/vertrieb/leitfaden-setter-call.md`.
- **Onboarding Herr Lohmann, Nacharbeiten** (A, Ole): (1) Nach der Annahme „Passwort jetzt festlegen“ auf der
  Angebotsseite, nur im Browser der Annahme (signiertes httpOnly-Merkmal, 12 h), Link entsteht erst beim Tippen; Mail
  bleibt Rückfall. Neue Links aus Knopf und „Einladungslink kopieren“ (Admin) entwerten den Mail-Link nicht mehr; sobald
  ein Passwort gesetzt ist, sind alle übrigen Links ungültig. (2) Nach einem Deploy: automatischer Reload höchstens alle
  30 s, danach Hinweis „Die App wurde aktualisiert. Bitte noch einmal tippen.“ (3) www.app.… → app.… per 308.
  (4) Ohne Website ersetzt die vollständige Erstinformation das Impressum in der Admin-Checkliste. (5) Status „Pilot bis …“
  (`Customer.pilotBis`): echter Kunde, keine Platz-Abrechnung bis zum Ende, Erinnerungen 7 Tage vorher und am Ende;
  bestehende Stripe-Abos bleiben unberührt. Umsetzung `src/lib/annahme-direktzugang*.ts`, `src/lib/neue-version.ts`,
  `src/lib/www-app-host.ts`, `src/lib/impressum-ersatz.ts`, `src/lib/pilot*.ts`.
- **Pay-per-Lead im Werbekonto des Vermittlers: Preismechanik „Festpreis je Lead minus Werbekosten“** (A, Ole: „finde
  besser 35 € pro Lead minus Werbekosten“): Kunde zahlt Meta direkt, wir rechnen Leads × Festpreis (z. B. Privatschutz 35 €)
  minus sein Meta-Budget ab; feste Pauschale je Lead bzw. „so viel wie Meta“ verworfen. 35 € sind der Endpreis brutto
  (Meta inkl. 13b-Steuer und unsere Rechnung inkl. USt), Software kommt dazu (Ole: „brutto zzgl. Software“). Abrechnung
  **wöchentlich per Lastschrift** (Ole): jeden Montag Leads der Vorwoche × 35 € minus deren Meta-Kosten, automatisch über
  Stripe; platzt die Lastschrift, pausieren die Kampagnen. Steuer: mit 19 % kalkulieren (`docs/recht/ust-ppl-im-kundenkonto-2026-11-20.md`),
  streng getrennt vom steuerfreien PPL aus unserem Konto. Nur mit Startpaket ab 1.500 € Leadumsatz; Software inklusive, solange mindestens 1.500 € Leadumsatz im Monat, sonst Listenpreis (Ole, ersetzt „ab 1.750 €“ und „ab 50 Leads“), auf der Rechnung
  als eigene Position 349 € netto. Produkte im neuen Modell: Privatschutz (35 €) und Kindersparplan (65 €, ohnehin 19 %,
  daher ohne Margeneinbuße; Abnehmer mit § 34f) (Ole). Offen: Fragen an den Steuerberater, Pilotkunde. Siehe `protokolle/2026-11-20-ppl-im-kundenkonto.md`.
- **Garantien: „Termine wahrgenommen“ für alle in den AGB klargestellt** (A, Ole: „ja, für alle in den AGB klarstellen“):
  Nur Absagen oder Versäumnisse des Vermittlers zählen gegen ihn; Absage, Verschiebung oder Nichterscheinen des
  Interessenten zählen als wahrgenommen, im Zweifel für den Kunden; Berechnung mit Liste auf Anfrage in Textform.
  Gilt als Klarstellung auch für bestehende Verträge. Berechnung in der Software angeglichen, keine Neuigkeit.
  Siehe `docs/recht/garantie-termine-wahrgenommen-2026-11-20.md`.
- **Löschfrist 30 Tage für verworfene Pay-per-Lead-Leads** (A, Ole): Ungültige, doppelte, von Hand verworfene und
  verfallene Pool-Leads (alle Endstatus außer ausgeliefert) verlieren 30 Tage nach Eingang Name, Telefon, E-Mail und
  Antworten (`PPL_DISCARD_DELETE_DAYS`); Produkt, PLZ, Gesellschaft, Beitrag, Anzeige, Zeitpunkte und Grund bleiben für
  die Auswertung. Die Dublettenprüfung (30 Tage) nutzt nur ausgelieferte und geparkte Leads und bleibt unberührt.
  Vermittler sehen davon nichts, daher keine Neuigkeit. Umsetzung `src/lib/ppl/loeschfrist.ts`, `expireDiscarded` in
  `engine.ts`, Aufruf im WhatsApp-Cron; `docs/datenschutz.md` Löschfristen.
- **Eigener PKV-Funnel statt Perspective** (A, Ole): Nachbau von start.pkv-tarife.com/beitrag-halbieren in der App, gleich unter
  neuer Subdomain `beitrag.pkv-tarife.com`. Dauerhaft A/B-Tests; Hauptkennzahl Umsatz je Besucher = Lead verkauft und
  nach 14 Tagen weder storniert noch reklamiert (unser PPL-Umsatz, weil Vermittler ihren Umsatz kaum eintragen).
  „Bis zu 50 %“ bleibt (Ole). Qualitäts-Ereignis an Meta erst nach Oles Freigabe.
- **A/B-Test Termin-Zusage** (A, Ole): Bestätigung mit „Kann Herr Kannapinn fest mit Ihnen rechnen?“ [Ja, sicher]
  [Lieber andere Zeit], vierte Zeile erlaubt; Vorlage „Halbzeit-Erinnerung“ wird schon eingereicht.
- **Befund:** Kein echter Kunde hat WhatsApp verbunden (nur Testkonto und Support). WhatsApp-A/B-Tests bekommen echte
  Daten erst mit dem ersten verbundenen Kunden.

- **Geparkte Pay-per-Lead-Leads verfallen nach 48 h** (A, Ole): Ein geparkter Lead (kein freies Kontingent) wird nur
  bis 48 h ab Eingang neu verteilt (`PPL_PARK_MAX_HOURS`), danach endgültig verworfen (Status `expired`) und nie wieder
  verkauft, auch nicht über Admin-Knöpfe. Kontaktdaten werden dabei gelöscht (Zweck entfallen, `docs/datenschutz.md`).
  Push und Slack nennen beim Parken die Frist; Kosten bleiben in der Auswertung als „verworfen (geparkt > 48 h)“ sichtbar.
  Vermittler sehen davon nichts, daher keine Neuigkeit. Umsetzung `src/lib/ppl/parken.ts`, `expireParked` in `engine.ts`.

- **Fußzeile Erstanschreiben „Digitaler KI-Assistent“** (A, Ole, Vorschlag „digitaler Assistent“; Recht: das Wort KI
  bleibt, KI-VO Art. 50). Technisch Version v12 (Text wie v10, B-Fassung weiter „Frage zuerst“), weil Meta eingereichte
  Fußzeilen nicht ändern lässt.
- **Policen-Hinweis ohne Opt-in** (A, Ole): nur als ein Satz in der Vortags-Terminerinnerung (A8 neu, GELB gering);
  eigene Erinnerungen weiter nur mit Opt-in (Häkchen oder künftig Knopf „Später schicken“). In der Strecke v2 ersetzt der Satz
  die eigene Nachricht am Vortag um 18 Uhr. Datenschutzhinweise (Text c) um „Terminerinnerungen“ ergänzt.
- **Erstanschreiben v10 sofort Standard** (A, Ole): feste Frage mit Antwortknöpfen, kurz (ohne „Mehr lesen“), PDF der
  Erstinformation bleibt im Kopf, Fußzeile nur „KI-Assistent“ (Rechtsprüfung grün, `docs/recht/erstanschreiben-fusszeile.md`),
  für alle Produkte inkl. Privatschutz. Dazu B-Fassung v11 („Frage zuerst“) im A/B-Test gegen v10.
- **A/B-Tests entwickelt immer ein ganzes Team** (A, Ole): A/B-Test-Labor mit Conversion-Texter, UX, Personas,
  Data, ggf. Recht; lernt aus allen bisherigen Tests (`docs/firma/ab-tests.md`).
- **Immer A/B-Tests bei Conversion-Nachrichten** (A, Ole): ständig eine B-Fassung im Test, Gewinner wird Standard,
  sofort nächster Test (AGENTS.md).
- **Setter und Closer im Vertrieb** (Ole): Auf performancegrowth.de/termin ist nur noch ein 15-Minuten-Telefonat buchbar
  (Ole ruft an; Budget, Mitentscheider, Start, Zahlen, Zusage zum Abschluss im Termin). Den 45-Minuten-Sales-Call
  („Beratungsgespräch“, Video) bucht Ole im Vertriebskontakt, Interessenten können ihn nicht selbst buchen.
  Leitfäden: `docs/firma/vertrieb/`.
- **Entscheidungs-Call abgeschaltet** (Ole): nicht mehr online buchbar, kein Buchungslink mehr in Angebotsmail,
  Angebotsseite und Zahlungserinnerung. Abgeschlossen wird im Beratungsgespräch. Schon gebuchte Termine bleiben.

- **Policen auslesen überarbeitet** (B, Umsetzung; Livegang für alle A, Ole): Spickzettel oben in der
  Terminvorbereitung, Vertragsseite mit einer Hauptaktion, Fristen konservativ mit Resttagen, „doppelt“ nur Haftpflicht,
  Hausrat, Rechtsschutz, Lead-Texte ohne Ersparnisversprechen. SUS 68 → 90 (Personas 84 bis 88), Recht GRÜN mit zwei
  gelben Auflagen (Sammelprüfung nicht für unplausible Felder; neue Meta-Vorlagen). **Einwilligungstexte werden nur
  geändert, wenn Versionierung (`FLOW_TEXT_VERSION`, `textHash`) und Nachweis stimmen**; diesmal unverändert.
  Quelle: `docs/ux/2026-11-19-policen-champions.md`, Abschnitt Ergebnis.
- **Empfehlungsmodul überarbeitet, bleibt ausgeblendet bis Ole einschaltet** (C, Führungsteam/CPO; Einschalten A, Ole).
  Umbau auf Branch `empfehlung-champions`: Einwilligung beim Abschluss, Obergrenze 3 Bitten je 365 Tage, Arbeitsliste
  „Heute fragen“, öffentliche Seiten in Du und Sie. SUS 58 → 91 (UX-Messung), Persona-Abnahme 84; Rechtsprüfung grün mit
  gelben Punkten. Vor dem Einschalten Hindernisse 1 bis 4 beheben und Screenshots nachholen.
  Quelle: `docs/ux/2026-11-19-empfehlung-champions.md` (Abschnitt 11), `docs/recht/empfehlungsmodul-2026-11-19.md`.
- **Bestandskunden-Modul überarbeitet, bleibt ausgeblendet** (B umgesetzt, Einschalten A, Ole). Cockpit „Heute zuerst“,
  Kampagne in einem Bildschirm mit Terminlink, Einwilligung als Umsatzhebel, ein automatisches Nachfassen.
  SUS 48 → 84 → 88 → 91 (Personas: 84 bis 89), Recht intern GRÜN. Vor dem Einschalten 5 Fehler beheben und eine
  Testwoche mit einem Allianz-Vertreter und einem Makler. Quelle: `docs/ux/2026-11-19-bestand-champions.md`
  (Abschnitt „Ergebnis“), Branch `bestand-champions`.
- **Führungsteam Phase 1 mit 19 Agenten** (A, Ole). Content & Brand, Partnerships, Investor Relations später.
  Alle Meetings laufen von Anfang an; an Agentenkosten wird nicht gespart.
- **Fokus zwei Wochen:** Abschlüsse mit Vorauszahlung, Umsatzsteuer klären, neue Kunden sauber live bringen.
  2 Wochen Feature-Stopp außerhalb des Plans (Empfehlung Führungsrunde, Freigabe-Tabelle im Claude-Dokument).
- **Reihenfolge des Geldes:** Umsatzsteuer-Rücklage, dann Oles Gehalt, dann Investitionen (Empfehlung CFO).
- **Kalt-Mails skalieren trotz Abmahnrisiko** (A, Ole), mit Schutz: Austragungen sofort und dauerhaft sperren,
  Hauptdomain nicht im Versand, Bounces unter 3 %, Fokus auf Signal Iduna und Allianz. Siehe `kaltakquise.md`.
- **Instantly:** noch keine Kampagne live schalten (Ole). Light Speed empfohlen.
- **Maklervollmacht nach dem Termin:** Vorschlag mit einem Tipp statt Blindversand (A, Ole).
- **Policen-Formular v2 für alle Software-Kunden** (A, Ole); vorerst nur Testkunde, nach erfolgreichem Test für alle
  (`docs/recht/policen-whatsapp-gesundheitsdaten.md`).
- **Neue Verkaufspräsentation** (Fassung B) ist Standard; Fassung C läuft als Test dagegen (Ole).
- **Löschverlangen aus Kalt-Mails:** automatisch löschen und im Kontakt vermerken; bei Abmahnung keine Auto-Löschung;
  nur eigene Domains sperren, keine Konzern-Domains (Ole).
- **Zahlung nachträglich** und **Vorauszahlung mit Annahme** live (A, Ole), siehe `docs/recht/`.
- **Deploy nur bei grüner Testpipeline**; Code-Deploys werktags abends ab 20 Uhr, am Wochenende jederzeit (Ole, 21.11.2026); Blocker früher nur mit Oles Freigabe.
- **Policen auslesen für alle Sparten** (Ole): neu Unfall, Tier, Reise, Krankenzusatz, Pflege und „Sonstige“
  (Grunddaten jeder anderen Police). Unfall, Pflege und Krankenzusatz zählen wie PKV/BU/Leben als Gesundheitssparten:
  ausgelesen erst mit Nachweis „keine Speicherung“ beim KI-Anbieter (K2, Admin → Anbindungen) und Einwilligung mit
  Gesundheitsangaben. Unbeantwortete Sparten auf „Ihr Schutz im Überblick“ grau „Gleich besprechen“ (Entscheidung
  an Claude delegiert).
- **Ein Admin** (20.11.2026, Auftrag Ole 19.11.: „alte dinge, wie airtable können rausgenommen werden“): Der neue Admin
  unter /admin/neu ist der einzige. Die 60 alten Seiten unter /admin sind gelöscht, jede alte Adresse (auch Pushes,
  Mails, Lesezeichen) leitet dauerhaft weiter (`src/lib/admin-neu/umzug.ts`, `src/middleware.ts`). Werkzeuge ist die
  Gruppe Technik der Einstellungen. Airtable verschwindet aus der Oberfläche, der Abgleich im Hintergrund bleibt, bis
  AIRTABLE_SYNC_OFF gesetzt ist.
- **Admin v2 ist der einzige Admin** (19.11.2026, Abnahme in der Nacht zum 20.11.): Der alte Admin und der Schalter
  „Neue Oberfläche“ (Cookie pg_admin_neu) sind entfernt, alte Adressen leiten auf ihr Gegenstück. Airtable ist aus der
  Oberfläche raus, der Abgleich im Hintergrund bleibt, bis AIRTABLE_SYNC_OFF gesetzt ist. Abnahme: tsc, eslint, alle
  Unit-Tests und `next build` grün, Durchklick 124 Aufrufe (390 und 1280 px) ohne Fehler. Bewertung, SUS vorher/nachher
  und Restliste: `docs/ux/admin-neu/umbau-2026-11-19.md` (Abschnitt „Ergebnis“).

## 20.11.2026

- **Einrichtung für Allianz-Vertreter** (Ole, Punkte 3, 4, 10 nach der Einrichtung von Herrn Lohmann): Schritt 1 heißt
  „Ihre Angaben“ (Name, Telefon, Anschrift, Registernummer, bei Allianz Webex) und füllt Erstinformation und Signatur vor;
  Allianz-Vertreter verbinden den Kalender zuerst mit der Vertreternummer, Google/Outlook/Link eingeklappt; Meta-Schritt
  mit Vorprüfung (zweistufige Authentifizierung, zweiter Admin). Umsetzung UX/UI, Stufe B. Notiz: `docs/ux/onboarding-allianz-2026-11-20.md`.
- **HvK-Leads Frankfurt/Freiburg** (Ole): HvK kann voll beliefert werden, aber **auf keinen Fall Verlust**, Belieferungsquote
  zweitrangig. Kosten je Lead laut Ole aktuell 10 bis 15 €. Regeln: Start 60 €/Tag (Frankfurt 40, Freiburg 20), Deckel 500 €
  bis zur ersten HvK-Gutschrift, Pause bei über 30 € je angenommenem Lead nach 2 Tagen, Erhöhung nur unter 25 € und nach
  Eingang der Gutschrift. Liquidität im Blick: Montag 4.000 € USt, Eingänge 3.000 € (Socki, Seidel) und 900 € (HvK).
  Plan: `protokolle/2026-11-20-hvk-leads.md`. Start erst nach Rechtsprüfung der Texte und Oles Go.
- **Pay-per-Lead + Software** live (nur monatlich kündbar, erste Woche im Angebot, USt-Umbau, AGB „Umsatzsteuer auf Leads“).
- **Ergebnis-Präsentation** nach jedem Meeting/Team-Einsatz (README).
- **22.11.2026, Partnerfrage:** im WhatsApp-Assistenten immer als eigene Frage vor dem Terminvorschlag, Splittest `partner_vor_termin` beendet (Fassung B aus). Ole: „ich möchte die frage nach partner immer eigenständig vor der buchung“.
- **22.11.2026, Kfz-Unterlagen prüfen:** Keine KI-Einordnung hochgeladener Fotos ohne ZDR-Nachweis (Datenschutz: Rot, K2,
  Fassung `.s1` ohne Gesundheitssatz). Stattdessen fragt die Bestätigung bei Kfz-Leads nach, ob Fahrzeugschein und letzte
  Rechnung beide dabei sind, mit Knopf „Weitere senden“. KI-Einordnung erst nach ZDR-Nachweis mit Auflagen A bis F
  (nur `.gN`, ein Aufzählungsfeld, Bremse, VVT/DSFA). Ole: „Ja einbauen“ → lokale Texterkennung (Tesseract im Dockerfile,
  `lib/policen/texterkennung.ts`): nur Kfz-Leads mit KI-Einwilligung, Text nie gespeichert, nur `LeadDocument.dokumentArt`;
  die Bestätigung nennt, was noch nicht erkannt ist. VVT-Eintrag „Dokumentart bestimmen (lokal)“ nachziehen.
- **22.11.2026, Leadformular ohne Häkchen (Lohmann):** Ole gibt den Wortlaut „Mit Klick auf ‚Senden‘ willigen Sie ein …“
  frei (Rechtsprüfung Gelb gering, `docs/recht/leadformular-einwilligung-knopf-2026-11-22.md`). Neue Formulare Kfz v4 Knopf
  (1712355006964288) und Privatschutz v5 Knopf (1867444814681861), Zuordnung mit Fassung `2026-11-22-knopf`, alte Formulare
  bleiben für Nachzügler zugeordnet. Alle 8 Anzeigen als Kopie mit neuem Formular, alte pausiert. Auswertung: Leads je
  Link-Klick vorher (Formular mit Häkchen) und nachher. Offen: Handy-Screenshot der Formular-Vorschau (Auflage 1);
  Ole danach: „Immer ohne Checkbox“ → Kampagnen-Builder legt alle neuen Formulare ohne Häkchen an (Standard-Fassung
  `2026-11-22-knopf`); alte Häkchen-Formulare werden weiter ausgewertet.
- **22.11.2026, Einwilligungstext kürzer (alle Formulare):** Ole: KI-Satz raus, Text conversionoptimiert. Standard jetzt
  Fassung `2026-11-22b-knopf`, Titel „Letzter Schritt: Tippen Sie unten auf „Senden““. Lohmann: neue Formulare Kfz v5
  (1829825371571727) und Privatschutz v6 (1837248347700709), Anzeigen erneut umgestellt (Lernphase am 22.11. zweimal neu).
- **22.11.2026, Keine Faxnummern im CRM:** Ole: „Fax-Nummern können bei allen Kontakten und Kontakten in der Zukunft
  immer raus.“ Spalte `SalesContact.fax` samt bestehender Nummern gelöscht (Migration `20261122140000_kontakt_fax_entfernen`),
  Anreicherung liest kein Fax mehr aus Impressum/Website, CSV-Import und Kontaktansicht ohne Fax.
