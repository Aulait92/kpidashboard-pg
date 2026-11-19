# Datenschutz-Dokumentation

Stand: 10.11.2026 · Verantwortlich: Ole Kannapinn UG (haftungsbeschränkt),
Lorenzstraße 58, 12209 Berlin, ole.kannapinn@performancegrowth.de

Diese Datei ist die interne Dokumentation nach Art. 5 Abs. 2, 30, 32 und 33 DSGVO.
Sie ersetzt keine Rechtsberatung. Punkte mit **Prüfen** bitte mit dem Anwalt klären.
Bei jeder Änderung an Diensten, Datenarten oder Fristen diese Datei mitpflegen.

Die Texte für Kunden liegen im Code: AGB, AVV, TOMs (Anlage 1) und
Unterauftragsverarbeiter (Anlage 2) in `src/lib/legal-texts.ts`, öffentlich unter
`/rechtliches/agb` und `/rechtliches/avv`.

## 1. Rollen

| Bereich | Rolle der UG | Verantwortlicher |
|---|---|---|
| Leads, Chats, Termine der Kunden (Versicherungsvermittler) | Auftragsverarbeiter (AVV) | der jeweilige Kunde |
| Eigener Vertrieb (Vertriebskontakte, Kaltakquise, Angebote) | Verantwortlicher | UG |
| Kundenverwaltung, Verträge, Abrechnung | Verantwortlicher | UG |
| Logins, Sicherheit, Änderungsprotokoll, Nutzungsmessung | Verantwortlicher | UG |
| Pay-per-Lead (Leads aus eigenen Funnels, an Käufer geliefert) | **Prüfen**: vermutlich Verantwortlicher bei Erhebung und Übermittlung an den Käufer (eigener Verantwortlicher) | UG / Käufer |

## 2. Verzeichnis als Verantwortlicher (Art. 30 Abs. 1)

| Tätigkeit | Zweck | Betroffene / Daten | Rechtsgrundlage | Empfänger | Löschung |
|---|---|---|---|---|---|
| Vertrieb an Versicherungsvermittler | Neukunden gewinnen | Vermittler (B2B): Name, Firma, Kontaktdaten (automatisch ergänzt aus öffentlichen Geschäftsangaben: Impressum/Website der Agentur – Anschrift, Telefon, Fax, Öffnungszeiten, Inhaber, Versicherer, Social-Media-Profile – und Google-Unternehmenseintrag über die Places API – Bewertung, Anzahl, Öffnungszeiten, Maps-Link, Betriebsstatus; nur leere Felder, Quelle und Zeitpunkt im Verlauf bzw. `enrichment`), Verlauf, E-Mails, Termine; Aufrufe des persönlichen Präsentationslinks /praesentation/[token] (nur Zeitpunkt je Aufruf, ohne IP- oder Gerätedaten, Wiederholungen innerhalb von 30 Minuten zählen nicht, `SalesPresentationView`; Zweck: Gespräch vorbereiten; Art. 6 Abs. 1 f; Hinweis auf der Seite und in der Datenschutzerklärung) | Art. 6 Abs. 1 f; Kalt-E-Mails **Prüfen** (§ 7 UWG, mutmaßliche Einwilligung B2B) | Instantly, Calendly, Resend, Railway, Google (Places API: Suchtext aus Agenturname und Ort) | Widerspruch, Austragungswunsch oder Datenschutzanfrage: sofort dauerhaft sperren („nie kontaktieren“, auch Instantly-Blocklist), Werbedaten löschen bis auf den Sperrvermerk (E-Mail, Grund, Zeitpunkt), damit nicht erneut geworben wird (Art. 21 Abs. 3 DSGVO, Ole 19.11.2026). Ausdrückliches Löschverlangen (Art. 17): automatisch löschen bis auf eine Hülle mit Sperrvermerk, Adresse nur als SHA-256 (`lib/vertrieb/art17.ts`, Abschnitt 5). Sonst siehe Löschkonzept. Präsentationsaufrufe werden mit dem Link bzw. dem Vertriebskontakt gelöscht |
| „Kollegen empfehlen“ (Empfehlungen von Kunden an Kollegen) | Neukunden gewinnen, Prämie für den Empfehler | Empfohlene (B2B): Name, Agentur, E-Mail, Telefon, Einwilligungstext und -zeitpunkt, Stand (Termin, Kunde); Empfehler: Code, Prämie | Art. 6 Abs. 1 a (Einwilligung auf /empfehlen/[code], auch dazu, dass der Empfehler den Stand sieht); Prämie Art. 6 Abs. 1 b | Resend, Stripe (Gutschrift), Railway | Angaben ohne Abschluss nach 12 Monaten automatisch entfernt (`pruneReferrals`); Vertriebskontakt wie Vertrieb. Widerruf: Kontakt löschen |
| Angebote und Verträge | Vertragsschluss | Kunde: Name, Firma, Anschrift, Annahme-Protokoll (Name, IP, Browser, Zeit) | Art. 6 Abs. 1 b, c | Stripe, Resend, Railway | 10 Jahre (§ 147 AO, § 257 HGB) |
| Abrechnung, Mahnwesen | Zahlungen | Kunde: Rechnungsdaten, Zahlungsstatus (Bankdaten nur bei Stripe) | Art. 6 Abs. 1 b, c | Stripe | 10 Jahre |
| Onboarding, Feedback | Einrichtung, Qualität | Kunde: Fragebogen, Impressumsangaben der Website, Bewertungen | Art. 6 Abs. 1 b, f | Anthropic (Impressum auslesen), Resend | mit dem Kundenkonto |
| KI-Hilfe im Kundenbereich | Fragen zur Bedienung beantworten, App verbessern | Nutzer: gestellte Frage, Antwort, Bewertung, Seite (keine Lead-Daten; Hinweis „keine Kundendaten eingeben“) | Art. 6 Abs. 1 b, f | Anthropic (Antwort erzeugen), Railway | 180 Tage (mit den Nutzungsdaten) |
| Logins und Sicherheit | Zugang, Missbrauch verhindern | Nutzer: E-Mail, Passwort-Hash, 2FA-Geheimnis (verschlüsselt), Anmeldungen, Fehlversuche | Art. 6 Abs. 1 b, f; Art. 32 | Railway | Konto: bis Löschung; Fehlversuche 30 Tage |
| Änderungsprotokoll | Nachweis, Sicherheit | Nutzer: Person, Zeitpunkt, Aktion (keine Lead-Inhalte) | Art. 6 Abs. 1 c, f | Railway | 1 Jahr (automatisch) |
| Nutzungsmessung | Bedienung verbessern | Nutzer pseudonym: Seitenaufrufe, Aktionen, Fehler | Art. 6 Abs. 1 f | Railway | 180 Tage (automatisch) |
| Nutzungsmessung im Admin (seit 18.11.2026) | Admin-Bereich aufräumen: welche Funktionen und Seiten werden genutzt | nur Mitarbeiter (Admins): Login-ID, Zeitpunkt, Seite (Pfad ohne Parameter, IDs als „:id“), Funktions-ID bei Klick, alte/neue Oberfläche; keine Inhalte, keine Lead- oder Kundendaten (`AdminUsageEvent`). Auswertung nur als Zahlen je Funktion/Seite ohne Personenbezug (Diagnose `q=admin-nutzung`), keine Leistungs- oder Verhaltenskontrolle einzelner Mitarbeiter | Art. 6 Abs. 1 f | Railway | 180 Tage (automatisch), mit dem Login |
| Fehlerüberwachung | Betrieb | technische Fehler; Texte im Replay maskiert, keine Nutzerkennung, keine URL-Parameter | Art. 6 Abs. 1 f | Sentry (EU) | laut Sentry-Einstellung (90 Tage Standard, **Prüfen**) |
| Werbeanzeigen-Steuerung | Kampagnen der Kunden | nur Kennzahlen (Kosten, Klicks), keine Personen | – | Meta, Google, Outbrain, TikTok | – |
| Werbemittel erstellen | Bilder, Videos, Untertitel | keine personenbezogenen Daten | – | OpenAI, Google (Gemini/Veo), Unsplash, Pexels, Telegram | – |

## 3. Verzeichnis als Auftragsverarbeiter (Art. 30 Abs. 2)

Für jeden Kunden mit AVV (Annahme des Angebots, `Offer.dpaUrl` speichert die geltende Fassung):

- **Kategorien der Verarbeitung:** Lead-Eingang (Meta-Lead-Formulare, bis Dezember auch
  Zapier/Airtable), Verwaltung und Verteilung im Team, WhatsApp-Kontakt durch den
  KI-Assistenten und die Berater, Terminbuchung und -erinnerung, Zustellung per E-Mail
  (Nur-Betreuung), Auswertungen.
- **Automatisches Nachfassen (Abfolgen, je Kunde einschaltbar):** nutzt dieselbe
  WhatsApp-Verarbeitung (gleiche Einwilligung, gleiche Dienste, keine neuen Datenarten).
  Gespeichert wird nur der Ablauf je Lead (`LeadSequence`: Art, Schritt, Zeitpunkte,
  Ergebnis – keine Nachrichteninhalte); wird mit dem Lead gelöscht. „Stopp“ oder eine
  Antwort beendet das Nachfassen sofort.
- **Abwesenheiten der Logins („Ich bin abwesend“):** von–bis, Grund nur als Kategorie
  (Urlaub, Krank, Sonstiges), optional Vertretung (`UserAbsence`). Zweck: keine Leads und
  Termine für Abwesende, Termine verschieben/übergeben. Keine Diagnose oder sonstigen
  Gesundheitsangaben; die Kategorie „Krank“ sehen nur die Person selbst und der Inhaber im
  Eintrage-Fenster, nicht die Team-Liste, nicht der Admin (dort nur „abwesend bis …“) und nie
  die Leads (Assistent nennt keinen Grund). Betroffene: Inhaber und Berater des Kunden
  (Beschäftigtendaten des Kunden, wir verarbeiten im Auftrag). Löschung: mit dem Login
  (Kaskade) bzw. bei der endgültigen Löschung nach Vertragsende, spätestens 1 Jahr nach Ende der Abwesenheit (automatisch, täglich);
  keine Lead-Namen darin gespeichert; das Änderungsprotokoll hält den Eintrag 1 Jahr.
- **Antworten per E-Mail (Paket M2, 18.11.2026, Schalter `MAIL_ANTWORT_EINGANG`, Standard aus):** Mails an Leads ohne
  verbundenes Postfach tragen als Antwortadresse `<kurzname>.<code>@antwort.dein-beratungstermin.de`. Antworten nimmt Resend
  (Receiving, Region EU, Unterauftragsverarbeiter wie beim Versand) entgegen und meldet sie per Webhook; Text und Anhänge holt
  die App über die API. Gespeichert: Absenderadresse, Betreff, Text (ohne zitierte Mail) als Eintrag im Kontaktverlauf
  (`ContactMail`), Anhangliste (Name, Größe, Typ) in `MailEingang`; die Anhänge selbst bleiben bei Resend (Download über die App,
  Adresse 1 h gültig). Weiterleitung an den Vermittler bzw. zuständigen Berater per Resend. Push ohne Inhalt. Keine KI-Auswertung
  von Inhalten oder Anhängen (Gesundheitsangaben möglich). Löschung: mit dem Lead (Art. 17, `erasure.ts`) bzw. mit den
  Kundendaten; Eingänge ohne Kontakt (nur Ablauf, keine Inhalte) nach 90 Tagen. Bei Resend gilt deren Aufbewahrung empfangener
  Mails. **Prüfen** vor dem Einschalten: Zweck in AVV Anlage 2 (`SUBPROCESSORS`: „Versand und Empfang von E-Mails“) und
  Datenschutzhinweis für Leads.
- **Terminvorbereitung, Angebote und Präsentation (15.11.2026):** Der Kunde lädt Angebote im Lead hoch
  (`LeadFile`, Art „Angebot“) oder trägt sie ein (`Appointment.offersJson`). Auslesen per Anthropic nur für Produkte
  ohne Gesundheitsangaben einer Person (`angebotOhneGesundheitsdaten`: Privatschutz, Haftpflicht, Hausrat,
  Rechtsschutz, Wohngebäude, Unfall, Tier; gesperrt für Kranken, BU, Leben, Pflege, § 204). Tierkranken ist erlaubt:
  Angaben zur Gesundheit eines Tieres sind keine Gesundheitsdaten nach Art. 9. Gespeichert wird nur, was die KI an
  Tarif-, Beitrags- und Leistungsdaten zurückgibt (Prompt: keine Namen, Anschriften, Geburtsdaten, Nummern,
  Gesundheitsangaben); der Kunde prüft und bestätigt. Kundenlink `/beratung/<token>`: 24 Zufallsbytes, 14 Tage,
  beendbar, `noindex`, `no-referrer`, ohne Sprechzettel. Löschung: mit dem Termin bzw. Lead. Notschalter:
  `ANGEBOTE_AUSLESEN=0`.
- **Datenarten und Betroffene:** wie AVV § „Art, Zweck und Umfang“. Keine Daten nach Art. 9
  (die Abwesenheits-Kategorie „Krank“ ohne Details ist bewusst so knapp gehalten; siehe oben).
- **Unterauftragsverarbeiter:** AVV Anlage 2 (`SUBPROCESSORS`).
- **Drittland:** USA bei Anthropic, Resend, Airtable, Zapier, Railway (Unternehmen), Meta,
  Google, Microsoft. Grundlage: EU-US Data Privacy Framework bzw. Standardvertragsklauseln.
  **Prüfen**: DPF-Zertifizierung je Anbieter vor Vertragsschluss nachsehen und ablegen.
- **TOMs:** AVV Anlage 1 (`TOMS`), Nachweise siehe Abschnitt 6.

### Nachweis Auftragsverarbeitungsverträge mit Dienstleistern

| Dienst | Zweck | AVV/DPA abgeschlossen am | Ablage |
|---|---|---|---|
| Railway | Hosting, Datenbank (EU, Amsterdam) | | |
| Anthropic | KI-Assistent, Impressum auslesen, Angebote auslesen (nur ohne Gesundheitsangaben) | | |
| AWS (Amazon Web Services EMEA SARL) | KI in der EU (Bedrock, eu-central-1 Frankfurt); für Policen per WhatsApp seit 18.11.2026 nicht genutzt (keine KI für Unterlagen, `docs/datenschutz-policen.md`) | | |
| Policen-Speicher (Cloudflare R2 mit EU-Jurisdiktion bzw. Amazon S3 eu-Region, laut `POLICEN_S3_ENDPOINT`) | Ablage der Policen per WhatsApp, verschlüsselt je Mandant (`lib/policen/ablage.ts`); vor Einsatz in `SUBPROCESSORS` aufnehmen | | |
| Google (Places API) | Öffentliche Unternehmensdaten von Vertriebskontakten abrufen (nur Suchtext: Agentur/Name und Ort; Antwort: öffentlicher Google-Eintrag) | | |
| 360dialog | WhatsApp Business API; seit 14.11. auch Partner-API für das Selbst-Verbinden der Kundennummer (Konto-/Channel-ID, Telefonnummer, Anzeigename; API-Key verschlüsselt gespeichert) | | |
| Meta | WhatsApp, Lead-Formulare, Rückmeldung der Lead-Stufen (Conversions API, seit 15.11.2026) | | |
| Resend | E-Mail-Versand; seit Paket M2 auch Empfang von Antworten (Receiving, `antwort.dein-beratungstermin.de`, Region EU) | | |
| Airtable | Lead-Daten (bis Dezember 2026) | | |
| Zapier | Lead-Übertragung (bis Dezember 2026) | | |
| Sentry | Fehlerüberwachung (EU) | | |
| Google, Microsoft | Kalender (wenn vom Kunden verbunden) | | |
| Stripe | Zahlungen (eigene Verantwortung, kein AVV nötig, **Prüfen**) | | |
| Instantly, Calendly | eigener Vertrieb | | |

**Wenn Airtable und Zapier abgeschaltet sind:** Einträge aus `SUBPROCESSORS` entfernen,
`LEGAL_VERSION` erhöhen und die Kunden in Textform informieren (AVV: 14 Tage Widerspruchsfrist
gilt nur für neue Dienste, eine Streichung ist unkritisch, wird aber trotzdem mitgeteilt).

### Bestandskunden-Kampagnen (Zusatzmodul)

- **Daten:** Bestandskunden des Vertreters (Name, Kontakt, Geburtsdatum, Adresse, Kundennummer,
  Sparten mit Beginn/Ablauf). **Keine Gesundheitsangaben** (Spalten werden beim Import
  verworfen), keine Beiträge.
- **Einwilligung:** liegt laut Versicherer vor; je Kunde dokumentiert („Einwilligung laut
  Versicherer, Import TT.MM.JJJJ“). „Stopp“ sperrt den Kunden dauerhaft für Kampagnen.
- **AVV:** Datenarten um „Vertragsdaten von Bestandskunden“ ergänzen (**Prüfen** Anwalt).
- **Löschung:** mit dem Kundenkonto bzw. auf Wunsch des Vertreters (Liste neu hochladen
  aktualisiert, löscht aber nicht – Löschen einzelner Bestandskunden: **noch offen**).

### Empfehlungen & Bewertungen (Zusatzmodul)

- **Daten:** Je Abschluss eine Nachfrage (`ReviewRequest`): Zeitpunkte, erste Antwort (Text, KI-Einordnung
  positiv/kritisch/neutral), Klicks auf den Google-Link. Persönliche Empfehlungslinks (`ReferralLink`, nur Token
  und Bezug zum Kontakt). Empfohlene Personen tragen sich selbst ein (Einwilligung mit Zeitstempel im Lead).
- **Rechtsgrundlage (Prüfen Anwalt):** Nachfrage an Bestandskunden des Vertreters nach Abschluss
  (berechtigtes Interesse / Kundenbeziehung, WhatsApp-Einwilligung aus dem Lead-Formular); Empfehlungsbitte als
  Werbung – „Keine Nachrichten mehr“ beendet sie. Die empfohlene Person willigt selbst ein; der Empfehlende
  gibt keine fremden Daten weiter.
- **Kein Gating:** Alle Angeschriebenen bekommen denselben Google-Link; die KI-Einordnung steuert nur Aufgaben und
  die Empfehlungsbitte, nie den Link.
- **Dank an Empfehlende:** ohne Namen oder Details der empfohlenen Person. Ob schon der allgemeine Satz „ich konnte
  weiterhelfen“ eine Information über Dritte ist, **prüfen** (ggf. Text neutraler fassen).
- **Keine Prämien** für Endkunden (Provisionsabgabeverbot, Tippgeber-Regeln). Prämien höchstens nach rechtlicher
  Prüfung durch Ole ergänzen.
- **KI:** Antworttext geht zur Einordnung an Anthropic (bereits Unterauftragsverarbeiter), ohne Name/Telefonnummer.
- **AVV:** Zweck „Nachfrage nach Abschluss, Empfehlungen“ ergänzt (**Prüfen**).

### Rückmeldung an Meta (Conversions API für CRM, seit 15.11.2026)

- **Zweck:** Meta lernt, welche Leads aus den Lead-Formularen des Kunden erreicht werden, einen Termin haben oder
  abschließen, und optimiert die Auslieferung der Anzeigen des Kunden darauf („Conversion Leads“). Kampagnen stellt
  die Software nicht selbst um (nur Vorschlag an Ole in der Optimierung).
- **Daten je Ereignis:** Meta-Lead-ID (leadgen_id, von Meta vergeben), Stufe (Lead, Erreicht, Termin vereinbart,
  Abschluss), Zeitpunkt, beim Abschluss Jahresbeitrag netto (Summe der Verträge) in EUR. **Keine** Namen,
  Telefonnummern, E-Mails, Gesprächsinhalte, **kein Produkt bzw. keine Sparte** (§ 203 StGB: die Tatsache eines
  Vertrags in der Personenversicherung soll nicht erkennbar werden), kein erweiterter Abgleich mit gehashten Daten.
- **Wer:** nur Leads aus Meta-Lead-Formularen (Lead.externalId mit 15 bis 17 Ziffern), keine Empfehlungen, kein
  Bestand, keine Pay-per-Lead-Leads; Testkunden senden nie. Empfänger: das Dataset (Pixel) im Werbekonto des Kunden,
  Meta Platforms Ireland Ltd. (AVV Anlage 2 ergänzt, AVV „Art, Zweck und Umfang“ ergänzt).
- **Steuerung:** je Kunde abschaltbar durch den Inhaber (`Customer.capiEnabled`, Standard an); bei „aus“ geht nichts
  mehr raus, Wartendes wird verworfen. DSGVO-Löschung eines Leads: Wartendes wird verworfen.
- **Speicherung:** Postausgang `CapiEvent` (Lead-Bezug, Stufe, Zeitpunkt, Wert, Status, Fehler ohne Tokens), Löschung
  nach 13 Monaten automatisch im Lauf (`runCapi`).
- **Prüfen (Anwalt):** Rolle von Meta (Auftragsverarbeiter nach den Meta Business Tools Terms bzw. gemeinsame
  Verantwortung nach Art. 26), Rechtsgrundlage beim Kunden (berechtigtes Interesse, Hinweis in der Datenschutzerklärung
  des Kunden und im Lead-Formular), ob der Vertragswert ohne Produkt mit § 203 StGB vereinbar ist, Standard „an“.

## 4. Löschkonzept

Policen per WhatsApp (`LeadDocument`, Dateien im privaten Bucket): 90 Tage nach dem letzten Termin (ohne Termin nach dem
Eingang), Media-IDs ohne Einwilligung 24 Stunden, Widerruf sofort, mit dem Lead bzw. Vertragsende; Nachweise
(`PolicenNachweis`, nur anhängen) bis Art. 17 bzw. Vertragsende (`docs/datenschutz-policen.md` Abschnitt 4 und 5).


| Daten | Frist | Wie |
|---|---|---|
| Nutzungsmessung (`UsageEvent`) | 180 Tage | automatisch, Cron 03:00 UTC (`pruneUsage`) |
| Nutzungsmessung im Admin (`AdminUsageEvent`, nur Mitarbeiter) | 180 Tage | automatisch, Cron 03:00 UTC (`pruneAdminNutzung`); mit dem Login (Kaskade) |
| Postausgang Rückmeldung an Meta (`CapiEvent`: Lead-Bezug, Stufe, Zeitpunkt, Wert) | 13 Monate | automatisch im Lauf alle 15 Minuten (`runCapi`) |
| Änderungsprotokoll (`AuditLog`) | 1 Jahr | automatisch (`pruneAudit`) |
| Messpunkte der Statusseite (`StatusSample`, ohne Personenbezug) | 90 Tage | automatisch je Cron-Lauf (`recordStatusSample`) |
| Hilfe-Anfragen an das Team (`UsageEvent` Typ `support`: Grund, Kurzfassung ohne Kontaktdaten, Referenz) | 180 Tage | wie Nutzungsmessung (`pruneUsage`) |
| Abwesenheiten (`UserAbsence`) | 1 Jahr nach Ende der Abwesenheit, spätestens mit dem Login bzw. bei Vertragsende | automatisch täglich (`pruneTransient`), mit dem Login (Kaskade) und bei der endgültigen Löschung (`finalDeleteCustomer`) |
| Angaben von Empfohlenen ohne Abschluss („Kollegen empfehlen“, `ColleagueReferral`) | 12 Monate nach Eingang | automatisch täglich 03:00 UTC (`pruneReferrals`): Name, Agentur, E-Mail, Telefon werden entfernt, Zähler und Prämie bleiben |
| Login-Fehlversuche | 30 Tage | automatisch (`pruneAudit`) |
| Nachfragen nach Abschluss (`ReviewRequest`: Antworttext, Einordnung, Klicks) | 2 Jahre nach Anlage, sofort mit Lead-Löschung (Art. 17) bzw. Vertragsende | automatisch (`pruneTransient`), `eraseLead`/`eraseCustomerData` |
| Google-Bewertungen (`GoogleReview`, Bewertungs-Wächter) | 2 Jahre nach Bewertung; sofort beim Trennen der Verbindung bzw. Vertragsende | automatisch im Cron (`runWaechter`), `disconnect`, `eraseCustomerData` |
| Empfehlungslinks (`ReferralLink`) | mit dem Lead/Bestandskunden bzw. Vertragsende | `eraseLead`/`eraseCustomerData`, Kaskade |
| Nicht zugeordnete Leads (Rohdaten aus Meta) | 30 Tage nach Zuordnung, sonst 90 Tage | automatisch (`pruneTransient`) |
| Passwort-Links | 7 Tage nach Ablauf | automatisch (`pruneTransient`) |
| Sitzung (Cookie) | 30 Tage | läuft ab; 2FA-Zwischenschritt 10 Minuten |
| Lead auf Wunsch der betroffenen Person | sofort | Lead öffnen → Mehr → „Daten löschen (Datenschutz)“ (Inhaber oder Admin). Anonymisiert den Lead, löscht Chats, Termine, Einwilligung. Umsatz und Status bleiben ohne Personenbezug |
| Alle Daten eines Kunden nach Vertragsende (Ruhephase) | Weisung des Kunden: 24 Monate nach dem letzten Vertragstag (Standard), wählbar 3 Monate oder sofort, bis zur Löschung jederzeit änderbar (AGB „Daten bei Vertragsende“, AVV „Löschung und Rückgabe“, Stand 15.11.2026) | Automatisch: Cron täglich 03:00 UTC (`runRetentionCron` in `src/lib/ruhend.ts`): am Tag nach dem Vertragsende ruht das Konto (`Customer.dormantSince`, archiviert, Meta-Kampagnen pausiert, kein Zugang außer Export und Reaktivierung, keine Crons, kein Assistent, keine Kampagnen, keine Abgleiche), Erinnerung 30 und 7 Tage vorher, dann `finalDeleteCustomer`. Von Hand: Admin → Kunden → Kunde → Abrechnung → „Daten endgültig löschen (von Hand)“. Der Kunde exportiert selbst (Konto bzw. Seite „Ihr Konto ruht“). Details unten „Ruhephase und endgültige Löschung“ |
| Leads, Chats, Termine während der Laufzeit | nach Weisung des Kunden | keine automatische Frist (Kunde entscheidet; Vermittler haben eigene Dokumentationspflichten) |
| Vertriebskontakte ohne Vertrag | **Vorschlag**: 2 Jahre nach letzter Aktivität | noch von Hand (Kontakt → Löschen). Bei Widerspruch sofort sperren; erhalten bleibt nur der Sperrvermerk |
| Vertriebskontakt mit Löschverlangen (Art. 17) | **sofort** (Ole, 19.11.2026) | automatisch bei ausdrücklichem Löschverlangen in einer Antwort, sonst Kontakt → Mehr → „Auf Verlangen löschen (Art. 17)“. Gelöscht: Name, Ansprechpartner, Firma, Adresse, Telefon, Website, E-Mails, Notizen, Anreicherung samt Import-Herkunft, Verlauf, Aufgaben, Mails, Follow-ups, Termine, Kampagnen-Status, Chats, Tagesportions-Markierung; weitere Vertriebskontakte mit derselben Adresse (auch als Zusatzadresse) ganz; in Instantly alle Leads der Adresse in allen Kampagnen löschen und Adresse auf die Blocklist; altes Cold CRM (Airtable, die App schreibt dort nicht): Aufgabe an Ole. Bleibt: Hülle „Gelöscht auf Verlangen (Art. 17 DSGVO)“ mit Sperrvermerk (Zeitpunkt, Grund), SHA-256 der Adressen, ein Verlaufseintrag ohne Personenbezug, Audit nur mit ID und Datum, Löschprotokoll. Nicht automatisch (über alle Kontakte mit der Adresse) bei Kunde, Login bzw. PPL-Bezieher (auch gleiche Domain), Angebot, Lead eines Kunden, Empfehlung und wenn dieselbe Antwort Auskunft verlangt (erst Auskunft): dann Sperre und Aufgabe mit Frist 7 Tage (Ole, 19.11.2026). Sperrvermerk auch als Hash der eigenen Agentur-Domain (nicht Freemail, nicht Konzern bzw. Portal, Abschnitt 5 „Datenschutz und Recht“) |
| Angebote, Verträge, Rechnungen | 10 Jahre | nicht löschen; Stripe bewahrt Rechnungen auf |
| Datensicherungen (Datenbank) | **höchstens 30 Tage** (Festlegung 18.11.2026) | Railway Postgres: PITR-Archiv ca. 4 Wochen, tägliche Sicherungen 6 Tage, wöchentliche 27 Tage (Railway-Doku); **monatliche Sicherungen (89 Tage) nicht einschalten**, manuelle Sicherungen (z. B. vor einem Livegang) nach spätestens 30 Tagen löschen. Einzelne Sätze lassen sich in Sicherungen nicht löschen: Jede Löschung aus Datenschutzgründen (Art. 17, Vertragsende, Widerruf und Fristen der Policen, Vertriebskontakte) steht im **Löschprotokoll** (`Loeschprotokoll`, nur IDs, keine Inhalte, 13 Monate, Kopie im privaten Policen-Bucket) und wird nach einer Wiederherstellung automatisch erneut angewendet (`lib/loeschprotokoll.ts`: beim Start der App und täglich 03:00 UTC; `docs/notfall-wiederherstellung.md`). Zeitliche Fristen greifen nach einer Wiederherstellung ohnehin von selbst. Policen-Dateien liegen nicht in der Datenbank (Bucket ohne Sicherung) und haben je Datei einen eigenen Schlüssel (Crypto-Shredding) |
| Löschprotokoll (`Loeschprotokoll`) | 13 Monate | automatisch täglich (`pruneLoeschprotokoll`), Datenbank und Kopie im Bucket |

**Ruhephase und endgültige Löschung (Ole, 15.11.2026, `src/lib/ruhend.ts`):**
- Gelöscht bzw. anonymisiert (`finalDeleteCustomer`): alles aus `eraseCustomerData` (Leads anonymisiert, Chats,
  Nachrichten, Termine, Einwilligungen, Kalender- und Postfach-Verbindungen, Abwesenheiten, Bewertungen, Empfehlungslinks,
  Bestand mit Verträgen, Kampagnen, Importe, Einwilligungsprotokoll), dazu Logins (Kaskade: Kalender, Postfach, Geräte,
  Abwesenheiten), WhatsApp-Zugang und Assistent, Nachrichten- und Mail-Vorlagen, Leadformular-Zuordnungen,
  Kalender-Einstellungen, Monatsberichte, Kampagnenwünsche, Erstinformation, Rückmeldungen an Meta, Freitexte der
  Kündigungsabsichten; Pay-per-Lead-Rohdaten der gelieferten Leads (`PoolLead`) ohne Name, Telefon, E-Mail, Antworten.
- Bleibt (gesetzliche Aufbewahrung bzw. ohne Personenbezug): Kundenzeile mit Firmenname und Abrechnungsfeldern
  (Stripe-ID, Preise, Laufzeit, Kündigungsdaten), Angebote/Verträge, Umsatzzeilen (`Revenue`, `ManualRevenue`),
  Lebenszyklus (`CustomerLifecycleEvent`: gekündigt, ruhend, reaktiviert, gelöscht mit Monatsbetrag und Kündigungsgrund),
  anonyme Lead-Zeilen (Produkt, Status, Datum, Umsatz), Sperrliste der Abmeldungen (Hashwerte), Vertriebskontakt
  (eigene Daten von performancegrowth, Frist siehe „Vertriebskontakte“). Rechnungen liegen bei Stripe.
- In der Ruhephase: keine Verarbeitung außer Speicherung. Crons, Assistent, Termin-Erinnerungen, Nachfassen,
  Bestandskampagnen, Pausen-Automatik, Pay-per-Lead-Verteilung, Kampagnen-Agenten, Kalender- und Vorlagenabgleich,
  Rückmeldung an Meta, Monatsberichte und Optimierung überspringen ruhende Konten (`dormantSince` bzw. `archived`).
  Kommt trotzdem ein Lead über ein Formular des Kunden, landet er nicht beim Kunden, sondern im Lead-Eingang
  (`UnassignedLead`, Löschfrist wie dort).
- Nachweis: Änderungsprotokoll (`customer.dormant`, `customer.retention`, `customer.retention_reminder`,
  `customer.final_erase`, `customer.reactivate`) und Bestätigungsmail an den Inhaber nach der Löschung.

**Airtable (bis zur Abschaltung):** Die App-Löschung erreicht Airtable nicht. Bei Leads
aus Airtable den Datensatz zusätzlich dort löschen. Der Sync überschreibt einen in der App
gelöschten Lead nicht mehr (`Lead.erasedAt`). Wird der Datensatz in Airtable gelöscht,
entfernt der nächste Sync die anonyme Zeile samt Umsatz.

**Kalender:** Termine im Google-/Outlook-Kalender des Beraters liegen in dessen Konto.
Der Lösch-Dialog weist darauf hin.

## 5. Anfragen betroffener Personen

**Leads (wir sind Auftragsverarbeiter):** Anfragen gehören zum Kunden. Kommt eine Anfrage
bei uns an: innerhalb von 2 Werktagen an den Kunden weiterleiten, nicht selbst beantworten.
Der Kunde kann

- **Auskunft/Kopie (Art. 15, 20):** Lead-Detail (Angaben, Notizen), Chat-Verlauf unter Chats,
  CSV-Export unter Leads. Bei Bedarf hilft der Admin (Admin → Leads → Export).
- **Berichtigung (Art. 16):** Angaben im Lead bzw. in Airtable ändern.
- **Löschung (Art. 17):** wie oben, „Daten löschen (Datenschutz)“.
- **Widerspruch WhatsApp:** Schreibt ein Lead „Stopp“ o. Ä., übernimmt der Berater; den
  Assistenten für den Chat ausschalten. Für endgültige Ruhe Lead löschen.

**Eigene Daten (wir sind Verantwortlicher):** Antwort innerhalb eines Monats (Art. 12 Abs. 3); im Vertrieb eigene Frist
7 Tage (Ole, 19.11.2026, unten „Datenschutz und Recht“).
Vertriebskontakt: Kontakt öffnen → Daten einsehen bzw. löschen. Anfrage und Antwort im
Mail-Postfach aufbewahren (Nachweis).

**Vertrieb, Antworten auf Kalt-Mails (Ole, 19.11.2026):** `lib/vertrieb/nie-kontaktieren.ts` erkennt im eigenen Text
der Antwort (ohne Zitat und Signatur), was zu tun ist. Jede solche Antwort ist eine Absage (nie „neutral“ oder „später“)
und sperrt den Kontakt dauerhaft („nie kontaktieren“, Instantly-Blocklist).

- **Datenschutz** (Aufgabe „Auskunft nach Art. 15 beantworten, Frist …“): Auskunft, Art. 15, Herkunft der Adresse,
  Nachweis der Einwilligung, Datenschutzbeauftragte(r).
- **Widerspruch** (Sperrvermerk, keine Löschung): Art. 21, Unterlassung, Werbung ohne Einwilligung, § 7 UWG,
  Aufsichtsbehörde bzw. Landesdatenschutz (nicht BaFin ohne Datenschutzbezug), Schadensersatz (Art. 82), Anwalt im
  Sinne von „meinen Anwalt einschalten“, anwaltlich, rechtliche Schritte. Nicht: „Ihr Anwalt für …“, „Anwaltskanzlei-Kunden“.
- **Löschverlangen (Art. 17)**: „löschen Sie meine Daten“, „Löschung meiner Daten“, „Art. 17“, „Recht auf
  Vergessenwerden“ → automatische Löschung (`lib/vertrieb/art17.ts`, Löschkonzept). Nicht „löschen Sie mich aus dem
  Verteiler“ (Austragung). Mit Auskunftsfrage in derselben Antwort: erst Auskunft (Aufgabe), dann von Hand löschen.
- **Auskunft beantworten:** Diagnose `q=vertrieb-auskunft&email=…` (oder `&id=…`, Suche `&suche=…`) liefert Anrede,
  Name, Firma, gespeicherte Felder, Herkunft (Liste, Quell-URL, Abrufdatum), Empfänger (Instantly mit Kampagnen,
  Google, Termine, WhatsApp), Datum aller Mails an den Kontakt und den Sperrstatus mit Mails nach der Sperre.
  `q=vertrieb-dsgvo&tage=60`: nur Anzahl solcher Antworten.
- Gelöschte Adressen kommen nicht zurück: Importe, Upload-Prüfung und neue Antworten prüfen gegen den SHA-256
  (`SalesContact.sperrHashes`); eine neue Antwort einer gelöschten Adresse wird nicht gespeichert, nur eine Aufgabe
  „im Postfach lesen“ angelegt.

**Datenschutz und Recht: Prozess für Anfragen und Abmahnungen aus der Kaltakquise (Ole, 19.11.2026)**
(`lib/vertrieb/datenschutz-recht.ts`, `datenschutz-recht-server.ts`):

1. **Erkennen (Vorrang):** DSGVO, Datenschutz mit eigenem Bezug, Auskunft, Art. 15/17/21, Einwilligung, Löschung,
   Widerspruch, Unterlassen, § 7 UWG, Aufsichtsbehörde, Schadensersatz, Anwalt, Abmahnung, Kanzlei im Drohkontext
   („an meine Kanzlei weitergeleitet“, „namens unserer Mandantin“; nicht „Maklerkanzlei Muster“). Kategorie
   **„Datenschutz/Recht“** (`SalesEmail.rechtsArt`) in Einordnung und Instantly-Auswertung (eigene Spalte, eigener
   Einwand), nie „neutral“; die Einordnung lässt sich dann nicht mehr umstellen. Unterart: **abmahnung** (Abmahnung,
   Unterlassungserklärung, Anwalt, Kanzlei, Schadensersatz, Aufsicht, § 7 UWG) vor **auskunft** vor **loeschung** vor
   **widerspruch**. Reine Austragung ist kein Rechtsfall (nur Sperre). Instantly-„Auto-Reply“ ohne
   Abwesenheitstext, aber mit Rechtsbezug, zählt als echte Antwort.
2. **Sperren:** „nie kontaktieren“ (App), Instantly-Blocklist und Interessenstatus „kein Interesse“ in allen Kampagnen
   (die API v2 kennt kein Pausieren einzelner Leads; die Blocklist stoppt jeden weiteren Sequenzschritt), Später-Follow-up
   gestoppt, Tagesportion (auch eine heute schon vergebene) ohne den Kontakt. Bei Löschung: Instantly-Leads gelöscht.
   **Domain nur bei eigener Agentur-Domain** (Ole): nicht Freemail, nicht Konzern bzw. Portal. Konzern/Portal = feste
   Liste (`KONZERN_DOMAINS`: dvag.de, ergo.de, signal-iduna.net/.de, lvm.de, tecis.de, axa.de, mecklenburgische.com,
   telis-finanz.de, provinzial.de/.com, hdi.de, ovb.de, allianz.de, allianz-agentur.de, generali.de, ruv.de, huk.de,
   debeka.de, devk.de, zurich.de, swisslife.de, horbach.de, nuernberger.de, sparkassenversicherung.de, sv-sachsen.de,
   lippische.de, dazu allfinanz.ag, mlp.de, swisslife-select.de, bonnfinanz.de, plansecur.de und die Versicherer aus dem
   Dubletten-Abgleich; Unterdomains zählen mit) oder mehr als 3 verschiedene Vertriebskontakte mit der Domain. Dort nur
   die Person. Domain-Sperre: Hash von „@domain“ in `SalesContact.sperrHashes` (auch in der Art.-17-Hülle) und
   Domain-Eintrag in der Instantly-Blocklist.
3. **Aufgabe an Ole:** Auskunft („Auskunft nach Art. 15 beantworten, Frist …“), Löschung („Löschung bestätigen
   (Art. 17), Frist …“), Widerspruch („Widerspruch bestätigen, Frist …“): **Frist 7 Tage** (gesetzlich ein Monat).
   Abmahnung („Abmahnung bzw. rechtliche Drohung: sofort prüfen“): sofort fällig, **Push an alle Admins**, Text:
   „Keine Unterlassungserklärung unterschreiben. Zur Prüfung an Claude geben.“ Auto-Löschung wie bisher.
4. **Antwortvorlagen** in der Kontaktakte (Karte „Datenschutz und Recht“, nur mit Fall): Widerspruch bestätigen,
   Löschung bestätigen (mit Löschdatum und Hinweis auf den Sperrvermerk), Auskunft nach Art. 15 (aus der Akte:
   gespeicherte Felder, Mails an den Kontakt, Herkunft mit Quelle, Quell-URL und Abrufdatum, Zweck, Art. 6 Abs. 1 lit. f,
   Empfänger Instantly (USA, Standardvertragsklauseln), Railway (EU) und laut Akte Google, Kalender, 360dialog,
   Speicherdauer, Rechte, kein Datenschutzbeauftragter, Ansprechpartner Ole Kannapinn, Anschrift aus `PROVIDER`).
   Nur als Entwurf: Admin prüft, ändert und sendet von Hand als Antwort im Instantly-Thread (Postfach der Anfrage; nach
   Art. 17 aus dem Protokoll). Diese Antwort ist die einzige Mail an einen gesperrten Kontakt (keine Werbung). Fehlt die
   Herkunft (kein Import aus der Vermittlerliste), weist der Entwurf darauf hin. Ohne Instantly-Thread: kopieren, im
   Postfach senden, „als beantwortet vermerken“.
5. **Nachweisprotokoll** `DatenschutzFallEreignis` (nur anhängen; Datenbank-Trigger verbietet UPDATE und DELETE,
   Migration 20261119003100): je Fall Ereignisse „eingang“, „antwort“, „loeschung“ mit Fall-ID, Kontakt-ID bzw. Hülle
   (ohne Fremdschlüssel), Eingang, Art, Frist, Zeitpunkt, wer („automatisch“ bzw. Admin-Login), bei „eingang“ die
   Instantly-ID der Anfrage und das eigene Postfach (Antwortziel). Keine Inhalte, keine Namen oder Adressen. Liste
   **Vertrieb → Datenschutz** (alter Admin) bzw. **Verkaufen → Kontakte → Datenschutz** (neuer Admin, Zähler offener
   Fälle). Aufbewahrung: dauerhaft als Nachweis (enthält keine Inhalte).
6. **Sicherung gegen Wiederholung:** Jeder Versand aus der App (`kontaktGesperrt`: Follow-ups, Angebots- und
   Erinnerungsmails, WhatsApp), jede Upload-Prüfung bzw. Tagesportion (`vorUploadPruefen`) und jeder Import prüft gegen
   Sperrliste, Adress- und Domain-Hash und gegen alle Kontakte mit Fall. „Nie kontaktieren“ lässt sich bei einem Fall
   nicht aufheben; gesperrte Kontakte lassen sich nicht normal löschen (nur „Auf Verlangen löschen (Art. 17)“, damit
   der Sperrvermerk bleibt); beim Zusammenführen bleibt die Sperre.

## 6. Technische und organisatorische Maßnahmen (Nachweise)

| Maßnahme (AVV Anlage 1) | Umsetzung |
|---|---|
| EU-Hosting | Railway, Region Amsterdam (App und Datenbank) |
| TLS | Railway-Domains nur HTTPS; Datenbank intern |
| Passwörter gehasht | `src/lib/auth.ts` (`hashPassword`, bcrypt) |
| Zwei-Faktor für Admins | `src/lib/totp.ts`, Einstellungen → Sicherheit; Hinweis-Banner, solange nicht aktiv |
| Zwei-Faktor für Kunden-Logins | Kundenbereich → Einstellungen → „Anmeldung & Sicherheit“ (`/buyer/konto/sicherheit`); Inhaber sieht im Team, wer 2FA nutzt (seit 12.11.2026). **Pflicht** (seit 18.11.2026) zum Öffnen von Policen vom Kunden und für die Freischaltung Kranken/BU/Leben (AVV-Ergänzung § 5), Einrichtungs-Karte `/buyer/konto/sicherheit/zwei-faktor`; sonst freiwillig |
| Schadsoftwareprüfung | ClamAV als eigener Railway-Dienst nur im privaten Netz (`lib/sicherheit/virenpruefung.ts`, `docs/virenpruefung.md`): Policen per WhatsApp, Uploads am Kontakt, E-Mail-Anhänge (M2). Befund: verworfen, Änderungsprotokoll `viren.befund`; ungeprüft: nicht angeboten bis zur Prüfung |
| Crypto-Shredding | Policen-Dateien: eigener Datenschlüssel je Datei, verpackt mit dem Mandantenschlüssel in der Datenbank; Löschen des Eintrags vernichtet den Schlüssel (`lib/policen/ablage.ts`, Format 2) |
| Begrenzung von Anmeldeversuchen | 10 Fehlversuche je E-Mail in 15 Minuten, 2FA-Code max. 5 Versuche; zusätzlich je IP (`src/lib/rate-limit.ts`) |
| Sitzungen beenden | Sitzungsversion je Login (`User.sessionVersion`): Passwortänderung, 2FA-Änderung, Kundenwechsel und „Überall abmelden“ beenden alle anderen Sitzungen; gelöschte Logins sind sofort abgemeldet |
| Drosselung (Rate-Limiting) | `src/lib/rate-limit.ts`: Login, Passwort vergessen, KI-Hilfe, öffentliche Buchung, Angebots-Annahme, CSP-Berichte; Webhooks nur grobe Obergrenze. Im Arbeitsspeicher je Instanz |
| Sicherheits-Header | `src/lib/security-headers.ts`: HSTS (2 Jahre), nosniff, Referrer-Policy, Permissions-Policy (Kamera und Mikrofon aus), Schutz vor Einbetten (außer Buchungsseite/Rechner), Content-Security-Policy (zunächst „Report-Only“, Berichte an `/api/csp-report`) |
| Cron-Aufrufe | Token per Header (`Authorization: Bearer`), nicht mehr in der URL (`docs/sicherheit-cron.md`) |
| Abhängigkeiten | Dependabot wöchentlich, `npm audit` (hoch/kritisch) bricht die Prüfung ab |
| Mandantentrennung, Rollen | `leadScope`/`conversationScope`/`appointmentScope` in `src/lib/team.ts`, `writableCustomerId` |
| Verschlüsselte Zugangsdaten | `ENCRYPTION_KEY` (AES-256-GCM) für Kalender-Tokens, 2FA-Geheimnisse, ICS-Links |
| Änderungsprotokoll | `src/lib/audit.ts`, Einstellungen → Änderungsprotokoll |
| Sicherungen, Wiederherstellung | PITR seit 09.11.2026; Test 10.11.2026 erfolgreich (`docs/notfall-wiederherstellung.md`); Aufbewahrung höchstens 30 Tage; Löschprotokoll wird nach jeder Wiederherstellung erneut angewendet (Test `tests/integration/policen-sicherheit.test.ts`) |
| Geprüfte Änderungen | GitHub Actions „Prüfung“ (Typen, Lint, Tests, Migration); versionierte Migrationen |
| Überwachung | `/api/status`, cron-job.org Überwachung, Sentry ohne Personendaten (`src/lib/monitoring.ts`, `src/instrumentation-client.ts`) |
| Löschfunktionen | `src/lib/erasure.ts` |

## 7. Datenpanne (Art. 33, 34)

1. **Erkennen:** Meldung von Kunden, Sentry, Überwachung, Auffälligkeiten im Änderungsprotokoll.
2. **Eindämmen (sofort):**
   - betroffene Logins sperren bzw. löschen, Passwörter zurücksetzen
   - `AUTH_SECRET` in Railway neu setzen: beendet alle Sitzungen
   - Schlüssel bei Drittdiensten neu erzeugen (Anthropic, 360dialog, Meta, Stripe, Resend, Google/Microsoft)
   - `ENCRYPTION_KEY` nicht einfach ändern: gespeicherte Kalender-Tokens und 2FA-Geheimnisse
     wären dann unlesbar. Stattdessen Kalender neu verbinden lassen und 2FA neu einrichten
   - bei Datenverlust: Wiederherstellung nach `docs/notfall-wiederherstellung.md`
3. **Bewerten:** Welche Daten, wie viele Personen, welche Kunden, Risiko für die Betroffenen?
   Änderungsprotokoll und Railway-Logs sichern.
4. **Melden:**
   - **Lead-Daten** (Auftragsverarbeitung): betroffene Kunden unverzüglich, spätestens
     **48 Stunden** nach Kenntnis (AVV). Die Meldung an die Behörde macht der Kunde.
   - **Eigene Daten:** Berliner Beauftragte für Datenschutz und Informationsfreiheit innerhalb
     von **72 Stunden** (Online-Formular), es sei denn, voraussichtlich kein Risiko.
     Bei hohem Risiko zusätzlich die Betroffenen informieren.
5. **Dokumentieren** (auch wenn nicht gemeldet wird) in der Tabelle unten.

| Datum | Was ist passiert | Betroffene Daten/Personen | Maßnahmen | Gemeldet an / am |
|---|---|---|---|---|
| – | bisher keine | | | |

## 8. Datenschutz-Folgenabschätzung (Vorprüfung)

Geprüft wird der KI-gestützte WhatsApp-Assistent: Er schreibt Interessenten an, die
über ein Lead-Formular angefragt und dort in die Kontaktaufnahme per WhatsApp eingewilligt
haben.

- Keine besonderen Kategorien (Art. 9), keine Gesundheitsfragen (AVV, Gesprächsleitfaden).
- Keine automatisierte Entscheidung mit rechtlicher Wirkung (Art. 22). Der Assistent
  qualifiziert und bucht Termine, die Beratung macht ein Mensch, der jederzeit übernehmen kann.
- Keine systematische Überwachung, keine Zusammenführung über Kunden hinweg (Mandantentrennung).
- Transparenz: Der Assistent stellt sich als „digitaler Assistent“ des Beraters vor
  (Vorlagen und Start-Anweisung). Das entspricht auch der Hinweispflicht für KI-Systeme
  nach Art. 50 KI-Verordnung.

Ergebnis der Vorprüfung: Eine DSFA ist voraussichtlich nicht erforderlich. **Prüfen**
(Anwalt): Muss-Liste der Aufsichtsbehörden, insbesondere „Einsatz von KI zur Steuerung der
Interaktion mit Betroffenen“. Falls ja, DSFA je Kunde als Verantwortlicher (Vorlage durch uns).

## 9. Offene Punkte

- [x] **Angebote auslesen (15.11.2026, auf Oles Wunsch nach Prüfung durch Claude für alle freigeschaltet):**
  AVV „Art, Zweck und Umfang“ (Abschnitt Terminvorbereitung und Beratungspräsentation), Datenarten und Anlage 2
  (Anthropic) ergänzt; technisch auf Produkte ohne Gesundheitsangaben begrenzt (siehe Abschnitt 3). Verbleibend für den
  Anwalt: (1) Reicht die Ergänzung im gleichen AVV-Stand „15.11.2026“ (am 15.11.2026 keine Kunden mit angenommenem
  Vertrag)? (2) Datenschutzerklärung des Vermittlers: Hinweis auf IT-Dienstleister mit KI genügt Art. 13 Abs. 1 lit. e,
  oder empfehlen wir den Vermittlern einen Satz? (3) Drittlandtransfer Anthropic (USA): gleiche Grundlage wie für den
  KI-Assistenten (DPA mit Standardvertragsklauseln) ablegen.
- [x] **Kundenlink zur Beratungspräsentation (15.11.2026):** Im AVV beschrieben (gleicher Abschnitt). Der Link ist eine
  Übermittlung an den Betroffenen selbst im Auftrag des Vermittlers. Technik siehe Abschnitt 3. Vorschlag für die
  Vermittler (freiwillig, z. B. in der Hilfe): „Ihr Berater kann Ihnen die Präsentation aus dem Beratungsgespräch über
  einen persönlichen Link bereitstellen; der Link ist 14 Tage gültig.“
- [ ] AVV/DPA mit jedem Dienst abschließen bzw. Nachweis ablegen (Tabelle Abschnitt 3)
- [ ] AGB/AVV Stand 15.11.2026 (Anwalts-Memo): Anwalt prüft die „Prüfen:“-Stellen in `src/lib/legal-texts.ts`.
      Eine Mitteilung an Bestandskunden mit 6 Wochen Widerspruchsfrist ist **nicht nötig**: Zum Zeitpunkt der Änderung
      gab es keine Kunden mit angenommenem Vertrag, nur verschickte Angebote (Ole, 15.11.2026). Offene Angebote verweisen
      auf /rechtliches/*, dort gilt bei Annahme der neue Stand. `LEGAL_VERSION` löst keine erneute Zustimmung in der App aus;
      bei späteren Änderungen mit Kunden gilt wieder AGB „Änderungen dieser AGB“.
- [ ] § 203 StGB (AVV Stand 15.11.2026): Mitarbeiter vor Beginn mit `docs/vorlage-verpflichtung-203-stgb.md` verpflichten
      und in der Nachweisliste eintragen; je Unterauftragsverarbeiter Verpflichtung in Textform mit Hinweis auf § 203 Abs. 4 StGB
      ablegen (DPA oder eigene Erklärung). Anwalt: reichen die Standard-DPAs (Anthropic, Meta, 360dialog, Sentry, Railway)?
      Einschätzung 16.11.2026 (Abschnitt 10.1): voraussichtlich ja, wenn sie eine Vertraulichkeitspflicht enthalten;
      zusätzlich je Dienst den Hinweis aus der Vorlage (Abschnitt „Unterauftragsverarbeiter“) in Textform schicken.
- [x] Aufbewahrung der Railway-Sicherungen festgelegt: höchstens 30 Tage (Löschkonzept, 18.11.2026). **Ole:** in Railway →
      Postgres → Backups prüfen, dass keine monatliche Sicherung eingeschaltet ist, und alte manuelle Sicherungen löschen
- [ ] Sentry: Aufbewahrung prüfen, Datenregion EU bestätigen
- [ ] Anwalt: Rolle bei Pay-per-Lead; Kalt-E-Mails an Vermittler; DSFA-Muss-Liste; AGB/AVV-Fassung 10.11.2026
- [ ] Anwalt: Rückmeldung an Meta (Conversions API für CRM, 15.11.2026): Rolle von Meta, Rechtsgrundlage, Standard „an“,
      Vertragswert ohne Produkt und § 203 StGB, Text für die Datenschutzerklärung (Webseite, docs/webseite-offen.md) und
      Hinweis im Lead-Formular; AVV-Ergänzung in `src/lib/legal-texts.ts` (mit „Prüfen:“ markiert), ob `LEGAL_VERSION`
      erhöht und Kunden informiert werden müssen
- [ ] Anwalt: Ruhephase nach Vertragsende (15.11.2026, AGB „Daten bei Vertragsende“, AVV „Löschung und Rückgabe“, mit
      „Prüfen:“ markiert): (1) Ist die Aufbewahrung von 24 Monaten als Standard-Weisung des Auftraggebers nach Art. 28
      Abs. 3 lit. g DSGVO verhältnismäßig, oder braucht es eine aktive Wahl bzw. kürzeren Standard? (2) Speicherbegrenzung
      (Art. 5 Abs. 1 lit. e DSGVO) für Lead-Daten ohne Vertragsschluss während der Ruhephase: Darf der Vermittler Leads,
      die nie Kunde wurden, 24 Monate aufbewahren lassen, oder sollten diese früher gelöscht werden (z. B. nach 3 Monaten
      oder mit Ablauf der Einwilligung)? (3) Reicht die Weisung per Auswahl im Kundenbereich (Textform, protokolliert)?
      (4) Wortlaut der Datenschutzerklärung (docs/webseite-offen.md) und ob Leads über die Ruhephase informiert werden müssen.
- [ ] Dezember: Airtable/Zapier aus Anlage 2 streichen, Kunden informieren
- [ ] Vertriebskontakte: Frist (Vorschlag 2 Jahre) festlegen, danach automatisch löschen
- [ ] Datenschutzerklärung je Kunde: Die Buchungsseite verlinkt die Datenschutzerklärung von
      der Website des Kunden (aus dem Onboarding), sonst performancegrowth.de/datenschutz.
      Diese muss dann WhatsApp-Assistent, Terminbuchung und die Dienste nennen

## 10. Rechtsprüfung 16.11.2026 (Legal Data Hunter)

Auftrag von Ole (15.11.2026): die Anwaltsthemen selbst nachrecherchieren und nach bestem Wissen einbauen. Grundlage:
Anwalts-Memo vom 15.11.2026, Pakete A bis C (Commits 5d235ad, 4e45b2a, 5653040). Recherche mit Legal Data Hunter
(LDH, Primärquellen) und gesetze-im-internet.de; Kanzlei-Zusammenfassungen sind als solche gekennzeichnet. Keine
Rechtsberatung. Das LDH-Tageslimit (kostenloser Tarif) reichte nur für einen Teil: **im LDH-Volltext geprüft** sind
Art. 3 und Art. 50 KI-VO (EU/EUR-Lex 32024R1689), EuGH C-21/23 (EU/CURIA 62023CJ0021), § 203 StGB und § 48b VAG
(DE/BGBl), BGH VIII ZR 53/09 (DE/BGH KORE302852010; entschieden noch zu § 203 Abs. 1 Nr. 6 a. F., heute Nr. 7) und
BGH VI ZR 225/17 (DE/BGH KORE309042018). Nicht im LDH-Bestand: BGH VIII ZR 16/05 und VIII ZR 7/09 (vor der
BGH-Abdeckung), VersVermV; diese über gesetze-im-internet.de bzw. veröffentlichte Volltexte und Besprechungen.
Ein Urteil zur Ähnlichkeit von Versicherungssparten (§ 7 Abs. 3 UWG) fand auch LDH nicht. AGB- und AVV-Änderungen nur als Entwurf: `docs/rechtstexte/agb-entwurf-2026-11-16.md`.
Handlungsbedarf: **ja** (umgesetzt oder Entwurf), **nein**, **Anwalt**.

### 10.1 § 203 StGB: Verpflichtung der Unterauftragsverarbeiter

- **Rechtslage:** Selbstständige Versicherungsvertreter sind Geheimnisträger nach § 203 Abs. 1 Nr. 7 StGB, geschützt
  ist schon das Bestehen einer Personenversicherung (BGH, Urteil vom 10.02.2010, VIII ZR 53/09). Offenbaren an
  „sonstige mitwirkende Personen“ ist erlaubt, soweit erforderlich (Abs. 3 Satz 2). Strafbar ist, wer nicht dafür
  sorgt, dass sie „zur Geheimhaltung verpflichtet“ wurden, und weitere Mitwirkende ebenso (Abs. 4 Satz 2 Nr. 1, 2).
  Eine Form oder eine Belehrung schreibt § 203 StGB nicht vor; eine Textform-Pflicht mit Belehrung gibt es nur im
  Berufsrecht einzelner Berufe (§ 43e Abs. 3 BRAO), nicht für Vermittler. Quellen: [§ 203 StGB](https://www.gesetze-im-internet.de/stgb/__203.html),
  [§ 43e BRAO](https://www.gesetze-im-internet.de/brao/__43e.html), BGH VIII ZR 53/09 ([Urteil](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE302852010&psml=bsjrsprod.psml)).
- **App heute:** AVV verpflichtet uns, Mitarbeiter und Unterauftragsverarbeiter (Abschnitt „Pflichten des
  Auftragnehmers“); Vorlage für Mitarbeiter `docs/vorlage-verpflichtung-203-stgb.md`. Meta-Rückmeldung ohne Sparte,
  Gesundheitsangaben nicht an die KI.
- **Bewertung:** Standard-DPAs mit Vertraulichkeitspflicht reichen voraussichtlich als „Verpflichtung“. Zur Sicherheit
  einmal je Dienst ein Hinweis in Textform (Vorlage ergänzt) und Fundstelle der Vertraulichkeitsklausel ablegen.
- **Handlungsbedarf: ja (Ole):** Hinweise verschicken, Tabelle Abschnitt 3 füllen. **Anwalt:** einseitiger Hinweis
  plus DPA genügt?

### 10.2 AGB-Freistellung gegenüber Unternehmern (§ 307 BGB)

- **Rechtslage:** §§ 308, 309 BGB gelten gegenüber Unternehmern nicht direkt, § 307 aber voll ([§ 310 Abs. 1 BGB](https://www.gesetze-im-internet.de/bgb/__310.html)).
  Eine Freistellung von Ansprüchen Dritter, die in der kundenfeindlichsten Auslegung ohne Verschulden greift, ist auch
  im B2B unwirksam: Verschuldensprinzip als wesentlicher Grundgedanke, § 307 Abs. 2 Nr. 1 BGB (BGH, Urteil vom
  05.10.2005, VIII ZR 16/05, BGHZ 164, 196, Einkaufsbedingungen eines Baumarkts, Klauseln Nr. 10.1;
  [Volltext](https://lorenz.userweb.mwn.de/urteile/viizr16_05.htm)). Im Voraus versprochene Übernahme von Geldbußen ist
  regelmäßig sittenwidrig (BAG, Urteil vom 25.01.2001, 8 AZR 465/00, § 138 BGB, [Leitsätze](https://lexetius.com/2001,1635)).
- **App heute:** AGB „Kundendaten: Zusicherung und Freistellung“ und AVV „Pflichten des Auftraggebers“ knüpfen die
  Freistellung an die Verletzung der Zusicherung ohne Verschulden des Kunden und nennen „Behörden“.
- **Bewertung:** Unwirksamkeitsrisiko. Fällt die Klausel, bleibt nur der gesetzliche Schadensersatz.
- **Handlungsbedarf: ja, Entwurf** (Verschulden mit Beweislast beim Kunden wie § 280 Abs. 1 Satz 2 BGB, § 254 BGB,
  keine Geldbußen): `docs/rechtstexte/agb-entwurf-2026-11-16.md`, Thema 2. **Anwalt** entscheidet.

### 10.3 KI-Verordnung Art. 50: Anbieter und Betreiber beim WhatsApp-Assistenten

- **Rechtslage:** Anbieter ist, wer ein KI-System entwickelt (oder entwickeln lässt) und unter eigenem Namen in Verkehr
  bringt oder in Betrieb nimmt (Art. 3 Nr. 3), Betreiber, wer es in eigener Verantwortung beruflich verwendet (Art. 3
  Nr. 4). Die Pflicht, Personen über die Interaktion mit einem KI-System zu informieren, trifft den Anbieter
  (Art. 50 Abs. 1), klar erkennbar spätestens bei der ersten Interaktion (Abs. 5). Betreiberpflichten in Art. 50 Abs. 3
  und 4 betreffen nur Emotionserkennung, Deepfakes und Texte zur Information der Öffentlichkeit. KI-Kompetenz (Art. 4)
  gilt für Anbieter und Betreiber seit 02.02.2025, Art. 50 seit 02.08.2026 (Art. 113). Bußgeld bis 15 Mio. € bzw. 3 %
  (Art. 99 Abs. 4 lit. g). Laut Kanzleiberichten verschiebt die Omnibus-Verordnung (EU) 2026/1744 nur die
  maschinenlesbare Kennzeichnung nach Abs. 2 (bis 02.12.2026), nicht Abs. 1 (Amtsblatt nicht selbst gelesen).
  Quelle: [Verordnung (EU) 2024/1689](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32024R1689).
- **App heute:** Hinweis in der ersten Nachricht, nicht abschaltbar, erneut nach 30 Tagen, wahrheitsgemäße Antwort und
  Übergabe bei „Mensch“ (`lib/whatsapp/ki-hinweis.ts`, Paket A). AGB nennen die Rollen nur als „Verständnis der Parteien“.
- **Bewertung:** Wir sind Anbieter, der Vermittler Betreiber. Pflicht aus Abs. 1 und 5 ist erfüllt. Art. 25
  (Rollenwechsel) gilt nur für Hochrisiko-Systeme.
- **Handlungsbedarf: ja, Entwurf** (Rollen ausdrücklich, Art. 4 beim Kunden): Entwurf Thema 3. **Anwalt:** macht die
  Nennung „KI-Assistent von [Vermittler]“ den Vermittler zum Anbieter?

### 10.4 Unternehmereigenschaft per Häkchen (§ 14 BGB)

- **Rechtslage:** Unternehmer ist, wer in Ausübung seiner gewerblichen oder selbstständigen beruflichen Tätigkeit
  handelt ([§ 14 BGB](https://www.gesetze-im-internet.de/bgb/__14.html)). Die Einordnung erfolgt objektiv, Zweifel
  gehen zugunsten der Verbrauchereigenschaft (BGH, Urteil vom 30.09.2009, VIII ZR 7/09, NJW 2009, 3780, [Volltext](https://lorenz.userweb.mwn.de/urteile/viiizr7_09.htm)). Wer aber einen
  gewerblichen Zweck vortäuscht, kann sich nach Treu und Glauben nicht auf Verbraucherschutz berufen (BGH, Urteil vom
  22.12.2004, VIII ZR 91/04, NJW 2005, 1045).
- **App heute:** Annahme nur mit Firma (Pflicht), USt-IdNr. (freiwillig, Format geprüft) und Pflicht-Häkchen mit
  § 14-Wortlaut (`lib/unternehmer.ts`), gespeichert mit Name, IP und Zeit (`Offer.acceptedAsBusiness`); Zielgruppe
  sind nur Vermittler mit § 34d-Erlaubnis.
- **Bewertung:** Das ist die übliche und tragfähige Absicherung. Ein Vermittler, der für sein Gewerbe abschließt, ist
  ohnehin Unternehmer.
- **Handlungsbedarf: nein.**

### 10.5 Kündigungsknopf (§ 312k BGB)

- **Rechtslage:** Die Pflicht zur Kündigungsschaltfläche gilt nur, wenn „Verbrauchern“ der Abschluss eines
  Dauerschuldverhältnisses über eine Webseite ermöglicht wird ([§ 312k BGB](https://www.gesetze-im-internet.de/bgb/__312k.html);
  Anwendungsbereich Verbraucherverträge, [§ 312 Abs. 1 BGB](https://www.gesetze-im-internet.de/bgb/__312.html),
  [§ 310 Abs. 3 BGB](https://www.gesetze-im-internet.de/bgb/__310.html)). Täuscht ein Verbraucher die
  Unternehmereigenschaft vor, kann er sich nicht auf Verbraucherschutz berufen (siehe 10.4).
- **App heute:** Kündigung in Textform (E-Mail, ohne Login) oder im Kundenbereich unter „Vertrag hier kündigen“ mit
  Anzeige des Vertragsendes und Bestätigung per E-Mail (AGB „Laufzeit und Kündigung“, `lib/vertrag-kuendigung.ts`).
- **Bewertung:** § 312k gilt nicht. Ein Weg ohne Login besteht ohnehin (E-Mail).
- **Handlungsbedarf: nein.**

### 10.6 Überraschende Klausel und Transparenz bei Start- und Staffelpreisen (§§ 305c, 307 BGB)

- **Rechtslage:** Ungewöhnliche Klauseln, mit denen der Kunde nicht rechnen muss, werden nicht Vertragsbestandteil
  ([§ 305c Abs. 1 BGB](https://www.gesetze-im-internet.de/bgb/__305c.html)); das Transparenzgebot gilt auch für
  Preisregeln ([§ 307 Abs. 1 Satz 2, Abs. 3 Satz 2 BGB](https://www.gesetze-im-internet.de/bgb/__307.html)). Eine
  Entgeltklausel, wo der Kunde keine erwartet, wird auch gegenüber Gewerbetreibenden nicht Vertragsbestandteil (BGH,
  Urteil vom 26.07.2012, VII ZR 262/11). Die Preisangabenverordnung („ab“-Preise) gilt nur gegenüber Verbrauchern
  ([§ 1 PAngV](https://www.gesetze-im-internet.de/pangv_2022/__1.html)).
- **App heute:** Startpreis mit Datum des Übergangs und Folgebetrag am Knopf, eigenes Häkchen, Auftragsbestätigung
  (Paket A). **Lücke:** Die AGB verweisen auf die „Preisstaffel laut Angebot“, das Angebot zeigte nur die aktuelle
  Stufe.
- **Umgesetzt (16.11.2026):** Angebot zeigt die vollständige Staffel und den Wechselzeitpunkt (`tierStaffelText`, Test
  in `tests/unit/offer-pricing.test.ts`). Kundenbereich zeigt die neue Stufe schon vor einer Budgetänderung.
- **Handlungsbedarf: ja (umgesetzt), Entwurf** für die AGB-Formulierung und Sonderkonditionen (Entwurf Thema 6, Ole).

### 10.7 Bestandskunden-Mail für eine andere Sparte (§ 7 Abs. 3 UWG)

- **Rechtslage:** E-Mail-Werbung ohne Einwilligung nur, wenn alle vier Voraussetzungen vorliegen, darunter Werbung
  „für eigene ähnliche Waren oder Dienstleistungen“ und Hinweis auf das Widerspruchsrecht schon bei der Erhebung
  ([§ 7 Abs. 3 UWG](https://www.gesetze-im-internet.de/uwg_2004/__7.html); fehlt der Hinweis, ist die Werbung
  rechtswidrig: BGH, Urteil vom 10.07.2018, VI ZR 225/17, Rn. 24 f., [Urteil](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE309042018&psml=bsjrsprod.psml)). Ähnlich heißt: derselbe typische
  Verwendungszweck oder Bedarf, die Ausnahme ist eng (LG Frankfurt a. M., Urteil vom 22.03.2018, 2-03 O 372/17;
  LG Berlin, Urteil vom 16.11.2017, 16 O 225/17, laut Kanzleibericht). Ein Urteil zu Versicherungssparten gibt es nicht.
- **App heute:** Ohne Einwilligung nur Anlässe zum selben Vertrag (Ablauf/Wechsel, Jahresgespräch), nur dieselbe Sparte
  (`isSimilarLine`, `isSameNeedOccasion` in `lib/bestand/einwilligung.ts`), nur mit Bestätigung des Vermittlers und
  Nachweis zum Widerspruchshinweis je Kunde; WhatsApp nur mit Einwilligung.
- **Bewertung:** Andere Sparte (Haftpflicht → Zahnzusatz, auch Hausrat → Wohngebäude) ist nach der engen Auslegung nicht
  „ähnlich“; die App sperrt das richtig. Ein Argument für Makler (eigene Dienstleistung ist die Vermittlung, nicht das
  Produkt) ist nicht entschieden.
- **Handlungsbedarf: nein.** **Anwalt** nur, falls Ole Sachsparten untereinander freigeben möchte.

### 10.8 Sondervergütungsverbot (§ 48b VAG): Prämien, Gutschriften, Rabatte

- **Rechtslage:** Versicherer und Vermittler dürfen Versicherungsnehmern, versicherten Personen und Bezugsberechtigten
  keine Sondervergütungen gewähren; erlaubt sind geringwertige Zuwendungen bis 15 € je Versicherungsverhältnis und
  Kalenderjahr ([§ 48b Abs. 1, 2 VAG](https://www.gesetze-im-internet.de/vag_2016/__48b.html)). § 48b ist
  Marktverhaltensregel, ein 50-€-Gutschein ist unzulässig (OLG Frankfurt, Urteil vom 27.05.2021, 6 U 81/20); die
  Ausnahme nach Abs. 4 wird eng ausgelegt (VG Frankfurt a. M., Urteil vom 19.11.2020, 7 K 2581/19.F, laut
  [beck-aktuell](https://www.beck-aktuell.de/heute-im-recht/rechtsprechung/vg-frankfurt-bestaetigt-provisionsabgabeverbot-fuer-online-versicherungsvermittler-2020-11-20)).
  Ein Urteil oder eine BaFin-Aussage speziell zu Empfehlungsprämien an Bestandskunden haben wir nicht gefunden.
- **App heute:** Dankeschön im Modul Empfehlungen & Bewertungen (derzeit ausgeblendet) höchstens 15 € je Empfehler und
  Jahr, kein Bargeld, nicht an Abschluss gekoppelt, nie für den Empfohlenen (`lib/empfehlung/shared.ts`). Prämie
  „Kollegen empfehlen“ und Halte-Nachlässe gehen von uns an Vermittler.
- **Bewertung:** Prämie für Kollegen und Nachlässe an Vermittler sind von § 48b nicht erfasst (Empfänger sind keine
  Versicherungsnehmer des Vermittlers, sondern unsere Kunden). Beim Dankeschön ist die App strenger als das Gesetz;
  offen ist nur die Anrechnung anderer Geschenke des Vermittlers.
- **Handlungsbedarf: Entwurf** (Anrechnung anderer Zuwendungen, Entwurf Thema 8). Sonst **nein**.

### 10.9 Bewertungen: Hinweis zur Echtheit (§ 5b Abs. 3 UWG)

- **Rechtslage:** Wer Bewertungen zugänglich macht, die Verbraucher abgegeben haben, muss angeben, ob und wie er
  sicherstellt, dass sie von Verbrauchern stammen, die die Leistung tatsächlich genutzt haben
  ([§ 5b Abs. 3 UWG](https://www.gesetze-im-internet.de/uwg_2004/__5b.html); Verbot falscher Echtheitsbehauptungen und
  gekaufter Bewertungen: [Anhang Nr. 23b, 23c](https://www.gesetze-im-internet.de/uwg_2004/anhang.html)). Für
  eingebundene Google-Bewertungen genügt die Quellenangabe allein nicht (laut Kanzleiberichten: LG Frankfurt a. M.,
  Urteil vom 31.10.2025, 3-10 O 103/24; OLG Koblenz, Urteil vom 02.06.2026, 9 U 1015/25; ausreichend war ein
  gut auffindbarer Hinweis bei OLG Köln, Urteil vom 20.12.2024, 6 U 59/24).
- **App heute:** Zeigt selbst keine Bewertungen; bittet alle Angeschriebenen gleich um eine ehrliche Bewertung (kein
  Gating, keine Anreize, `app/empfehlung/g/[token]`), meldet neue Bewertungen und schlägt Antworten vor. Modul derzeit
  ausgeblendet.
- **Bewertung:** Für die App keine Pflicht. Die Pflicht trifft den Vermittler, wenn er Bewertungen auf seiner Website
  zeigt. Unsere Webseite zeigt nur Stimmen von Vermittlern (B2B, § 5b Abs. 3 gilt nur für Verbraucherbewertungen).
- **Handlungsbedarf: Entwurf** (Klausel und Textvorschlag für Vermittler, Entwurf Thema 9), beim Einschalten des Moduls
  den Textvorschlag in die Hilfe übernehmen.

### 10.10 Erstinformation (§§ 15, 16 VersVermV): Zeitpunkt und Form

- **Rechtslage:** Mitteilung „beim ersten Geschäftskontakt“, auch durch Beschäftigte
  ([§ 15 VersVermV](https://www.gesetze-im-internet.de/versvermv_2018/__15.html)). Grundsätzlich auf Papier; ein
  anderer dauerhafter Datenträger (PDF) nur, wenn angemessen und der Kunde zwischen Papier und Datenträger wählen
  konnte und sich dafür entschieden hat; eine Website nur mit personalisiertem Zugang oder mit Zustimmung,
  elektronischer Mitteilung der Adresse und dauerhafter Verfügbarkeit; angemessen insbesondere, wenn der Kunde für das
  Geschäft eine E-Mail-Adresse angibt ([§ 16 Abs. 1 bis 3 VersVermV](https://www.gesetze-im-internet.de/versvermv_2018/__16.html)).
  Zum Zeitpunkt: Ein Angebot nach telefonischer Anfrage ist noch kein erster Geschäftskontakt (OLG Schleswig, 6 U 19/10,
  laut Fachbericht); strenger für Vergleichsportale LG München I, Urteil vom 13.07.2016, 37 O 15268/15.
- **App heute:** Link `/erstinformation/<token>` (je Vermittler) und PDF als Dokument mit der ersten Nachricht des
  Assistenten bzw. im Erstanschreiben ab Vorlage v3/v4 (Paket A). Zustimmung des Interessenten zur elektronischen Form
  war nicht eingeholt.
- **Umgesetzt (16.11.2026):** Einwilligungstext im Lead-Formular enthält die Zustimmung zur elektronischen
  Erstinformation mit Papier auf Wunsch (`ERSTINFO_ZUSTIMMUNG`, Version 2026-11-16, Test in
  `tests/unit/einwilligung-gesundheit.test.ts`). Bestehende Meta-Formulare behalten den alten Text, bis sie neu
  angelegt bzw. aktualisiert werden (Ole, Kampagnen).
- **Handlungsbedarf: ja (umgesetzt), Entwurf** (Papier auf Wunsch, Entwurf Thema 10). **Anwalt:** Ist die erste
  WhatsApp schon der erste Geschäftskontakt, solange die ältere Vorlage ohne Link läuft?

### 10.11 Gesundheitsdaten (Art. 9 DSGVO): Formular, Assistent, Notizen

- **Rechtslage:** Gesundheitsdaten sind Daten über die Gesundheit einer natürlichen Person
  ([Art. 4 Nr. 15, Art. 9 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679)); Angaben zu
  Tieren gehören nicht dazu. Art. 9 gilt auch, wenn sich Gesundheitsinformationen nur mittelbar ableiten lassen (EuGH,
  Urteil vom 01.08.2022, C-184/20, OT, [Urteil](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:62020CJ0184)) und schon für Bestelldaten apothekenpflichtiger Arzneimittel (EuGH, Urteil vom
  04.10.2024, C-21/23, Lindenapotheke, [Urteil](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:62023CJ0021)). Ausnahme in der Regel nur die ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a);
  berechtigtes Interesse genügt nicht.
- **App heute:** Gesundheitsfragen und -antworten aus Formularen gehen nicht an die KI und nicht in WhatsApp-Texte,
  im Kontakt vertraulich (`lib/gesundheitsdaten.ts`, Paket A); Angebote auslesen nur ohne Gesundheitsangaben
  (`angebotOhneGesundheitsdaten`); Bestandsimport verwirft Gesundheitsspalten; Notizen gehen nicht an die KI.
  **Lücke:** Was Interessenten selbst im Chat schreiben („hatte einen Bandscheibenvorfall“), ging vollständig an
  Anthropic.
- **Umgesetzt (16.11.2026):** Sätze mit eindeutigen Gesundheitsbegriffen werden vor der KI durch einen Platzhalter
  ersetzt (`redactHealthText`, im Assistenten und bei der Einordnung von Antworten im Empfehlungsmodul); der Vermittler
  sieht die Nachricht vollständig; Tier-Leads bleiben unverändert (Test `tests/unit/gesundheit-chat.test.ts`).
- **Handlungsbedarf: ja (umgesetzt), Entwurf** (AVV-Beschreibung, Entwurf Thema 11). **Anwalt:** Braucht der Vermittler
  für unaufgefordert im Chat genannte Gesundheitsangaben eine Einwilligung, oder genügt Löschen bzw. Nichtverwenden?
  Wer holt die Einwilligung für PKV-, BU- und Zahn-Leads ein (Formular-Häkchen)?

### 10.12 Parallele Vorprüfung (noch nicht gemergt): trägt die Rechtslage?

Nicht doppelt gebaut, nur geprüft. Ergebnis: Die Rechtslage trägt alle Punkte.

- **Sentry-Tokens:** Datenminimierung und Sicherheit der Verarbeitung (Art. 5 Abs. 1 lit. c, Art. 32 DSGVO); Tokens
  und Links mit Zugriff auf Daten gehören nicht in Fehlerberichte.
- **Kollegen-Prämie:** § 48b VAG nicht berührt (siehe 10.8); die Empfohlenen tragen sich mit Einwilligung selbst ein
  (§ 7 Abs. 2 Nr. 2 UWG, BGH I ZR 208/12 zu Empfehlungs-E-Mails laut Memo).
- **Gesundheitsdaten beim Angebot-Auslesen:** Art. 9 DSGVO, siehe 10.11.
- **Makler-Marktauswahl:** Der Makler muss seinem Rat eine hinreichende Zahl von Verträgen und Versicherern zugrunde
  legen oder auf eine eingeschränkte Auswahl hinweisen ([§ 60 VVG](https://www.gesetze-im-internet.de/vvg_2008/__60.html)).
- **KI-Hinweis-Wortlaut:** Art. 50 Abs. 1 und 5 KI-VO, siehe 10.3.
- **Impressum-Link:** Anbieterkennzeichnung leicht erkennbar, unmittelbar erreichbar und ständig verfügbar
  ([§ 5 DDG](https://www.gesetze-im-internet.de/ddg/__5.html), seit 14.05.2024 statt § 5 TMG).

## Sitzungsaufnahmen im Kundenbereich (17.11.2026)

Sentry Session Replay nur mit Einwilligung je Nutzer (§ 25 TDDDG, Art. 6 Abs. 1 lit. a DSGVO), Rechtsprüfung
docs/rechtstexte/sitzungsaufnahme-2026-11-17.md. Umsetzung: lib/nutzungsanalyse.ts, components/nutzungsanalyse.tsx,
src/instrumentation-client.ts (Replay-Integration erst nach Ja), lib/sentry-redact.ts (Positivliste /buyer, Kennungen
geschwärzt). Nachweis: User.analyseEinwilligung/-At/-Version und AuditLog. Speicherdauer bei Sentry je Plan 30 bzw. 90
Tage (Text: „spätestens nach 90 Tagen“). In Sentry eingeschaltet (Ole, 17.11.2026): „Prevent Storing of IP Addresses“, KI-Funktionen aus, Data Scrubber
Pflicht. Offen: Sentry-DPA und DPF-Eintrag ablegen, Abschnitt auf
performancegrowth.de/datenschutz (docs/webseite-offen.md), AVV-Klarstellung mit der nächsten Fassung (Abschnitt 4.2).
