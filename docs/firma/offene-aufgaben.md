# Offene Aufgaben und Übergabe

Für jede Sitzung und jedes Konto, das hier weiterarbeitet. Erledigtes streichen (mit Datum und Commit), Neues mit
Ziel, Frist, Verantwortlichem eintragen. Branches: `claude/whatsapp-crm` = Staging, `claude/facebook-ad-media-buyer-GdTgt` = live.
Vor jedem Push: fetch, beide Branches mergen, Tests grün. Andere Sitzungen pushen parallel.

## Heute / nächste Tage (Technik)
- ~~Media Buyer: Höchstpreis mit Steuerfaktor~~ P × (1 − s) / (1 + 0,19 × q), Lead-Ziele aus den Software-Bezügen
  (MEDIA_BUYER_GOAL_SOURCE, Standard software) und Regionen-Rechnung (erledigt 20.11.2026, Branch facebook-ad-media-buyer).
  Offen: nach dem Deploy eine Woche Software- vs. Airtable-Ziel im Admin vergleichen; Cash-Diagnose USt bei steuerfreien
  Leads prüfen (src/lib/ops/cash-rechnung.ts).

| Aufgabe | Stand | Wer |
|---|---|---|
| Belege automatisieren (Beschluss 22.11., Variante A): 1. Steuerberater fragen (DATEV Unternehmen online vorhanden? Belegbilder oder Buchungsvorschläge? Wer ordnet zu? § 13b-Kennzeichnung? Preis Jahresabschluss 2026). 2. AVV, TOM und Serverstandort von GetMyInvoices anfordern, Datenschutz-Agent prüft. 3. GetMyInvoices 14 Tage testen: Portale (zuerst Meta beide Werbekonten, Amex, Microsoft, Google), Gmail und hallo@olekannapinn.com, M365-Postfach, Import ab 1.1.2026; Ziel ≥ 80 % automatisch. 4. Alle Rechnungsadressen auf eine Adresse umstellen. 5. API-Schlüssel in Railway, dann baut CTO den nächtlichen Abgleich mit BankTransaction und die Liste „Umsätze ohne Beleg“. 6. Danach Nachverhandlung Steuerberater | offen | Ole / CFO / Datenschutz / CTO |
| Microsoft 365: überfällige Rechnung, Karte abgelehnt (Mahnungen bis 22.11.); Sperre von Postfach und Kalenderanbindung droht | dringend | Ole |
| Kranken/BU/Leben auslesen: Nachweis „keine Speicherung“. Weg A AWS Bedrock (Support-Fall 179502644300918, Konto 048394350784) und Weg B OpenAI (Anfrage „Sprich mit uns“ 22.11.2026: Zero Data Retention + EU-Datenresidenz, API). Danach: EU-Projekt, Railway-Variablen, Datum unter Admin › Einstellungen › Anbindungen, Diagnose q=policen-auslesen prüfen. Je Vermittler zusätzlich Freischaltung (Einrichtungsschritt; Lohmann, Anid offen, q=policen-gesundheit) | wartet auf AWS bzw. OpenAI | Ole / CTO |
| Team-Überblick für Inhaber (Termine 7 Tage, Offenes je Mitglied, Karte auf Heute), Branch `worktree-agent-abe206f8fef110ae2`, nicht gepusht; Notiz `docs/ux/team-ueberblick-2026-11-21.md`. Offen: Persona-Test auf Staging mit echtem Team, nach Livegang Fehlklicks auf der Team-Zeile (Tippen klappt jetzt auf statt Menü) prüfen | wartet auf Merge | UX/UI / CTO |
| Tierversicherung Katze: Text je Umfang (OP, voll, offen) statt immer „OP-Versicherung“ | Teilarbeit Branch `tkv-umfang` | CTO |
| Buchungsseite nach dem Leadformular nur mit Handynummer (22.11.2026, `lib/buchung-formular.ts`, Recht `docs/recht/2026-11-22-buchungsseite-nur-handynummer.md`): greift nur bei neuen Formularen mit `?von=formular`; Lohmann Kfz v5 und Privatschutz v6 bei der nächsten Fassung neu anlegen. Nach Livegang messen: Anteil Buchungen `nurHandy` gegenüber Rückfällen mit Feldern (`von: formular`, `nurHandy: false` in der Nachricht `appointment_booked`) | gebaut, nicht gepusht | CTO / CPO |
| Vertriebs-CRM „Nicht erreicht“ → E-Mail + WhatsApp (22.11.2026): nach dem Deploy prüfen, ob Meta die Vorlage `pg_vertrieb_nicht_erreicht_v1` als UTILITY freigibt (sonst geht nur die Mail); Entscheidung Ole offen, ob Kaltkontakte (Cold Call) auch eine Mail bekommen sollen; ~~A/B-Fassung B für den Text anlegen (A/B-Test-Labor)~~ erledigt 22.11.2026 (Test `vertrieb_nicht_erreicht`, Entweder-oder-Frage; Meta-Freigabe `pg_vertrieb_nicht_erreicht_b_v1` mit prüfen, Zahlen `q=vertrieb-nicht-erreicht`) | live nach Deploy | CTO / Ole |
| Bestellkonto Nico/Tobias (22.11.2026): live; Logins n.yagci@ und t.dangelo@mein-novus.de angelegt, ohne Mail. Offen: Ole gibt frei → Kundenakte „Zugangslink senden“, Registernummer prüfen, Zahlungsart durch Nico/Tobias, dann Bezüge Müller/Socki auf Wochenbestellung (docs/pay-per-lead.md „Bestellkonto“) | wartet auf Oles Freigabe | Ole / CTO |
| ~~Keine neuen Terminvorschläge, wenn der Lead schon einen künftigen Termin hat~~ erledigt 21.11.2026 (da36ae2b) | erledigt | CTO |
| Einrichtung Allianz (Angaben einmal, Kalender mit Vertreternummer, Meta-Vorprüfung): live seit 20.11.2026 (81ada26e). Offen: nach Livegang messen (Abbruch im Schritt Kalender, Zeit bis Schritt 4) | live | UX/UI / CTO |
| Einrichtung: Allianz-Online-Kalender nur bei Versicherer Allianz zeigen (W2) | Teilarbeit Branch `golive-auflagen` | CTO / UX |
| Einrichtung: „Mein Versicherer erlaubt das nicht“ bei Maklern ausblenden (W3) | Teilarbeit Branch `golive-auflagen` | CTO / UX |
| Go-live-Auflagen W1, W4 bis W7 und Kleinpunkte | Branch `golive-auflagen` | CTO |
| Lead-Name-Rangfolge | Branch `lead-name-rangfolge` | CTO |
| Termine per Weiterleitung blockieren (App-Kalender, 21.11.2026): nach dem Merge Migration einspielen, dann mit einem Testkonto eine echte Outlook-Einladung an die Termin-Adresse weiterleiten (Receiving-Webhook `email.received` muss aktiv sein, Schalter `MAIL_ANTWORT_EINGANG` egal). Optional: AVV-Zweck Resend „Versand und Empfang“ (`docs/recht/termine-weiterleiten-2026-11-21.md`, E1) | Branch `worktree-agent-ae2d4101af79bec3d`, nicht gepusht | CTO |
| Terminsuche 7 Tage: Wiedervorlage nur bei Wunsch über 7 Tage; ab 3. Runde Rückfrage plus Buchungslink; Kalender voll → Aufgabe und Hinweis, dass Herr Kannapinn sich meldet | Branch `terminsuche-7-tage` | CTO |
| Freitext verstehen (z. B. Vorerkrankung Tier) | Branch `freitext-verstehen` | CTO |
| Policen-Bitte nennt die genannten Sparten | Branch `policen-bitte-sparten` | CTO |
| Terminvorbereitung „Was hat … schon?“: Zweck „Cross-Selling-Folie“ und Zähler im Kopf, Hinweis am Hauptknopf (ungecommittet im Arbeitsverzeichnis, 19.11.2026); nach Freigabe committen. Danach messen: Anteil Präsentationen mit Folie `ueberblick` und „Mit anschauen“ (Ereignis fehlt noch) | wartet auf Ole | UX / CPO |
| Policen-Formular: nach Oles Test `POLICEN_FLOW_KUNDEN` leeren (für alle); optional Dateiname vor Einwilligung neutral | wartet auf Test | CTO |
| Admin-Umbau Nacht 19./20.11.: zusammengeführt (Rahmen, Verkaufen, Betreuen, Liefern, Geld, Werkzeuge/Einstellungen). Der neue Admin ist der einzige, alte Adressen leiten dauerhaft weiter (`lib/admin-neu/umzug.ts`), Schalter „Neue Oberfläche“ entfernt. Airtable nur aus der Oberfläche, Abgleich bleibt. Noch unter SUS 90 (Teams: 85 bis 88): Zeilen auf Mein Tag mit vielen blauen Knöpfen (HeuteList), Aufgaben mit zwei Filterreihen, Reiter WhatsApp der Kundenakte und Chats noch alte Ansicht, Auswertung/Media Buyer am Handy breit, Geld-Diagramme mit Erklärsätzen, Kontaktakte mit 4 Kopfknöpfen. Kennzahlen-Dashboard unter `/` (Monatsziele, Speed-to-Lead) hat kein Gegenstück im Admin. Massenaktion „gute senden“ (Monatsberichte) vor Livegang auf Staging mit Testkunde prüfen | Nacharbeit | UX/UI / CTO |
| Admin Einstellungen/Technik nach SUS-Prüfung 20.11. (Score 90): Rest unter 90 auf Einzelseiten: Halteangebote lang (10 Angebote mit Werten), Hinweisbox in Buchbare Zeiten (geteilter Baustein mit /buyer), Protokoll-Details mit Rohschlüsseln (count, geloescht), Untertitel des Systemzustands am Handy ausgeblendet, „Was wo ist“ mit technischen Inventartexten | Nacharbeit | UX/UI |
| Garantie: Liste „Termine und Ergebnisse“ je Garantiezeitraum als Export in der Kundenakte (AGB „Wahrgenommene Termine“: auf Anfrage in Textform), bis dahin von Hand | offen | CTO / Recht |
| Erklärvideos „Kurz“, „Ausführlich“, „WhatsApp verbinden“ neu aufnehmen; nur außerhalb 8 bis 20 Uhr deployen | läuft in eigener Sitzung | CPO |
| Empfehlungsmodul Champions-Umbau (3 Pakete, Plan `docs/ux/2026-11-19-empfehlung-champions.md`); Modul bleibt aus, Einschalten Stufe A | Branch `empfehlung-champions`: Pakete 1 bis 3 gebaut (20.11.2026), UX-Prüfung 20.11.2026: SUS 82, 88, 91 (Übersicht, Teilen, öffentliche Seiten); offen: Screenshot Heute und Kontakt-Karte nach Umstellung auf sekundären Knopf (Speicher, OOM), Einschalten-Liste in `docs/empfehlungen-modul.md` | CPO / CTO |

Die Branches liegen auf GitHub nur, wenn sie gepusht wurden; sonst lokal in der Sitzung, die sie angelegt hat.

## Erster Kunde live: Allianz Henrik Lohmann (Führungsrunde 21.11.2026)

| Aufgabe | Frist | Wer |
|---|---|---|
| Täglich prüfen: Erstnachricht unter 5 Min., Antworten, Termine, Zustellfehler, Assistent stumm (q=whatsapp, nutzung-woche, zustellfehler, bot-stumm, d360-kunde) | täglich bis 05.12. | Customer Success |
| ~~Werbekosten von act_837321052753778 kommen nicht an~~ Erledigt 21.11.: Abgleich läuft jetzt direkt nach der Meta-Freigabe, Lohmann nachgeholt (Ops-Aktion werbekosten_abgleichen) | erledigt | CTO |
| Ziel bis 28.11.: mind. 30 % Antworten binnen 72 h, 3 Termine; Tag-7-Anruf mit Zahlen, Tag-14-Rückblick mit NPS | 28.11. / 05.12. | Customer Success |
| Journey-Diagnose reparieren (alle Stufen 0 trotz Leads) | 24.11.2026 | CTO, Data/BI |
| ~~Allianz-Einrichtung mergen~~ Erledigt: seit 20.11.2026 live (81ada26e) | erledigt | CTO |
| ~~Doppelte Terminvorschläge trotz gebuchtem Termin beheben~~ erledigt 21.11.2026 (da36ae2b, Sperre in bookAppointment) | erledigt | CTO |
| Vorab-Checkliste 48 h vor Onboarding (Nummer beim alten Anbieter freigeben, private Mail für 360dialog, Absender-Freigabe durch IT, Webex-Link) | 24.11.2026 | Customer Success |
| Klären, warum Embedded Signup gesperrt war (Konzern-Business-Manager?), Anleitung festhalten | 25.11.2026 | Customer Success |
| Zwei weitere Kunden live, Dauer bis Livegang messen | 28.11.2026 | Sales, Customer Success |
| Entscheidungen Ole: Modell A gegen B, PPL-Pilotkunde, Datenschutz-Adresse, Steuerberater-Termin | 25.11.2026 | Ole |

## Vertrieb: Generalprobe Pay-per-Lead + Software (20.11.2026)

Leitfaden und Ergebnis: `docs/firma/protokolle/2026-11-20-generalprobe-ppl.md` und `.pdf`.

| Aufgabe | Frist | Wer |
|---|---|---|
| Belege Folie 3 (250.000/60.000, „eines der größten“, Vorschaubilder 32.000 vs. 60.000), Folie 4 (2017, „nominiert“ oder „ausgezeichnet“), Folie 5 (Allianz: für wen, wann, ohne Partnerschaft anzudeuten) | 27.11.2026 | CMO |
| Einwilligungstext der PPL-Funnels: deckt er WhatsApp-Ansprache durch den kaufenden Vermittler (§ 7 UWG)? Ergebnis schriftlich an Käufer vor Start | vor erstem PPL+Software-Start | Recht, Datenschutz |
| Marge je Lead (max. Meta-Kosten bei 10 % Storno: Katze 12,86 €, Hund 16,64 €, Privatschutz 26,47 €, Kindersparplan 49,16 €) und Regel „Sonstiges = 50 % automatisch“ prüfen | 23.11.2026 | CFO |
| Deck dauerhaft umstellen: Folie 15 hinter 8; 3, 4, 6 zu „Wer wir sind“; Folie 17 in den Anhang; Folie 16 mit leeren Quoten; Folie 18 mit Storno-Frist und „Wir verkaufen jeden Lead nur einmal“; Garantie-nahe Sätze (8 bis 11) entschärfen | 25.11.2026 | CMO mit UX/UI, Sales |
| Sprechzettel: Zeile 5 Umsatzsteuer (Steuerantwort aus Leitfaden d8), „Online-“ vs. „Abnehm-Coaching“, „Sonstiges halbe Gutschrift“ vs. Bestellseite „ersatzlos“ | 24.11.2026 | Sales |
| Gestaffelte Software oder Startpreis für kleine Lead-Mengen (Stufe A) | Führungsrunde 23.11.2026 | CEO/CFO, Entscheidung Ole |
| Kapazität je Produkt und Woche prüfen, bevor Mengen zugesagt werden | 27.11.2026 | Head of Growth, CMO |
| Ergebnis des Termins (Paket, nur Leads oder Auswertungstermin) mit nächstem Schritt und Datum in der Pipeline eintragen | 20.11.2026 | Ole, Sales |

## Wachstum: Leads für die HvK-Ziele (Team 4, 20.11.2026)

Plan und Präsentation: `docs/firma/protokolle/2026-11-20-hvk-leads.md` und `.pdf`. Lücke bis 30.11.: Frankfurt ca. 33,
Freiburg 14 bis 15 (anteilig ca. 13 bzw. 7 bis 8). Nichts angelegt; Start nur nach Freigabe A1 bis A3.

| Aufgabe | Frist | Wer |
|---|---|---|
| Echte Kosten je PKV-Lead aus dem Meta-Werbemanager (30 Tage, je PKV-Kampagne) | 21.11.2026 | Ole |
| HvK klären: November voll oder anteilig ab 16.11., Reklamationsgründe, Erstprüfung für Endkunden kostenlos, Berater vor Ort, Folgen bei Zielverfehlung | 21.11.2026 | Sales mit Ole |
| Freigaben (Stufe A): A1 zwei Geo-Kampagnen starten, A2 Rahmen M 1.360 €, A3 Aufstockung bis 3.040 € bei Kosten je angenommenem Lead unter 40 € | 21.11.2026 | Ole |
| Werbetexte K1, K3, K4 und Funnel-Einwilligung (Weitergabe an HvK) prüfen; Meta-Sonderkategorie Finanzprodukte für DE bestätigen; Ergebnis in `docs/recht/` | 21.11.2026 | Recht |
| Erledigt Recht 20.11.: Texte K1, K3, K4 grün (Endfassungen mit „kostenlos“ nur für die Erstprüfung), Vorhaben gelb, `docs/recht/hvk-pkv-anzeigen-2026-11-20.md`. Vor Start: HvK per Mail Rechtsgrundlage (Makler, Versicherungsberater, Anwalt oder Partner mit Registernr.), Honorar für beauftragten Wechsel, voller Firmenname; Einwilligung mit HvK-Namen ins Formular | 21.11.2026 | Sales mit Ole, Performance Marketer |
| Eigener PKV-Funnel (beitrag.pkv-tarife.com) vor Livegang: Auflagen L1 bis L8 aus `docs/recht/pkv-funnel.md` (Einwilligung mit Partnerliste und Kanälen Telefon/E-Mail/WhatsApp, Nachweis je Lead § 7a UWG, pf_bid ohne Cookie, Cookie-Text und Widerruf, Impressum/Datenschutzerklärung, Beleg „bis zu 50 %“) | vor DNS-Umstellung | CTO, Sales, Ole (Rechtstexte A) |
| K1, K3, K4 als Entwurf (pausiert), K4 ohne „Beamter“, zwei Bildvarianten Freiburg | 21.11.2026, nach A1 | Creative Director |
| Funnel-Kopie mit Filter PLZ, Beitrag ab 450 €, kein Beamter; Lead-Ereignis nur qualifiziert; Kampagnen pausiert vorbereiten; täglich nach Abbruchregeln steuern | 21.11. bis 30.11.2026 | Performance Marketer |
| Wechsel-Briefing `src/lib/creative-gen.ts` entschärfen („bis zu 50 %“, „keine Gesundheitsprüfung“, „jeder Anbieter“ raus) | 24.11.2026 | CTO mit Recht |
| Diagnose-Abfrage Werbeausgaben (AdSpendDaily, Cost) und Kosten je Lead je Kampagne und Gebiet, nur lesend | 24.11.2026 | Data/BI mit CTO |
| HvK per App-Aktion: Vermittlertyp nicht „vertreter“, Registerstatus „keiner“, Steuerkennzeichen 19 % prüfen | 21.11.2026 | CFO mit CTO |
| Nachbetrachtung HvK-Kampagnen (Kosten je angenommenem Lead, Motiv-Lehre) in `docs/firma/ab-tests.md` | 01.12.2026 | Performance Marketer, Data/BI |

## Bei Ole
- **Preise für steuerfreie Leads auf Endpreis-Basis neu rechnen** (CFO an Ole, Stufe A; docs/recht/ust-leads-vorsteuer-recherche.md, 20.11.2026).
- **Steuerberater-Termin** zu den 4 offenen Punkten der USt-Recherche (Befreiung bei abschlussunabhängigem Leadpreis, § 15 Abs. 4 Zuordnung, Beginn Vorsteuer-Kürzung, alte 19-%-Rechnungen).
  Eigene Recherche dazu (20.11.2026, CFO) im selben Dokument: Vorsteuerkürzung gilt rückwirkend für alle Vermittler-Pools,
  nicht erst ab 20.11.; Stripe-19-%-Rechnungen vorerst stehen lassen. Mitbringen: Lead-Rechnungsübersicht und Meta-Kosten je Kampagne und Monat.
- **USt-Rücklage erhöhen** um 19 % der bisherigen Meta-Kosten der Vermittler-Pools (vorsichtiger Fall), Betrag aus Meta-Export je Kampagne (CFO-Vorschlag an Ole, Stufe B, 20.11.2026).

- Plan „1 Mio. € ARR“ (Entwurf, 19.11.2026, `docs/firma/plan-1-mio-arr.md`): Entscheidungen 1 bis 7 bis zur Führungsrunde 23.11.
- Steuerberater: Umsatzsteuer (Betrag, Frist), Gehalt erst danach; Hinweis USt auf Vorauszahlungen.
- **USt Leadverkauf (19.11.2026, Recht):** FA-Nachfrage vom 18.09.2026 zur verbindlichen Auskunft (Frist 21.10. abgelaufen)
  beantworten lassen, Antrag auf Umgestaltung ab 01.01.2027 zuschneiden; bis dahin Leads nur an geprüfte Vertreter/Makler
  steuerfrei, sonst 19 %. Entwurf und offene Punkte: `docs/recht/ust-leadverkauf-2026-11-19.md`. App-Umbau (Nachweis,
  Steuerkennzeichen, Stripe, getrennte Rechnungen) live seit 20.11.2026, AGB-Klausel „Umsatzsteuer auf Leads“ live;
  verrata24 geprüft (Registernr. eingetragen), HvK kein Vermittler (19 %).
- Instantly: Light Speed und 60 Postfächer einrichten, Liste in der App importieren, Kampagne erst starten, wenn warm;
  Entscheidung zu den Textbefunden in `kaltakquise.md`.
- Alte Löschverlangen per Knopf „Auf Verlangen löschen“ nachziehen.
- Meta-Freigabe des ersten Software-Kunden vorziehen.
- Bedrock-Freischaltung (KI in der EU).
- LinkedIn-App anlegen; Gmail API (falls weiter gewünscht).
- Später: Calendly im Vertrieb durch eigenes Buchungstool ersetzen.
- Leitfaden Setter-Call liegt als PDF unter Marketing → Unterlagen (19.11.2026). Offen: Zahlweise im Beratungsgespräch, Quoten nach 10 Setter-Calls prüfen (Erscheinen mindestens 80 %).
- ~~**Ab 21.11.2026 bauen:** Abschlussbonus 300 € gilt nur bei Abschluss im Beratungsgespräch (Annahme im Call), nicht mehr mit Frist bis zum Folgetag (Ole, 19.11.2026).~~
  Entfallen 21.11.2026: Abschlussbonus ganz abgeschafft (Ole), neue Angebote ohne Bonus, in der Präsentation stattdessen
  „Jahresplan: 3 Monate sparen“. Bereits zugesagte Boni (offene und angenommene Angebote) gelten weiter. Siehe Entscheidungslog.

- Bestandskunden-Modul einschalten (Stufe A): bleibt aus (`BESTAND_MODULE_AVAILABLE = false`). UX-Prüfung 20.11.2026
  (Branch `bestand-champions`): SUS 91. Vor dem Einschalten: AVV-Ergänzung, `docs/datenschutz.md` Abschnitt Bestand,
  Muster-Datenschutztext für Vermittler, ProductUpdate (audience software), Eintrag in `docs/webseite-offen.md`,
  Erklärvideos prüfen, `docs/recht/bestand-champions.md` anlegen.

## Fehlende Zugänge für das Team
Diagnose-Schnittstelle (`app.performancegrowth.de/api/ops/diagnose`, nur lesend) ist seit 19.11.2026 in der Cloud-Umgebung
„kpidashboard-pg“ freigeschaltet (Schlüssel als Netzwerk-Secret, kein Wert im Repo). Sitzungen für dieses Repo in dieser
Umgebung starten. Noch offen: Lesekopie der Datenbank ohne Klardaten (Data-Agent), Anbindung der Sitzungsaufnahmen, Meta Ads nur lesend.
