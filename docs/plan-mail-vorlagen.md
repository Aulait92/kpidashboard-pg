# Plan: E-Mail-Vorlagen in der Customer Journey (M0 bis M9)

Stand 17.11.2026. Auftrag Ole, Teil des Soll-Verlaufs (`docs/plan-lead-verlauf.md`). Erst Staging, Abnahme durch Ole.
`src/lib/mail/vorlagen.ts` enthält 12 Vorlagen.

## Stufen je Vorlage (Voreinstellung, je Vermittler umstellbar: automatisch / ein Tipp / aus)

- **Automatisch:** termin_vorbereitung (Bestätigung + Vortags-Mail; die Bestätigung selbst ist Pflicht, der Schalter betrifft nur
  Vorbereitungsteil und Vortags-Mail), nicht_erreicht (einmal nach dem 2. erfolglosen Versuch im Anrufplan), nicht_erschienen
  (No-Show-Rettung, selber Tag), wie_besprochen (Bedenkzeit, zum genannten Datum), nachfassen_angebot (Tag 5).
- **Ein Tipp:** angebot (nur Weg „über die App“), beratungsdoku (mit dem Angebot; KI-Entwurf, Ablage als „Beratungsdokumentation“),
  unterlagen_fehlen (Erinnerung nach 3 Tagen automatisch), nach_abschluss (Haken neben „Glückwunsch per WhatsApp“, zeitneutral),
  willkommen (Aufgabe „Police da?“ nach 14 Tagen), tuer_offen (Haken bei Verlustgrund „kein Interesse“, einmalig).
- **Von Hand:** kuendigung (Aufgabe, wenn der Komplettcheck einen zu ersetzenden Vertrag zeigt).

## Regeln

1. WhatsApp ist Hauptkanal. Mail ergänzend (Kalender, Angebot, Dokumente, Zusammenfassung) oder Ersatz ohne WA (`kein-whatsapp-mail.ts`).
2. Alles unter „Nächste Nachrichten“ am Kontakt (Nachrichtenplan aus P1, Aktionen aus P6).
3. Absender: verbundenes Postfach, sonst dein-beratungstermin.de mit „Name | Agentur“, Reply-To, Signatur (`mail/lead-versand.ts`, `lead-absender.ts`).
4. Ohne Postfach: BCC-Kopie an wählbare Adresse (Standard: eigene). Weiterleitungsadresse `<kurz>.<code>@antwort.dein-beratungstermin.de`
   als Reply-To (M2), nicht bei verbundenem Postfach. Bei Vorlagen „ein Tipp“/„von Hand“ zusätzlich „Im eigenen Mailprogramm öffnen“
   (mailto) und „Text kopieren“, danach „Gesendet?“ mit Eintrag im Verlauf und Folgen (Nachfassen starten/stoppen).
5. Stopp-Regeln (Antwort, Abschluss, Absage, Abmeldung) für alle Mails, Abmeldelink wo werblich.
6. Mail 2 h nach der WA am selben Anlass, entfällt bei Antwort; höchstens eine automatische Mail je Lead und Tag.
7. „Meine Gesellschaft erlaubt das nicht“ (`mailFeaturesOff`): alle Mails aus, nur Kopieren und mailto.

## Pakete

| # | Inhalt | Aufwand | Hängt ab von |
|---|---|---|---|
| M0 | Grundlage: `Customer.mailAblauf` (JSON, Voreinstellungen oben), zentrale Funktion je Lead+Vorlage (Kunden-Vorlage oder Standard, Platzhalter, Rahmen: Knöpfe, Anhänge, Signatur, Abmeldelink), zentrale Sperren (Abmeldung, Status, gelöscht, `mailFeaturesOff`, ruhend, Tageslimit), Idempotenz je Lead/Vorlage/Anlass, Mail-Arten. Dialog „E-Mail schreiben“ sendet über `sendeLeadMail` (ohne Postfach über Resend). | 9 h | – |
| M1 | BCC-Kopie (nur Resend-Weg, Bounce der Kopie markiert nicht die Lead-Mail). Komponente „Über die App senden / Im eigenen Mailprogramm öffnen / Text kopieren“ + „Gesendet?“. mailto: `encodeURIComponent`, Umbrüche `%0D%0A`, max. ca. 1.800 Zeichen kodiert, sonst Text in die Zwischenablage und Hinweis im Link; Signatur entfällt im mailto; Anhänge: Link `/ihr-angebot/<token>`, auf dem Handy „PDF teilen“ (Web Share mit Dateien), Desktop „PDF herunterladen“. „Gesendet?“ beim Zurückkehren, „Nein“ ändert nichts. | 8 h | M0 |
| M2 | **Umgesetzt 18.11.2026 (Schalter aus, siehe unten).** Antwortadresse mit Eingang (Resend Receiving, Subdomain antwort.dein-beratungstermin.de, MX+DKIM, nur Empfang). `email.received` im Webhook, Inhalt/Anhänge über API, Zuordnung Code → Absender → Kunde, Eingang im Kontaktverlauf, Push, Stopp-Regeln. Eigene Weiterleitung (nicht `receiving.forward`, das setzt kein reply_to): `emails.send` mit Reply-To = Lead. Schutz: Auto-Submitted, Schleifen, Spam, ausführbare Anhänge, Löschung. | 16 h | M0, DNS durch Ole |
| M3 | Termin-Mails mit Bereitlegen-Liste (`bereitlegenListe` aus P2), Komplettcheck-Satz, „im Browser, ohne App“; `terminUnterlagen` entfällt. | 5 h | P2 |
| M4 | Automatisch: nicht_erreicht (Auslöser `call-attempts.ts`, Rückrufzeiten aus Anrufplan), nicht_erschienen (`SEQUENCES.no_show`), nachfassen_angebot (P3-Schritt `email` mit `vorlage`), wie_besprochen (Bedenkzeit). | 9 h | P3, P5 |
| M5 | Angebot + Gesprächszusammenfassung (KI-Entwurf über EU-KI, gekennzeichnet, Gesundheitsangaben nur mit Einwilligung, Ablage als Dokumentart „Beratungsdokumentation“, Ausnahme in `erasure.ts`). | 16 h | P3 |
| M6 | nach_abschluss, unterlagen_fehlen (+ Erinnerung), willkommen, kuendigung (Abgleich `Lead.vorvertraege`), tuer_offen. Konflikt `Lead.followUpAt` mit P7 lösen. | 13 h | P4 |
| M7 | Einstellungen → Assistent → Ablauf → „E-Mails“ (Stufe je Vorlage, BCC, Antwortweg), Nachrichtenplan-Quelle „Mail“ und „Vorschläge“. | 7 h | P6 |
| M8 | Texte Stand 4 (nach_abschluss zeitneutral, `{rueckruf_link}`, Abmeldehinweis), Abmeldelink für Leads, Neuigkeiten, Webseite-Liste, Erklärvideos, Screenshots. | 5 h | je Paket |
| M9 | Erklärschritt „Service-Mails in Ihrem Namen“ (Einstellungen, später Onboarding mit P8). | 9 h | M0, M1 |

Reihenfolge: M0, M1, M9 (Einstellungen), M3, M2, M4, M5, M6, M7; M8 je Paket.

## M2 umgesetzt (18.11.2026): Antwortadresse mit Eingang

Stand: im Code fertig, **Schalter `MAIL_ANTWORT_EINGANG` aus** (Standard) bis zum Echttest durch Ole.

- **Adresse:** `<kurzname>.<leadcode>@antwort.dein-beratungstermin.de` (`lib/mail/antwort-adresse.ts`). Kurzname = Buchungsseite
  (`CalendarConnection.bookingSlug`, ohne Slug entfällt er), Leadcode = 8 Zeichen base32 aus HMAC(AUTH_SECRET, Lead-ID), beim
  ersten Versand in `Lead.antwortCode` gespeichert. Nur Reply-To auf dem Resend-Weg mit Lead, nie mit verbundenem Postfach
  (auch nicht, wenn das Postfach einmal scheitert). Schalter aus: Reply-To bleibt die Adresse des Vermittlers.
  BCC-Kopie (M1) geht weiter an die eigene Adresse, Antworten auf die Kopie an den Lead.
- **Eingang:** Resend-Webhook `email.received` (`app/api/resend/webhook`, gleiche Signaturprüfung), Text, Kopfzeilen,
  SPF/DKIM/DMARC und Anhänge über `emails.receiving.get` und `emails.receiving.attachments.list` (Download-Adresse 1 h gültig,
  `lib/mail/eingang-api.ts`). Verarbeitung `lib/mail/eingang.ts`, je Resend-ID ein `MailEingang` (Idempotenz, Fortschritt,
  Diagnose, ohne Inhalte und ohne Absenderadresse). Fehler bei API oder Versand: Webhook antwortet 500, Resend wiederholt,
  bereits Erledigtes (Verlauf, Weiterleitung, Push) wird nicht doppelt gemacht.
- **Zuordnung:** Leadcode → Lead; sonst Absenderadresse (E-Mail oder weitere E-Mails) → Lead des Kunden aus dem Kurznamen (auch
  frühere Kurznamen, `bookingSlugAlt`); sonst nur der Kunde. Schalter aus: nur Eingänge mit vergebenem Code werden verarbeitet
  (keine Antwort geht verloren), alles andere ignoriert.
- **Mit Lead:** Eintrag im Kontaktverlauf (`ContactMail` mit `richtung` „eingang“, Art „Antwort per E-Mail“, Status „empfangen“,
  Text ohne zitierte frühere Mail, Anhänge mit Download über die App `/api/buyer/leads/<id>/mail-anhang/...`, frische Adresse
  von Resend je Klick). Push „Neue Antwort von {Lead}“ an den zuständigen Berater bzw. alle Logins, ohne Inhalt.
  Weiterleitung an den Vermittler bzw. zuständigen Berater (gleiche Regel wie Reply-To): `emails.send` von termine@… mit
  Anzeigename „{Lead} (Antwort)“, Reply-To = Lead, Betreff „Antwort von {Lead}: …“ (ohne AW/Re), Text bzw. HTML mit kurzem
  Kopf und Link in die App, Anhänge bis 28 MB zusammen (Resend: 40 MB je Mail nach Base64, das sind gut 29 MB Dateien);
  größer: Hinweis und Link in die App. Nicht `receiving.forward` (setzt kein Reply-To).
- **Stopp-Regeln:** „Antwort per E-Mail“ zählt wie eine WhatsApp-Antwort: `stopReasonFor` (Nachfassen endet mit „Lead hat per
  E-Mail geantwortet“) und die Anlass-Sperre in `mail/sperren.ts` (`hatMailAntwort`).
- **Schutz:** automatische Antworten (Auto-Submitted, Precedence, X-Autoreply, Listen, Zustellberichte, Abwesenheits-Betreff,
  mailer-daemon/noreply) und Absender mit DMARC-Fehler bzw. SPF und DKIM „fail“: nur Hinweis im Verlauf, keine Weiterleitung,
  kein Push, zählt nicht als Antwort. Schleifenschutz: Absender auf unseren Domains und eigene Weiterleitungen
  (Kopfzeile `X-PG-Eingang`) werden ignoriert. Programme, Skripte, Archive, Office mit Makros, HTML/SVG (auch Doppelendungen)
  werden nie weitergeleitet und nicht zum Download angeboten. Ohne zugeordneten Kontakt: Weiterleitung mit Hinweis „keinem
  Kontakt zugeordnet“, ohne Anhänge, kein Verlauf, höchstens 20 je Kunde und Tag. Anhänge werden nie per KI ausgewertet.
  Keine Inhalte in Logs oder Sentry (nur Kurzgründe).
- **Löschung:** mit dem Lead (`erasure.ts`: `MailEingang`, `ContactMail`, `antwortCode` geleert), mit den Kundendaten; Eingänge
  ohne Kontakt (nur Ablauf) nach 90 Tagen (`pruneTransient`). Bei Resend liegen empfangene Mails nach deren Aufbewahrung.
- **Diagnose:** `GET /api/ops/diagnose?q=mail-eingang[&tage=7]`: Schalter, Einrichtung, Zählung je Ergebnis und Zuordnung,
  letzte 20 Eingänge (Zeit, Zuordnung, Ergebnis, Grund, Anzahl Anhänge), letzte Fehler. Keine Inhalte.

### Einrichtung in Resend (Ole)

1. Resend → **Webhooks** → den bestehenden App-Webhook (`https://app.performancegrowth.de/api/resend/webhook`, bzw. Staging)
   öffnen → **Edit** → bei den Ereignissen zusätzlich **`email.received`** anhaken → speichern. Signatur-Geheimnis bleibt gleich
   (`RESEND_WEBHOOK_SECRET`), kein neuer Webhook nötig.
2. Resend → **Domains** → `antwort.dein-beratungstermin.de`: Receiving „verified“ (MX `10 receive-euw1.forge.rmta.net`, steht).
3. Erst auf Staging: Variable `MAIL_ANTWORT_EINGANG=1` setzen (Railway, Staging), neu starten.

### Echttest (Staging, dann Produktion)

1. Testkunde ohne verbundenes Postfach, mit Buchungsseite; Testlead mit eigener privater Adresse. In `MAIL_NUR_AN` müssen die
   Adresse des Testleads und die des Vermittlers (Ziel der Weiterleitung) freigegeben sein.
2. Am Kontakt „E-Mail schreiben“ → über die App senden. Im Postfach des Testleads: Antworten-an zeigt
   `<kurzname>.<code>@antwort.dein-beratungstermin.de`.
3. Mit Anhang (PDF) antworten. Erwartet in 1 bis 2 Minuten: Eintrag „E-Mail erhalten von …“ im Verlauf mit Anhang zum
   Herunterladen, Push „Neue Antwort von …“, Mail „Antwort von …: …“ beim Vermittler mit PDF; dort auf „Antworten“ → geht an
   den Testlead.
4. Gegenproben: Abwesenheitsnotiz im Testpostfach einschalten und erneut senden (nur Hinweis, keine Weiterleitung); eine ZIP-Datei
   anhängen (nicht weitergeleitet, Hinweis); laufendes Nachfassen endet („Lead hat per E-Mail geantwortet“).
5. `q=mail-eingang` prüfen (keine Fehler). Dann Produktion: `MAIL_ANTWORT_EINGANG=1`.

### Vorgemerkt (erst wenn der Schalter in Produktion an ist)

- **Neuigkeit** (kind `neu`, audience `alle`): „Antworten Ihrer Kunden auf E-Mails aus der App landen jetzt direkt bei Ihnen und
  im Verlauf des Kontakts, mit Anhängen. Antwortet ein Kunde, endet das automatische Nachfassen. Zu sehen unter
  **Kontakte → Kontakt → Verlauf**.“
- **Webseite** (`docs/webseite-offen.md`): „Antworten auf E-Mails landen bei dir und im Verlauf des Kontakts, Nachfassen stoppt
  automatisch.“
- **Rechtliches, Prüfen vor dem Einschalten:** Zweck bei Resend in `SUBPROCESSORS` (`lib/legal-texts.ts`) von „Versand von
  E-Mails“ auf „Versand und Empfang von E-Mails“ erweitern (ggf. `LEGAL_VERSION`), Datenschutzhinweis für Leads um den Empfang
  von Antworten ergänzen.

## M5 umgesetzt (18.11.2026): Angebot + Gesprächszusammenfassung

- **Angebots-Mail:** Text aus der Vorlage `angebot` (Kunden-Vorlage, sonst Standard), im Blatt unter „Texte ansehen“
  (WhatsApp und E-Mail). `{vorteil_1..3}` ohne KI aus der Tarifauswahl: eine Versicherung = Tarif mit Beitrag, dann
  ihre Leistungen aus den Katalog-Merkmalen (`AngebotItem.leistungen`); mehrere = je Versicherung ein Punkt mit der
  ersten Leistung; Kombi-Rabatt zuerst, nur wenn berechnet (`angebotVorteile`). `{anruf_tag}` wie P3.
- **Haken „Gesprächszusammenfassung mitsenden“** (Stufe der Vorlage `beratungsdoku`; „aus“ = kein Haken), nur mit
  E-Mail-Adresse. Editor (`components/zusammenfassung-editor.tsx`) mit Entwurf ohne KI (`zusammenfassungEntwurf` in
  `lib/mail/beratung.ts`): Formular/Chat (`wuenscheVorschlag`), Vorverträge, Schutz-Überblick (ohne Sparten im
  Angebot), Notizen ab 3 Tage vor dem Termin, offene Klärpunkte (`klaerenPunkte` ohne abgehakte); Rat aus der
  Tarifauswahl, Gründe als `[bitte ergänzen]`. Gesundheitsangaben einer Person fallen überall weg.
- **Prüfen vor dem Senden:** „Ansehen“ zeigt den PDF-Inhalt (`beratungsPdfInhalt`) plus „PDF öffnen“; „Jetzt senden“,
  „Per App senden“, Mailprogramm und „Nur ablegen“ sind erst danach aktiv, jede Änderung verlangt erneutes Ansehen.
  Server prüft zusätzlich: keine offene Stelle (`zusammenfassungFehlt`).
- **KI (optional):** `lib/mail/beratung-ki.ts`. Knopf nur mit EU-Zugang (`bedrockEu`) und ohne Gesundheitssparte
  (Produkt bzw. gewählte Sparten; ohne Auswahl nur sicher gesundheitsfreie Produkte). Keine Einwilligung deckt KI mit
  Gesundheitsangaben ab, daher im Zweifel aus. Eingabe = Entwurf/Editor-Text, zeilenweise ohne Gesundheitsangaben, keine
  Dokumente. Antwort wird verworfen bei neuen Beträgen/Prozenten, neuen Versicherern, neuen Vergleichen/Empfehlungen
  (`beratungsTreffer`) oder gefüllten `[bitte ergänzen]`. Kennzeichen „Entwurf der KI, bitte prüfen“, im Verlauf
  „Entwurf mit KI formuliert, geprüft“.
- **Ablage:** neue Dokumentart `beratungsdoku` („Beratungsdokumentation“, PDF mit Datum), nicht per Upload.
  `LeadFile.aufbewahrenBis` = Erstellung + `BERATUNGSDOKU_AUFBEWAHRUNG_JAHRE` (10). `eraseLead` lässt nur diese PDFs
  stehen (`aufbewahrtFilter`), `pruneTransient` löscht sie nach Ablauf; `eraseCustomerData` (Vertragsende) löscht alles.
  Der Dialog „E-Mail schreiben“ legt sein Beratungs-PDF jetzt ebenfalls als `beratungsdoku` ab.
- **Weg „Habe ich selbst gesendet“:** Vorschlag „Ablegen oder per App senden“: Vorlage `beratungsdoku` über die App
  (`sendeVorlagenMail`, PDF im Anhang), Mailprogramm/Kopieren (M1, PDF teilen bzw. herunterladen als Blob, „Gesendet?
  Ja“ protokolliert und legt ab) oder nur ablegen.
- **Offen (Ole/Anwältin):** Frist 10 Jahre ab Erstellung bestätigen (oder ab Vertragsende; Höchstfrist § 199 Abs. 3
  Nr. 2 BGB 30 Jahre); Rechtsgrundlage Art. 17 Abs. 3 lit. e DSGVO und Hinweis im Datenschutzhinweis für Leads;
  AVV: Aufbewahrung über die Löschung hinaus als Weisung des Vermittlers; Bedrock EU vor dem Einschalten in
  `SUBPROCESSORS` aufnehmen.

## M9 Erklärschritt (Sie-Form, freigegeben)

- Überschrift: „Ihre Kunden bekommen jede wichtige Mail. Sie schreiben keine davon.“
- Text: „Terminbestätigung, Erinnerung, ‚Ich habe Sie nicht erreicht‘: Diese Mails schicken wir automatisch in Ihrem Namen. Absender ist Ihr Name, unten steht Ihre Signatur, Antworten landen direkt bei Ihnen. Für Ihre Kunden kommt die Mail von Ihnen.“
- Punkte mit Icon: „Weniger vergessene Termine: Bestätigung mit Kalendereintrag und Erinnerung am Vortag.“ / „Nichts geht verloren: Sie bekommen eine Kopie jeder Mail in Ihr Postfach.“ / „Angebote und Vertragsunterlagen schicken Sie weiter wie gewohnt, auf Wunsch auch aus dem System Ihrer Gesellschaft.“
- Vorschau: echte Terminbestätigung aus denselben Funktionen wie der Versand (`content("booked")`, `leadEmailBody`, `leadSignatur`), Absenderzeile „Name | Agentur“ (`leadAnzeigename`), darunter klein die technische Adresse (`leadMailAdresse`; mit Postfach dessen Adresse).
- Hauptknopf „Ja, Mails in meinem Namen senden“ (Standard an): setzt die Voreinstellungen und BCC an. Zweitlink „Selbst entscheiden je Mail“: Liste automatisch / ein Tipp / aus (dieselbe Liste wie M7).
- Hinweis: „Sie können das jederzeit ändern. Ist Ihr Postfach verbunden, senden wir direkt von Ihrer Adresse.“
- Fehlende Signaturangaben (Name, Agentur, Telefon, Anschrift) vorher abfragen, mit Live-Vorschau (Felder wie `einrichtung/erstinfo-form.tsx`).
- Bei `mailFeaturesOff` anderer Text (nur Kopieren/mailto).
- Screenshots 390 und 1280 px.

## Risiken

Domainruf von dein-beratungstermin.de (DMARC-Überwachung, Bounce-/Abmeldegrenzen); Anzeigename mit fremder Marke kann Spoofing-Filter auslösen; doppelte Nachrichten WA+Mail (Tageslimit, Versatz); ohne M2 stoppt nur eine WA-Antwort das Nachfassen; UWG bei wiederholtem Nachfassen und tuer_offen (Abmeldelink, Standard „ein Tipp“); eingehende Mails/Anhänge mit Gesundheitsdaten (Resend USA, AVV, Löschung, Datenschutzerklärung); Aufbewahrung der Beratungsdokumentation (VVG) vs. Lead-Löschung.
