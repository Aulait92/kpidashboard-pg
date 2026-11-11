# Livegang-Drehbuch (geplant ~21.11.2026)

Ziel: Der Stand aus `claude/whatsapp-crm` (Sandbox, termin.performancegrowth.de)
geht auf die Produktion `claude/facebook-ad-media-buyer-GdTgt`
(Service `kpidashboard-pg`, app.performancegrowth.de).

Stand 10.11.: Der Produktions-Branch ist vollständig im Entwicklungs-Branch
enthalten. Der Merge ist konfliktfrei.

## Vorher (bis 20.11.)

- [x] **Probelauf Migrationen** gegen eine PITR-Kopie der Produktion (10.11., zweimal,
      zuletzt mit Stand `362808f` und allen 22 Migrationen, siehe unten). Vor dem
      Livegang nur wiederholen, wenn neue Migrationen dazukommen
      (`ls prisma/migrations` mit der Liste unten vergleichen).
- [ ] **Probelauf 3** mit dem Stand, der live geht (ca. 19./20.11., nach Code-Stopp):
      seit Probelauf 2 sind **13 Migrationen dazugekommen** (jetzt 35, siehe
      „Neue Migrationen seit Probelauf 2“). Ablauf wie Probelauf 2.

### Neue Migrationen seit Probelauf 2 (Stand 11.11.)

| Migration | Was | Beim Einmessen |
|---|---|---|
| `20261111090000_erstkontakt_sofort` | Standard-Wartezeit des Assistenten 10 → 0 Min. (Spalten-Standard) und bestehende Assistenten mit 10 Min. auf 0 | Spalten-Standard kommt über den Schema-Abgleich. Die Daten-Umstellung läuft beim Einmessen **nicht** – unkritisch, weil die Produktion noch keine Assistenten hat (`AgentConfig` = 0 Zeilen im Probelauf). |
| `20261111100000_neue_oberflaeche` | Spalte `Customer.newUi` (neue Oberfläche je Kunde, Standard aus) | über den Schema-Abgleich, nur hinzufügend |
| `20261111110000_nachfass_abfolgen` | Spalte `AgentConfig.followUpSequencesEnabled` (Standard aus) und Tabelle `LeadSequence` | über den Schema-Abgleich, nur hinzufügend |
| `20261112090000_admin_neue_oberflaeche` | Spalte `User.adminNewUi` (Standard aus) | über den Schema-Abgleich, nur hinzufügend |
| `20261112100000_heute_ausblenden` | Tabelle `AdminDismissal` (in „Heute“ abgehakte/auf später gelegte Punkte je Admin) | über den Schema-Abgleich, nur hinzufügend |
| `20261112110000_storno_automatisch` | Spalte `LeadSubscription.stornoAutoApprove` (Standard aus = bisherige Regel) | über den Schema-Abgleich, nur hinzufügend |
| `20261112120000_provisionen` | Spalten `Customer.vermittlerTyp` (Standard „vertreter“) und `Customer.provisionRates` | über den Schema-Abgleich, nur hinzufügend |
| `20261113090000_kosten_zweck` | Tabellen `RecurringCost` (laufende Kosten mit Zweck) und `KpiSettings` (Gründerzeit, Kampagnen, Update-Texte) für die Zahlen-Seite | über den Schema-Abgleich, nur hinzufügend |
| `20261113100000_preise_plaetze_jahr_bestand` | Preise 11.11.: Spalten am `Offer` (`seats`, `seatsIncluded`, `seatMonthly`, `bestandMonthly`, `annualPrepay`, `annualFreeMonths`) und am `Customer` (`seatsIncluded`, `seatMonthly`, `seatsBilled`, `billingInterval` Standard „month“, `bestandMonthly`, `bestandGrandfathered`, `bestandRequestedAt`, `bestandMessageQuota`); setzt `bestandGrandfathered` für Kunden mit freigeschaltetem Bestand | Spalten über den Schema-Abgleich, nur hinzufügend. Das `UPDATE` (Bestandsschutz-Markierung) läuft beim Einmessen **nicht** – unkritisch: der Zugang hängt weiter an `existingCustomersEnabled`, das unverändert bleibt; die Markierung ist nur Anzeige. Alt-Kunden haben `seatsIncluded = NULL` → keine Platz-Abrechnung. |
| `20261113110000_rechner` | Tabelle `RechnerConfig` (Einstellungen des öffentlichen Break-even-Rechners als JSON) | über den Schema-Abgleich, nur hinzufügend |
| `20261113120000_garantien` | Tabelle `GarantieFall` (Lead- und Break-even-Garantie: Fall je Kunde, Art und Monat mit Kennzahlen, Entscheidung, Stripe-Gutschrift), siehe `docs/garantien.md` | über den Schema-Abgleich, nur hinzufügend |
| `20261113130000_abwesenheit` | Tabelle `UserAbsence` („Ich bin abwesend“: von–bis, Grund-Kategorie, Vertretung, verschobene Aufgaben zum Rückgängigmachen) | über den Schema-Abgleich, nur hinzufügend |
| `20261113140000_makler_angebot` | Spalte `Offer.vermittlerTyp` (Standard „vertreter“): Makler-Angebote mit Vertrags-Garantie und Bestandskunden-Modul inklusive | über den Schema-Abgleich, nur hinzufügend |

Keine davon verändert bestehende Daten der Produktion. Neue Funktionen sind
pro Kunde schaltbar und standardmäßig aus (Ausnahme: Live-Aktualisierung und
KI-Hilfe, die brauchen keine Migration).
- [x] **Healthcheck** am Service `kpidashboard-pg`: seit 10.11. `/login`, Timeout 300 s
      (der alte Produktions-Code hat `/api/health` noch nicht). Schlägt die Migration
      beim Livegang fehl, bleibt die alte Version online.
      **Nach dem Livegang** auf `/api/health` umstellen (prüft auch die Datenbank).
- [ ] **Variablen** im Service `kpidashboard-pg` ergänzen (Werte nicht aus der
      Sandbox kopieren, wo „neu“ steht):

| Variable | Wert |
|---|---|
| `ENCRYPTION_KEY` | **neu** erzeugen: `openssl rand -base64 32` |
| `WHATSAPP_WEBHOOK_SECRET` | **neu**, langer Zufallswert |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **Live**-Schlüssel bzw. Signatur des Live-Webhooks |
| `META_ACCESS_TOKEN` | **neuer** System-User-Token (mit leads_retrieval, pages_manage_metadata; 10.11. erzeugt) – ersetzt den alten, vorher in der Sandbox prüfen (Lead-Eingang: alles grün, Werbekonten lesbar) |
| `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | wie Sandbox |
| `LEAD_WEBHOOK_TOKEN`, `VERTRIEB_WEBHOOK_TOKEN` | wie Sandbox (sonst Zapier/Instantly anpassen) |
| `INSTANTLY_API_KEY`, `CALENDLY_TOKEN` | wie Sandbox |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | wie Sandbox |
| `GOOGLE_REDIRECT_URI` | `https://app.performancegrowth.de/api/google/callback` |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT` | wie Sandbox |
| `MICROSOFT_REDIRECT_URI` | `https://app.performancegrowth.de/api/microsoft/callback` |
| `DIALOG360_BASE_URL` | wie Sandbox |
| `OFFER_EMAIL_FROM`, `OFFER_REPLY_TO`, `BOOKING_EMAIL_FROM` | wie Sandbox |
| `SENTRY_ENVIRONMENT` | `production` |

  Nicht übernehmen: `DEMO_TOOLS`, `DIALOG360_SANDBOX_API_KEY`, `COLD_CRM_DATABASE_URL`
  (nur für den letzten Import nötig, danach löschen).

- [ ] Google Cloud Console: Redirect-URI `https://app.performancegrowth.de/api/google/callback`
      hinzufügen. Microsoft (Entra): ebenso `/api/microsoft/callback`.
- [ ] **Login mit Microsoft/Google** (gleiche OAuth-Apps), Redirect-URIs zusätzlich eintragen,
      für Sandbox und Produktion:
      `https://termin.performancegrowth.de/api/auth/google/callback`,
      `https://app.performancegrowth.de/api/auth/google/callback` (Google Cloud Console →
      Anmeldedaten → OAuth-Client) und dasselbe mit `/api/auth/microsoft/callback` in Entra
      (App-Registrierung → Authentifizierung → Web). In Entra unter „Unterstützte Kontotypen“
      Konten in beliebigen Organisationen zulassen (Allianz-Konten), `MICROSOFT_TENANT=common`.
      Google: Login braucht nur „openid email profile“ (keine Prüfung nötig), der
      Zustimmungsbildschirm muss aber auf „In Produktion“ stehen, sonst kommen nur Testnutzer rein.
- [ ] Stripe **Live**: Branding, Steuer, Kundenportal, Smart Retries (wie Sandbox:
      „Abonnement als unbezahlt markieren“). Branding wie Sandbox: Logo mit weißem
      Hintergrund (lesbar auf Rechnung und auf blauem Checkout), Checkout-Hintergrund weiß,
      Schaltflächen #2563EB. Webhook-Endpunkt
      `https://app.performancegrowth.de/api/stripe/webhook` mit den Ereignissen aus
      `src/lib/billing-webhook.ts` (`HANDLED_EVENTS`).
      **Preise 11.11.:** Produkte „Weiterer Berater-Login“ (`pg_key=seat`) und
      „Bestandskunden-Modul“ (`pg_key=bestand`) legt die App beim ersten Bedarf selbst an
      (wie die übrigen Produkte, über `metadata.pg_key`); Preise kommen je Abo als
      `price_data` (49 € je Login/Monat, 149 €/Monat; bei Jahreszahlung Intervall „year“
      mit 10 × Monatspreis). Nichts von Hand anlegen. Nach dem Livegang einmal in Stripe
      prüfen, dass beide Produkte im Live-Modus da sind (nach dem ersten Abo mit Zusatz).
      WhatsApp-Gebühren werden nicht mehr weiterberechnet (`PRICE_LIST.whatsappIncluded`).

- [ ] **Neue Adressen** (Produktion `app.performancegrowth.de`, Testumgebung
      `staging.performancegrowth.de`): DNS beim Domain-Anbieter (CNAME laut Railway),
      in Railway je Service die Custom Domain hinzufügen (alte Domains bleiben vorerst dran).
      Variablen: `APP_URL` = neue Adresse, `LEGACY_HOSTS` = `kpi.performancegrowth.de` bzw.
      `termin.performancegrowth.de` (Seitenaufrufe werden umgeleitet, `/api/…` läuft weiter).
      Google/Microsoft: Redirect-URIs für `app.` und `staging.` (Kalender `/api/google|microsoft/callback`,
      Login `/api/auth/google|microsoft/callback`).
      Stand 10.11.: DNS beider Adressen verifiziert, Redirect-URIs eingetragen, Testumgebung
      umgestellt (inkl. eigener VAPID-Schlüssel für Push). Offen nur noch die Produktion:
      `APP_URL`, `GOOGLE_REDIRECT_URI`, `MICROSOFT_REDIRECT_URI` auf `app.…`,
      `LEGACY_HOSTS=kpi.performancegrowth.de`.

## Am Tag

1. **Zeitpunkt T0 notieren** (Uhrzeit, UTC). Die Produktion sichert fortlaufend
   (PITR, ca. 4 Wochen). Zusätzlich im Dashboard unter Postgres → Backups ein
   manuelles Backup anlegen.
2. In cron-job.org die Jobs **Sync** und **WhatsApp-Cron** kurz pausieren.
3. **Merge**: Pull Request `claude/whatsapp-crm` → `claude/facebook-ad-media-buyer-GdTgt`.
   Railway baut und startet. Im Log von `kpidashboard-pg` erwartet (wie im Probelauf):
   `[migrate] Alte Einträge aus früherem Verlauf (bleiben unberührt): …`
   `[migrate] Datenbank ohne (eigene) Migrations-Historie – wird einmalig eingemessen.`
   `[migrate] Schema wird angeglichen (nur hinzufügende Änderungen).`
   35 × `Migration … marked as applied.` (bis `20261113140000_makler_angebot`), dazwischen
   `[migrate] 20261110120001_status_seit_trigger wird beim Einmessen ausgeführt.`,
   am Ende `No pending migrations to apply.` und `[migrate] Schema aktuell.`
   (Die roten Zeilen „Loaded Prisma config …“ sind nur Hinweise, keine Fehler.)
   Bricht es mit `ABBRUCH` ab: Es wurde nichts verändert, alte Version läuft weiter.
   Meldung lesen und mir schicken.
4. **Kurztest** (je 1 Minute):
   - Admin-Login, Zahlen, Kunden, Vertrieb, Leads öffnen
   - `https://app.performancegrowth.de/api/status` → `{"ok":true}`
   - Kunden-Login (Anid) → Heute, Leads
5. **Vertrieb aus der Testumgebung übernehmen** (geändert am 10.11.): Das Cold CRM ist
   seit 10.11. eingefroren, der Vertrieb wurde auf staging neu importiert und wird seitdem
   dort geführt. Am Livegang kommen die Vertriebsdaten deshalb aus der staging-Datenbank,
   **nicht** mehr aus dem Cold CRM. Verfahren (gebaut 11.11., in Probelauf 3 proben):
   - In der Produktion vorübergehend setzen: `VERTRIEB_QUELLE_URL` = interne Adresse der
     staging-Datenbank (Railway-Referenz `${{Postgres-mkXB.DATABASE_URL}}`) und
     `VERTRIEB_NEUIMPORT_ERLAUBT=1`.
   - Admin → Vertrieb → Anbindungen → „Vertrieb aus der Testumgebung“ → ERSETZEN.
     Kopiert Kontakte, Verlauf, Aufgaben, Kampagnen, Mails, Termine, Leads; **keine Angebote**
     (Stripe-Testdaten). Verknüpfungen zu Kundenakten werden geleert, Sicherung im Schema
     `backup_vertrieb_…`.
   - Danach am Kontakt „Mit Kundenakte verknüpfen“ (Kundendaten): Norman Heller → seine
     Pay-per-Lead-Kundenakte, Andy Deibel → Kundenakte „Nur Betreuung“.
   - Beide Variablen wieder löschen.
   Danach `COLD_CRM_DATABASE_URL` und `VERTRIEB_NEUIMPORT_ERLAUBT` auf staging löschen.
   `MAIL_NUR_AN` (Mail-Sperre) gibt es **nur auf staging** – in der Produktion nicht setzen,
   sonst bekommen Kunden und Leads keine Mails.
   **Vertriebskontakt ↔ Kundenakte verknüpfen** (Stand 10.11., laut Ole):
   - Norman Heller: Pay-per-Lead-Kunde (Kundenakte mit Bezug)
   - Andy Deibel: Kunde ohne Software („Nur Betreuung“)
   - Beytullah, Jens Haferstroh: **noch keine Kunden**, im Gespräch. Gehören in die
     Vertriebs-Pipeline, nicht in die Kunden-Pipeline.
   Vor dem Livegang mit Ole abgleichen, ob sich daran etwas geändert hat.
6. **Webhooks umstellen** auf `https://app.performancegrowth.de/…`:
   - Meta-App → Webhooks → Page → `leadgen`: `/api/meta/leadgen`
   - **Anid erst nach seiner Freigabe (geplant Ende November)**: Anid muss als zweiter
     Admin die Partnerfreigabe für „Ole Kannapinn UG“ bestätigen (Werbekonto „WK Anid
     Schwarzkopf“ 1088907616945081 + Seite, volle Kontrolle). Danach in unserem Portfolio
     beides dem Systemnutzer zuweisen. Dann: Kundenakte → Leads & Formulare → Werbekonto
     1088907616945081 „Speichern & prüfen“; Lead-Eingang: Formular 1909684100014197 (Seite
     996034096924997) zuordnen (Privatschutz), Testlead → erscheint bei Anid → Anids Zap
     (Privatschutz → Airtable) ausschalten. Bis dahin läuft Anid über den Zap weiter.
     **Nicht** „Allianz Lead Ads“ ausschalten: das ist unser eigener Vertriebs-Zap.
   - Zapier (Lead-Webhook, falls noch aktiv): `/api/leads/eingang?token=…`
   - Instantly: Webhook-URL von `staging.` auf `app.` ändern (`/api/vertrieb/instantly/webhook`)
   - Calendly: in der Produktion unter Vertrieb → Anbindungen „Calendly verbinden“
   - Zaps „Allianz Lead Ads“ (`/api/vertrieb/leads/webhook`) und „Gmail to Webhooks on New
     Email Match“ (`/api/vertrieb/linkedin/message`): URL von `staging.` auf `app.` ändern.
     Token ggf. anpassen, falls `VERTRIEB_WEBHOOK_TOKEN` in der Produktion anders ist.
   - 360dialog: je Kunde in der Kundenakte → WhatsApp-Assistent → Nummer
     „ändern“ → speichern (setzt den Webhook auf die neue Adresse)
7. **cron-job.org**:
   - WhatsApp-Cron auf `https://app.performancegrowth.de/api/whatsapp/cron?token=<WHATSAPP_WEBHOOK_SECRET>`
     (alle 5 Min.), Sync wieder aktivieren
   - Neuer Job **Überwachung**: `https://app.performancegrowth.de/api/status`
     alle 5 Min., Benachrichtigung bei Fehlschlag per E-Mail an,
     „nach 2 Fehlschlägen“
   - Bei beiden Jobs „Bei Fehlschlag benachrichtigen“ einschalten
8. **Zwei-Faktor-Login** für jeden Admin einrichten: Einstellungen → Sicherheit
   (braucht `ENCRYPTION_KEY`). Notfall-Codes im Passwort-Manager sichern.
9. **Abschalten**: Railway-Projekt „Cold CRM“ (inkl. TCP-Proxy) stoppen bzw.
   löschen, wenn alles läuft. Die Sandbox (termin.performancegrowth.de) bleibt
   als Testumgebung.

Demo-Daten liegen nur in der Sandbox-Datenbank und kommen nicht mit.

## Danach (ab 22.11.)

1. **Kurztest KI-Hilfe**: mit einem Kunden-Login „Hilfe“ öffnen und eine Frage stellen
   (braucht `ANTHROPIC_API_KEY`, ist für den WhatsApp-Assistenten schon gesetzt).
2. **Neue Oberfläche** (Vertreter-A) für Pilot-Kunden einschalten: Kundenakte →
   WhatsApp/Module → „Neue Oberfläche“. Erst ein Kunde, nach ein paar Tagen weitere.
3. **Nachfass-Abfolgen** je Kunde einschalten (Admin → WhatsApp-Assistent), sobald die
   Vorlagen `followup`, `followup_offer`, `followup_noshow`, `followup_last` bei Meta
   freigegeben sind.
4. **Live-Aktualisierung** einmal prüfen: Chat offen lassen, Testnachricht schicken –
   sollte in 2–3 s erscheinen (sonst puffert der Proxy; dann greift die Abfrage alle 3 s).
5. **Nutzung** (Admin → Zahlen → Nutzung) in der ersten Woche täglich ansehen:
   Fragen an die KI-Hilfe, „nicht hilfreich“-Bewertungen, liegen gebliebene Aufgaben.
6. **Neue Zahlen-Seite** (Admin → Zahlen) mit echten Daten prüfen: Umsatzbuch ab Juni plausibel
   (Pay-per-Lead vs. Airtable-Summen), laufende Kosten unter Einstellungen → Laufende Kosten
   eintragen (Instantly, Claude, Zapier …), eigene Meta-Kampagnen („Allianz Lead Ads“) prüfen.
7. **Bankanbindung** (geplant nach dem Livegang): Commerzbank über Enable Banking (Ole legt das
   Konto an, Zugangsdaten nur in Railway), täglicher Abruf der Abbuchungen, automatische
   Zuordnung nach Empfänger, Liste „Bitte zuordnen“, Meta ohne Doppelzählung. Amex: bei Enable
   Banking anfragen, sonst monatlicher CSV-Upload. Verzeichnis der Verarbeitungen ergänzen.

## Wenn etwas schiefgeht

- **App startet nicht** (Migration): alte Version bleibt online. Nichts tun,
  Log schicken.
- **Daten falsch nach dem Start**: Datenbank auf T0 zurückholen, siehe
  `docs/notfall-wiederherstellung.md`.
- **Webhook kommt nicht an**: `/api/status?token=…` und Railway-Logs prüfen;
  Webhooks zur Not auf die Sandbox zurückstellen.

## Ergebnis Probelauf (10.11.2026)

Kopie der Produktion per PITR (Stand 06:58 UTC), darauf der Stand
`claude/whatsapp-crm` mit `scripts/db-compare.mjs` vorher/nachher.

- Vorher: 27 Tabellen, alle Zeilenzahlen identisch mit der Produktion
  (u. a. Lead 2652, Revenue 2629, Customer 29, User 23).
- Erster Versuch **gescheitert**: Die Produktion hat schon `_prisma_migrations`
  mit 3 alten Einträgen (`20260101000000_baseline`,
  `20260517000000_add_creative_tables`, `20260517010000_fix_creative_telegram_columns`).
  Das Startskript übersprang das Einmessen, `0_init` brach ab
  („type CostKind already exists“). Behoben in `scripts/migrate.mjs` (Commit 4dae9c9).
- Zweiter Versuch **erfolgreich**: eingemessen (nur hinzufügende Änderungen),
  14 Migrationen als angewendet markiert, „Schema aktuell“. Alle bestehenden
  Tabellen danach unverändert; 19 neue, leere Tabellen dazu.

## Ergebnis Probelauf 2 (10.11.2026, nachmittags)

Neue PITR-Kopie der Produktion (Stand 15:17 UTC), darauf Stand `362808f`
(`claude/whatsapp-crm`, inkl. Pay-per-Lead und Bestandskunden). **Erfolgreich.**

- Vorher: 27 Tabellen, alle Zeilenzahlen identisch mit der Produktion
  (u. a. Lead 2655, Revenue 2632, Customer 29, User 23, Deal 115).
- Eingemessen: 22 Migrationen als angewendet markiert (`0_init` bis
  `20261110140000_bestandskunden`). `20261110120001_status_seit_trigger` wurde dabei
  wie vorgesehen ausgeführt (Markierung `-- @auch-beim-einmessen`), der Trigger für
  „Phase seit“ ist damit auch in der Produktion da.
- Nachher: 55 Tabellen (28 neue, leer), alle bestehenden Zeilenzahlen unverändert,
  `_prisma_migrations` 3 alte + 22 neue Einträge. „No pending migrations“, „Schema aktuell“.
- Dauer: ca. 30 Sekunden (Vergleich + Migration), dazu die normale Deploy-Zeit.
- Danach aufgeräumt: Probe-Service, Kopie und deren Volume gelöscht.
