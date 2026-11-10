# Livegang-Drehbuch (geplant ~21.11.2026)

Ziel: Der Stand aus `claude/whatsapp-crm` (Sandbox, termin.performancegrowth.de)
geht auf die Produktion `claude/facebook-ad-media-buyer-GdTgt`
(Service `kpidashboard-pg`, app.performancegrowth.de).

Stand 10.11.: Der Produktions-Branch ist vollständig im Entwicklungs-Branch
enthalten. Der Merge ist konfliktfrei.

## Vorher (bis 20.11.)

- [x] **Probelauf Migrationen** gegen eine PITR-Kopie der Produktion (10.11., siehe
      unten). Vor dem Livegang nur wiederholen, wenn neue Migrationen dazukommen.
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
      „Abonnement als unbezahlt markieren“). Webhook-Endpunkt
      `https://app.performancegrowth.de/api/stripe/webhook` mit den Ereignissen aus
      `src/lib/billing-webhook.ts` (`HANDLED_EVENTS`).

- [ ] **Neue Adressen** (Produktion `app.performancegrowth.de`, Testumgebung
      `staging.performancegrowth.de`): DNS beim Domain-Anbieter (CNAME laut Railway),
      in Railway je Service die Custom Domain hinzufügen (alte Domains bleiben vorerst dran).
      Variablen: `APP_URL` = neue Adresse, `LEGACY_HOSTS` = `kpi.performancegrowth.de` bzw.
      `termin.performancegrowth.de` (Seitenaufrufe werden umgeleitet, `/api/…` läuft weiter).
      Google/Microsoft: Redirect-URIs für `app.` und `staging.` (Kalender `/api/google|microsoft/callback`,
      Login `/api/auth/google|microsoft/callback`).

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
   14 × `Migration … marked as applied.` … `[migrate] Schema aktuell.`
   Bricht es mit `ABBRUCH` ab: Es wurde nichts verändert, alte Version läuft weiter.
   Meldung lesen und mir schicken.
4. **Kurztest** (je 1 Minute):
   - Admin-Login, Zahlen, Kunden, Vertrieb, Leads öffnen
   - `https://app.performancegrowth.de/api/status` → `{"ok":true}`
   - Kunden-Login (Anid) → Heute, Leads
5. **Cold CRM** ein letztes Mal importieren (Einstellungen → Import & Instantly),
   danach `COLD_CRM_DATABASE_URL` löschen.
6. **Webhooks umstellen** auf `https://app.performancegrowth.de/…`:
   - Meta-App → Webhooks → Page → `leadgen`: `/api/meta/leadgen`
   - **Anid erst nach seiner Freigabe (geplant Ende November)**: Anid muss als zweiter
     Admin die Partnerfreigabe für „Ole Kannapinn UG“ bestätigen (Werbekonto „WK Anid
     Schwarzkopf“ 1088907616945081 + Seite, volle Kontrolle). Danach in unserem Portfolio
     beides dem Systemnutzer zuweisen. Dann: Kundenakte → Leads & Formulare → Werbekonto
     1088907616945081 „Speichern & prüfen“; Lead-Eingang: Formular 1909684100014197 (Seite
     996034096924997) zuordnen (Privatschutz), Testlead → erscheint bei Anid → Zap
     „Allianz Lead Ads“ bzw. Anid-Zap ausschalten. Bis dahin läuft Anid über den Zap weiter.
   - Zapier (Lead-Webhook, falls noch aktiv): `/api/leads/eingang?token=…`
   - Instantly: `/api/vertrieb/…` (wie bisher in der Sandbox)
   - Calendly: wie bisher in der Sandbox
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
