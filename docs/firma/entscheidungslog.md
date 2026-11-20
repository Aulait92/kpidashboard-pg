# Entscheidungslog

Neueste oben. Je Eintrag: Datum, Beschluss, Stufe, wer, Begründung, Quelle. Freigaben von Ole wörtlich oder sinngemäß.

## 20.11.2026
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
- **Deploy nur bei grüner Testpipeline**; Code-Deploys abends ab 20 Uhr, Blocker früher nur mit Oles Freigabe.
- **Policen auslesen für alle Sparten** (Ole): neu Unfall, Tier, Reise, Krankenzusatz, Pflege und „Sonstige“
  (Grunddaten jeder anderen Police). Unfall, Pflege und Krankenzusatz zählen wie PKV/BU/Leben als Gesundheitssparten:
  ausgelesen erst mit Nachweis „keine Speicherung“ beim KI-Anbieter (K2, Admin → Anbindungen) und Einwilligung mit
  Gesundheitsangaben. Unbeantwortete Sparten auf „Ihr Schutz im Überblick“ grau „Gleich besprechen“ (Entscheidung
  an Claude delegiert).

## 20.11.2026

- **HvK-Leads Frankfurt/Freiburg** (Ole): HvK kann voll beliefert werden, aber **auf keinen Fall Verlust**, Belieferungsquote
  zweitrangig. Kosten je Lead laut Ole aktuell 10 bis 15 €. Regeln: Start 60 €/Tag (Frankfurt 40, Freiburg 20), Deckel 500 €
  bis zur ersten HvK-Gutschrift, Pause bei über 30 € je angenommenem Lead nach 2 Tagen, Erhöhung nur unter 25 € und nach
  Eingang der Gutschrift. Liquidität im Blick: Montag 4.000 € USt, Eingänge 3.000 € (Socki, Seidel) und 900 € (HvK).
  Plan: `protokolle/2026-11-20-hvk-leads.md`. Start erst nach Rechtsprüfung der Texte und Oles Go.
- **Pay-per-Lead + Software** live (nur monatlich kündbar, erste Woche im Angebot, USt-Umbau, AGB „Umsatzsteuer auf Leads“).
- **Ergebnis-Präsentation** nach jedem Meeting/Team-Einsatz (README).
