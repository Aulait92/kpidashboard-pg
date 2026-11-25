# Wöchentlicher Usability- und Design-Check, 25.11.2026

Prüfer: Produktteam (UX/UI und QA). Stand: `origin/claude/whatsapp-crm`, Commit `67350634`, eigener Worktree `/home/user/pg-ux` (nichts committet, nichts gepusht, danach entfernt).

Vorgehen: App lokal nach `tools/erklaervideos/README.md` Abschnitt 1 (eigenes Postgres 16, Schema per `prisma migrate diff`, Seeds `seed.ts`, `wa.ts`, `termin.ts`, `ev_zustand.mjs`, `wa_einrichtung.mjs`, alle Neuigkeiten-Migrationen, `next dev` mit `DIALOG360_PARTNER_ID=demo`). Logins: `demo@pg.local` (eingerichteter Vertreter), `max.mustermann@gmail.com` (offene Einrichtung), ein lokaler QA-Admin. Für /book und /angebot je ein Demo-Datensatz ergänzt. Playwright (Chromium), 1440×900 (`-d`) und 390×844 (`-m`), deviceScaleFactor 1, externe Anfragen im Browser gesperrt. Gemessen je Seite: HTTP-Status, Querscrollen, Schrift unter 13 px, Kontrast nach WCAG AA, abgeschnittene Texte, „n/a“, `{{…}}`, Gedankenstriche, Konsolenfehler. Alle Bilder liegen in diesem Ordner. Der runde „N“-Knopf und „Rendering…“ unten links sind die Next.js-Entwickleranzeige.

Gesamtbild: stabil. 33 Kundenseiten, 14 Adminseiten, 8 öffentliche Seiten: alle 200 (404 nur gewollt), keine Konsolenfehler, kein Querscrollen auf 390 px, keine „n/a“, keine `{{…}}`, keine Gedankenstriche in sichtbaren Texten (Test `gedankenstriche.test.ts` grün), Schrift überall Geist. B1 und W1 bis W6 sind behoben, W7 nur teilweise. Neu ist ein echter Fehler im E-Mail-Fenster (falscher Empfänger) und ein Banner, das am Handy den ersten Bildschirm jeder Seite belegt.

## 1. Top-Probleme der Usability

### U1 E-Mail geht an den falschen Kontakt (Fehler, hohe Priorität)
* Was: Auf „Heute“ am Rechner einen anderen Kontakt rechts öffnen und „E-Mail“ tippen: Im Feld „An“ steht noch die Adresse des vorher geöffneten Kontakts. Die Vorlagen passen schon zum neuen Kontakt, die Anrede im Text auch, nur der Empfänger nicht. Nachgestellt: Alexander Kraus offen, dann Dennis Jung gewählt, E-Mail zeigt `alexander.kraus@example.com`. Ebenso nach „Termin verschieben“ (Panel springt auf den nächsten Kontakt, Mail an den alten).
* Beleg: `22-email-falscher-empfaenger-d.png`, `22-email-1-blatt-d.png` (Panel Alexander Kraus, Empfänger Verena Martin).
* Code: `src/components/lead-mail.tsx:131` (`useState(initialTo)` wird beim Kontaktwechsel nicht zurückgesetzt), eingebunden ohne `key` in `src/components/lead-detail-body.tsx:654`.
* Vorschlag: `key={lead.id}` an `<LeadMailComposer>` (oder an `<LeadDetailBody>` in `src/app/buyer/page.tsx:190`), dann starten alle Felder je Kontakt neu. Gleiches Muster bei anderen Blättern im rechten Panel prüfen.
* Aufwand: klein.

### U2 Datennutzungs-Banner belegt den ersten Bildschirm jeder Seite
* Was: „Neu: KI-Hilfe und gemeinsames Anzeigenlernen“ steht über jeder Kundenseite, mit 5 Zeilen Text (Handy 9 Zeilen). Am Handy füllt es 300 von 844 px, auf Kontakte ist danach nur ein Kontakt zu sehen, im Kontakt nur Name und Knöpfe. Am Rechner ist es mittig auf `max-w-5xl` gesetzt, der Seiteninhalt darunter links: zwei Achsen. Dazu kommen zwei blaue Hauptknöpfe pro Bildschirm (Banner „Verstanden“ plus Seitenaktion).
* Beleg: `10-buyer-m.png`, `24-kontakt-m-oben-m.png`, `27-kontakte-oben-m.png`, `27-chats-oben-m.png`, `10-buyer-d.png`.
* Code: `src/components/datennutzung-banner.tsx:48` (Container), `:58` (Text), Text in `src/lib/datennutzung.ts` (`BANNER_TEXT`).
* Vorschlag: Ein Satz plus Knöpfe („Wir nutzen neue KI-Hilfe und lernen gemeinsam aus Anzeigen. Sie können widersprechen.“), Details nur auf „Mehr erfahren“. Am Handy kompakte Leiste, nur auf Heute, nicht in Kontakt und Chat. Ausrichtung an der Seitenspalte. Pflichtinhalt (AWS, 14 Tage, Widerspruch) bleibt auf der Detailseite, vorher Recht kurz fragen, ob der Hinweis selbst gekürzt werden darf.
* Aufwand: klein.

### U3 Gleicher Kontakt steht auf „Heute“ zweimal mit widersprüchlicher Aufgabe
* Was: Miriam Hahn steht unter „Angebote senden“ („Angebot ablegen und senden“) und zugleich unter „Anrufen“ („Überfällig · Angebot nachfassen“). Nachfassen für ein Angebot, das noch nicht gesendet ist.
* Beleg: `28-heute-ohne-banner-m.png`, `20-anruf-3-nicht-erreicht-d.png`.
* Code: `src/lib/inbox.ts:273` (Liste „Angebote senden“), die Wiedervorlage „Angebot nachfassen“ (`src/lib/angebot-senden.ts:30`) wird für diese Kontakte nicht ausgeblendet.
* Vorschlag: Steht ein Kontakt unter „Angebote senden“, seine Wiedervorlage „Angebot nachfassen“ dort nicht zusätzlich zeigen (wie schon bei „Termin vor Wiedervorlage“).
* Aufwand: klein.

### U4 Interner Kundenname vor Leads (Rest von W7)
* Was: Die öffentliche Buchungsseite zeigt als Überschrift „Allianz Max Berger“ (interner `Customer.name`) mit Kürzel „MB“. Ebenso kommt der Name als Firmenvorschlag in die Erstinformation und als Firma in die E-Mail-Signatur, wenn keine Firma bestätigt ist.
* Beleg: `52-book-oben-m.png`, `50-book_qa_demo_berger-d.png`, `22-email-2-vorlage-d.png` (Signatur), `10-buyer_konto-d.png` (Untertitel Konto).
* Code: `src/app/book/[slug]/page.tsx:183` (`const advisor = conn.customer.name`) und `:351`; `src/lib/erstinformation-shared.ts:314` (`firmaVorschlag … || clean(customer.name)`); Signatur über `leadSignatur` in `src/components/lead-detail-body.tsx:464`.
* Vorschlag: Für alles, was Leads sehen, dieselbe Quelle wie die Präsentation (bestätigte `Erstinformation.firma`, sonst Name des Inhabers), nie `Customer.name`. Firmenvorschlag in der Erstinformation leer lassen statt Kundenname.
* Aufwand: klein bis mittel.

### U5 Abschluss-Blatt: „Abbrechen“ nach „gespeichert“ und Grammatik
* Was: Das Blatt sagt oben „Abschluss gespeichert“ und bietet unten „Fertig“ und „Abbrechen“. Unklar, ob „Abbrechen“ den Abschluss zurücknimmt (tut es nicht). Dazu „Nachricht von Herr Jung“ und „Abschluss mit Herr Jung“ statt „Herrn“.
* Beleg: `23-abschluss-2-blatt-d.png`, `23-abschluss-2-blatt-m.png`.
* Code: `src/components/abschluss-nachher.tsx:196` und `:258` (`stand.label` im Dativ).
* Vorschlag: Nur „Fertig“ und daneben „Rückgängig“ (wie im Toast); Dativ-Form der Anrede („Herrn“) verwenden.
* Aufwand: klein.

### U6 „Ergebnis“ auf Heute öffnet am Rechner nur den Kontakt
* Was: Unter „Wie lief es?“ heißt der Knopf „Ergebnis“, öffnet am Rechner aber nur den Kontakt rechts. Die Ergebnis-Auswahl (Nicht erreicht, Termin, Abschluss …) kommt nicht, der Vermittler muss oben „Abschluss“ oder „Verloren“ suchen. Nach dem Anruf über „Anrufen“ kommt die Auswahl dagegen sofort und funktioniert gut (`20-anruf-2-wie-lief-es-d.png`).
* Beleg: `23-abschluss-1-ergebnis-d.png`.
* Code: Heute-Liste „Wie lief es?“ in `src/app/buyer/page.tsx`, Ergebnis-Blatt `CallOutcomeSheet` in `src/components/call-outcome.tsx`.
* Vorschlag: „Ergebnis“ öffnet direkt das Blatt „Wie lief es mit …?“, der Kontakt rechts kann parallel aufgehen.
* Aufwand: klein.

### U7 Einrichtung „WhatsApp verbinden“: Checkliste widerspricht den Wahlmöglichkeiten, am Handy sehr lang
* Was: „Vorher kurz prüfen“ verlangt „eine Nummer, die nicht in der normalen WhatsApp-App genutzt wird“, direkt darunter werden „Meine Nummer aus der WhatsApp Business App“ und „Meine private WhatsApp-Nummer“ angeboten. Nach der Wahl folgt „Halten Sie bereit“ mit fast denselben Punkten. Der Schritt ist am Handy 3.088 px lang. „360dialog“ steht als Anbietername im Text.
* Beleg: `31-schritt10-d.png`, `32-whatsapp-gewaehlt-m.png`.
* Code: `src/components/whatsapp-guide.tsx:110`.
* Vorschlag: „Vorher kurz prüfen“ streichen, erst Nummer wählen lassen, dann nur die passende Liste zeigen (die gibt es schon). „360dialog“ durch „unserem WhatsApp-Partner“ ersetzen.
* Aufwand: klein.

### U8 Kalender: zwei Wege für „kein Online-Kalender“
* Was: „Ich habe keinen Online-Kalender“ (App-Kalender mit Einladung und Weiterleitung) und „Andere Quelle für freie Zeiten“ (Allianz-Online-Kalender, ICS) stehen nebeneinander und überschneiden sich. Der zweite Weg sagt „Termine tragen wir trotzdem in den oben verbundenen Kalender ein“, obwohl keiner verbunden ist. Die persönliche Termin-Adresse für die Weiterleitung wird erst nach „Ohne Online-Kalender starten“ sichtbar.
* Beleg: `33-kalender-ohne-online-d.png`, `30-buyer_kalender-d.png`.
* Code: `src/components/calendar-sources.tsx:821` und `:828`.
* Vorschlag: Eine Frage „Wo stehen Ihre Termine?“ mit drei Antworten (Google, Outlook, anderswo bzw. nirgends), darunter je der passende Weg. Satz in `:828` nur zeigen, wenn wirklich ein Kalender verbunden ist.
* Aufwand: mittel.

### U9 Einrichtung zeigt Start in der Vergangenheit
* Was: Bei offener Einrichtung „Start am Freitag, 20. November 2026. Bis dahin richten wir alles gemeinsam ein.“ und „Go-live am 20. November“, heute ist der 25.11. Dazu „2 von 11 erledigt“ bei 12 nummerierten Schritten plus einer Zwischenkarte „Beratungsdokumentation vorbereiten?“ ohne Nummer.
* Beleg: `30-buyer_einrichtung-d.png`.
* Code: `src/app/buyer/einrichtung/page.tsx:292` und `:301`.
* Vorschlag: Liegt der Start in der Vergangenheit: „Ihr Start ist überfällig, jetzt die offenen Schritte erledigen“. Zähler und Nummerierung angleichen (Start mitzählen oder nicht nummerieren), Beratungsdokumentation als Schritt oder in die Einstellungen.
* Aufwand: klein.

## 2. Design: die 5 Stellen mit dem größten Hebel

1. **Banner kürzen und ausrichten** (siehe U2). Vorher: `10-buyer-m.png`, `10-buyer-d.png`. Vorschlag: eine Zeile mit Titel, ein Satz, „Verstanden“ als einziger blauer Knopf, „Mehr erfahren“ als Textlink; Container an der Inhaltsspalte (`max-w` wie der Seiteninhalt, links bündig).
2. **Schrift unter 13 px vereinheitlichen.** Status-Chips (`Chip` in `src/components/ui/index.tsx:177`, 11 px), Kontakt-Aktionen am Handy (Anrufen, Chat, E-Mail, 11 px), untere Navigation (`src/components/buyer-shell.tsx:647`, 12 px), Zähler-Badge (`:268`, 10 px), Tabellenköpfe in Kontakte und Terminvorbereitung (11 px), Angebotskopf (11 px). Im Code 98-mal `text-[11px]`, 20-mal `text-[10px]` unter /buyer und components. Vorher: `24-kontakt-m-oben-m.png`, `10-buyer_kontakte-d.png`, `10-buyer_termine_cmwwgyrpt00etol7d6q9pa1yu_vorbereitu-d.png`. Vorschlag: Mindestgröße 13 px (`text-xs` ist im Projekt schon 13 px), Chips und Navigation auf `text-xs`.
3. **Ein blauer Knopf je Bildschirm.** Heute am Rechner: „Verstanden“, „Vorbereiten“, „Anrufliste starten“ gleichzeitig blau; Einrichtung Schritt 2: „Google-Kalender verbinden“, „Speichern“, „Zeiten speichern“. Vorher: `10-buyer-d.png`, `30-buyer_einrichtung-d.png`. Vorschlag: „Anrufliste starten“ und „Speichern“ als `secondary`, im Kalender-Schritt nur „Zeiten speichern“ blau.
4. **Admin-BWA lesbar machen.** Jede leere Zelle zeigt „noch keine Daten“ (12 Spalten × 20 Zeilen), Zeilentitel sind abgeschnitten („Meta-Werbung Pay-per-Lea…“, „Lead-Kosten Pay-per-Lead (…“). Vorher: `41-admin-bwa-d.png`. Vorschlag: leere Zellen als „·“, einmal oben „Monate ohne Daten sind grau“, erste Spalte breiter oder Zeilentitel umbrechen. Code: `src/components/admin/zahlen-view.tsx:1104`, Platzhalter `src/lib/platzhalter.ts:8`.
5. **Konto: eigener Knopfstil.** „Zahlungsart hinterlegen“ ist mit eigenen Klassen gebaut statt `buttonClass("primary")` (`src/app/buyer/konto/page.tsx:479`); dazu ist „Vertrag hier kündigen“ der erste und einzige Knopf in „Ihr Vertrag“. Vorher: `10-buyer_konto-d.png`. Vorschlag: Baustein verwenden; Kündigen als Textlink unten in der Karte.

Kontrast: Grundfarben bestehen AA (`--muted` #5b6883 auf Weiß 5,9:1). Unter AA nur Einzelstellen: grauer Text #6b7a96 auf Weiß 4,3:1 in der Beispielansicht unter Assistent (`10-buyer_einstellungen_assistent-d.png`), Blau auf Hellblau 4,4:1 („Sie“-Chip, Empfehlen-Hinweis), Weiß auf WhatsApp-Grün 2,0:1 (`10-buyer_empfehlen-d.png`), #6b7894 auf Dunkelblau 4,2:1 im Angebotskopf (`51-angebot-oben-m.png`). CI: #2563eb und #0b1220 als Tokens (`src/app/globals.css:5-6`), Schrift Geist durchgehend. Zusatzfarben (Violett für Wiedervorlage, Orange für „Vorbereiten“) sind als Statusfarben vertretbar.

## 3. Menü und Begriffe

Zu viele oder doppelte Punkte:
* Profilmenü (`26-profilmenue-d.png`) und Einstellungen (`10-buyer_einstellungen-d.png`) zusammen 23 Einträge. Doppelt: „Kollegen empfehlen“ (Profilmenü und Einstellungen › Mehr), Impressum/Datenschutz/Sicherheit (Profilmenü und Fuß der Einstellungen).
* Drei Wege zu Hilfe: „Hilfe“ in der Seitenleiste, „Etwas unklar? Feedback“ und „Einführung ansehen“ im Profilmenü (`src/components/buyer-shell.tsx:428`). Vorschlag: alles unter „Hilfe“.
* Werbebudget, Produkte, Pause und Monatsberichte liegen unter „Wachstum“ (Auswertung), das Konto verweist mit „Unter Wachstum“ dorthin (`src/app/buyer/konto/page.tsx:319`). Vertragsdinge in einer Auswertungsseite sind schwer zu finden.
* Einstellungen haben 15 Punkte in 6 Gruppen, darunter zwei Schalter ohne Unterseite; „Rückmeldung an Meta“ ist für Vermittler ein technischer Begriff.
* Neuigkeiten: 85 Einträge in 8 Tagen (etwa 10 pro Tag), mehrere Themen doppelt („Termine auch ohne Google oder Outlook“ 20.11. und „Termine auch ohne Online-Kalender“; „Kalendereintrag auch ohne Antwort“). AGENTS.md verlangt einen Eintrag je Tag. Vorschlag: wöchentlich bündeln.

Widersprüche:
* „Nachrichten“ (Navigation) und „Chat“, „Chat öffnen“, „Chats“ (Knöpfe, Designregeln) für dasselbe.
* „Wiedervorlage“, „Später melden“, „Später nochmal“ für ähnliche Handlungen.
* „Videocall“, „Video“, „Videotermin“ gemischt.
* Du/Sie: Demo-Daten duzen weiter („Sollen deine Kinder mitversichert sein?“, „dein Videocall“), obwohl der Demo-Kunde auf „Sie“ steht (`src/lib/demo-data.ts:270`, `27-chats-oben-m.png`). Betrifft App-Demo und Vorführungen.
* Admin Geld: „Alles erledigt, hier braucht gerade nichts Ihre Aufmerksamkeit“ direkt über „Ergebnis Vormonat: fehlt, Kosten vervollständigen“ (`40-admin_neu_zahlen-d.png`, `src/components/admin-neu/ui/aufmerksamkeit.tsx:22`).
* Admin Kundengewinnung: „Kosten je Neukunde 0 €“ und „Amortisation 0 Mon.“, aber „Kundenwert / CAC 1×“ auf Basis der Gründerzeit (`src/components/admin/zahlen-view.tsx:767`, `:770`). Eine Kachel, zwei Rechenbasen.
* „App aufs Handy“ bietet nur die iPhone-App; „Ich habe kein iPhone“ hakt den Schritt ab, ohne Android-Weg zu nennen (`src/components/iphone-app.tsx:134`, `31-schritt11-d.png`).
* Kontakte Reiter „Termin 6“, Wachstum „7 offene Termine“ im selben Zeitraum (`10-buyer_kontakte-d.png`, `10-buyer_wachstum-d.png`). Zählweise klären oder benennen.

Unklar:
* „2 von 11 erledigt“ bei 12 Schritten (U9).
* „Andere Quelle für freie Zeiten“ neben „Ich habe keinen Online-Kalender“ (U8).
* Abschluss-Blatt „Abbrechen“ nach dem Speichern (U5).
* Werbebudget-Regler am Rechner: „Betrag zum Ändern antippen“ (`src/app/buyer/konto/budget-card.tsx:138`).

## 4. Eindeutige Fehler

| Art | Was | Beleg | Code |
|---|---|---|---|
| Falsche Daten | E-Mail-Fenster übernimmt den Empfänger des vorher geöffneten Kontakts (U1) | `22-email-falscher-empfaenger-d.png` | `src/components/lead-mail.tsx:131` |
| Falscher Text | „von Herr Jung“, „Abschluss mit Herr Jung“ (Dativ) | `23-abschluss-2-blatt-d.png` | `src/components/abschluss-nachher.tsx:196`, `:258` |
| Falsche Angabe | Interner Kundenname „Allianz Max Berger“ als Überschrift der öffentlichen Buchungsseite | `52-book-oben-m.png` | `src/app/book/[slug]/page.tsx:183` |
| Falsches Datum | „Start am Freitag, 20. November“ und „Bis dahin …“ fünf Tage nach dem Termin | `30-buyer_einrichtung-d.png` | `src/app/buyer/einrichtung/page.tsx:292` |
| Falsche Zahl | Angebot ohne Produkte zeigt „Werbebudget zusammen etwa 0 € im Monat“ und „≈ 0 €“ in der Übersicht | `50-angebot_qa_offen_angebot_000000001-d.png` | `src/components/offer-document.tsx:532` |
| Abgeschnitten | BWA-Zeilentitel („Meta-Werbung Pay-per-Lea…“, „Lead-Kosten Pay-per-Lead (…“) | `41-admin-bwa-d.png` | `src/components/admin/zahlen-view.tsx:1104` |
| Widerspruch | Kontakt gleichzeitig „Angebot senden“ und „Angebot nachfassen, überfällig“ | `28-heute-ohne-banner-m.png` | `src/lib/inbox.ts:273` |
| Absturz | keiner gefunden | | |
| Kaputter Link | keiner gefunden (W4 behoben) | | |
| Gedankenstrich, „n/a“, `{{…}}` | keine in sichtbaren Texten | | |

## 5. Neues der letzten 8 Tage (Stichprobe)

* **Nachfass-Vorlagen** (Auswahl im Chat): Komponente `src/app/buyer/chats/nachfassen-wahl.tsx` vorhanden. In 30 Demo-Chats war kein Chat im Zustand „24-h-Fenster zu und Nachfassen bereit“, deshalb nicht in der Oberfläche gesehen. Die E-Mail-Vorlagen dagegen geprüft: „Passt gerade zu diesem Kontakt“ wechselt mit dem Kontakt, Platzhalter werden gefüllt, keine `{{…}}` (`22-email-2-vorlage-d.png`).
* **Weitere Sparte mit Preis**: Login-Karte „Mehr Leads mit einer weiteren Sparte: 350 € im Monat je Sparte (netto), ohne Einrichtungsgebühr“ und Wachstum › Produkte zeigen denselben Preis (`53-login-karte-sparte-m.png`, `10-buyer_wachstum-d.png`). In Ordnung.
* **Einladung ohne Bestätigung**: nur Versandlogik, in der Oberfläche nicht sichtbar, nicht ausgelöst.
* **Datenschutz und Recht im Vertrieb** (Admin): Seite mit klarem Leerzustand (`40-admin_neu_vertrieb_datenschutz-d.png`). Mit echten Fällen nicht prüfbar.
* **App-Kalender und Termin-Weiterleitung**: siehe U8 (`33-kalender-ohne-online-d.png`).
* **Banner und Neuigkeiten**: siehe U2. „Verstanden“ wirkt sofort, Toast, nach dem Neuladen weg (`28-banner-verstanden-m.png`, `28-heute-ohne-banner-m.png`). Detailseite übersichtlich nummeriert (`10-buyer_einstellungen_datennutzung-d.png`).
* **Einrichtung „App aufs Handy“**: am Rechner QR-Code und Knopf, gut (`31-schritt11-d.png`). Nur iPhone, Android-Nutzer bekommen nur „Ich habe kein iPhone“.
* **vorlagenVon** (Gemeinsames Anzeigenlernen): nur im Admin nach einem Kampagnenlauf sichtbar, lokal kein Lauf, Kampagnenseite lädt (`40-admin_neu_kunden_cmwwgyovu0000nc7da3rmrp04_kampagn-d.png`). Nicht in der Oberfläche prüfbar.
* **Admin Zahlen/BWA**: siehe Design 4 und Widersprüche (`41-admin-bwa-d.png`).

## 6. Kernabläufe (Rechner und Handy)

| Ablauf | Rechner | Handy | Bemerkung |
|---|---|---|---|
| Lead anrufen, Ergebnis | ok `20-anruf-*-d.png` | ok `20-anruf-*-m.png` | „Wie lief es mit …?“ nach Rückkehr, Toast mit „Rückgängig“. Am Rechner öffnet „Anrufen“ in der Liste nicht den Kontakt rechts (rechts bleibt der alte). |
| Termin verschieben | ok `21-verschieben-*-d.png` | ok `21-kontakt-offen-m.png`, `21-verschieben-*-m.png` | Blatt mit aktuellem Termin, Toast „Termin verschoben auf Fr., 27.11., 11:30 Uhr“. Danach springt das Panel auf den nächsten Kontakt (siehe U1). |
| E-Mail mit Vorlage | Fehler U1 | ok `22-email-*-m.png` | Am Handy (eigene Kontaktseite) richtiger Empfänger. |
| Abschluss eintragen | ok mit U5 `23-abschluss-*-d.png` | ok mit U5 `23-abschluss-2-blatt-m.png` | Schätzwert-Hinweis jetzt da (KLEIN 10 behoben). |
| WhatsApp verbinden | ok bis Übergabe `31-schritt10-d.png` | ok, sehr lang `32-whatsapp-gewaehlt-m.png` | Siehe U7. |
| Zahlart hinterlegen | nicht prüfbar | nicht prüfbar | Knopf nur mit Stripe-Schlüssel und Stripe-Kunde, lokal keiner (wie am 19.11.). |

## 7. Stand der Funde vom 19.11.

| Fund | Stand | Beleg |
|---|---|---|
| B1 Name in der Erstinformation | behoben: Feld 188 px breit, Vorschlag aus dem Anzeigenamen („Max Mustermann“) | `31-schritt5-d.png` |
| W1 Versicherer weitergeben | behoben: Vorschlag und Präsentationsdesign aus der gewählten Gesellschaft (`erstinformation-shared.ts:317-322`, `praesentation.ts:58`) | Code |
| W2 Allianz-Kalender für alle | behoben: nur bei Allianz oder ohne Angabe (`einrichtung/page.tsx:200`, `kalender/page.tsx:64`) | Code |
| W3 „Versicherer erlaubt das nicht“ bei Maklern | behoben über `schrittAuswege(…, { makler })` (`einrichtung/page.tsx:455`) | Code |
| W4 Toter Link „Schreiben Sie uns“ | behoben: öffnet den Hilfe-Chat (`vorlagen/page.tsx:173`) | `10-buyer_vorlagen-d.png` |
| W5 Fehlerseite | behoben: `src/app/buyer/error.tsx` vorhanden (kein Renderfehler ausgelöst) | Code |
| W6 Hilfetermin ohne Zeiten | behoben: Telefonnummer und „Rückruf anfragen“ (`einrichtung/page.tsx:261`) | Code |
| W7 Interner Kundenname | teilweise: Präsentation und Seitenleiste behoben; offen auf /book, im Firmenvorschlag der Erstinformation, in der Signatur und im Konto-Untertitel (U4) | `52-book-oben-m.png` |
| KLEIN 1 Gründername als Beispiel | behoben | Code |
| KLEIN 2 Versicherungsvermittlerin | behoben (`vermittlerBeruf`) | Code |
| KLEIN 3 Beispiel „Privatschutz“ ohne Produkte | offen (`src/lib/so-arbeitet-server.ts:12`) | Code |
| KLEIN 4 WhatsApp-Versprechen vor dem Verbinden | behoben (Text abhängig vom Stand, `einrichtung/page.tsx:884-886`) | Code |
| KLEIN 5 Versicherer doppelt abgefragt | behoben mit W1 | Code |
| KLEIN 6 „antippen“ am Rechner | offen, jetzt „Betrag zum Ändern antippen“ | `10-buyer_wachstum-d.png` |
| KLEIN 7 Meta-Knopf in Du-Form | behoben, als Zitat gekennzeichnet | Code |
| KLEIN 8 Demo-Daten duzen | offen | `27-chats-oben-m.png` |
| KLEIN 9 Rohes JSON bei fehlendem OAuth | behoben für Kunden (Rücksprung mit Hinweis) | Code |
| KLEIN 10 Schätzwert beim Abschluss | behoben („Ohne Auswahl bleibt ein Schätzwert gespeichert, später änderbar.“) | `23-abschluss-2-blatt-d.png` |

## 8. Sentry (Kundenbereich, letzte 7 Tage)

Organisation ole-kannapinn-ug, Projekt kpidashboard-pg, ungelöste Issues: 13. Im Kundenbereich nur zwei, beide selten:
* KPIDASHBOARD-PG-S „In der Vorschau nicht möglich.“ auf `POST /buyer/bestellen`, 2 Ereignisse am 22.11. (Admin in der Kundenvorschau, kein Kundenfehler; sollte als Hinweis statt als Fehler gemeldet werden).
* KPIDASHBOARD-PG-N „The router state header was sent but could not be parsed.“ auf `/f/[funnel]` (öffentlicher Funnel), 10 Ereignisse 20. bis 22.11.
Häufigste Fehler insgesamt sind Hintergrundjobs ohne Kundensicht: `resend_receiving_list:restricted_api_key` im WhatsApp-Cron (83, neu seit 22.11., Schlüssel ohne Leserecht), Instantly 429 (37), Meta-Kampagnen 400 (Nutzungsbedingungen, doppelter Formularname). Hinweis für Kunden: KPIDASHBOARD-PG-J „SMS-Ersatz fehlgeschlagen: Guthaben reicht nicht aus“ (1, 20.11.), Leads ohne WhatsApp bekommen dann keine SMS.

## 9. Nicht oder nur teilweise geprüft

* Zahlart hinterlegen (Stripe), echte Weitergabe an Google, Microsoft, 360dialog/Meta: lokal keine Zugänge.
* Nachfass-Vorlagen-Auswahl im Chat: Demo-Daten ohne passenden Chat-Zustand.
* vorlagenVon-Block im Admin: braucht einen Kampagnenlauf.
* Termin-Weiterleitung und Einladung ohne Bestätigung: Mail-Eingang und Versand nicht auslösbar.
* Empfehlungsseite: Modul ausgeblendet, Link zeigt „Dieser Link ist nicht mehr aktiv“ (`50-empfehlung_qaempfehlung123-d.png`), Inhalt nicht prüfbar.
* Android, echte iPhone-App und Push: nicht geprüft.
* Kontrast über Hintergrundbilder und Verläufe misst das Skript nicht; Zähler-Badges wurden als Fehlalarm aussortiert.
* Hinweis: Beim Aufruf von `/buyer/whatsapp-verbinden` leitete der Server mit der Schein-Partner-ID `demo` auf die Seite von 360dialog weiter (Weiterleitung nicht vom Browserfilter erfasst, nur erfundene Demo-Daten). Screenshot verworfen.
