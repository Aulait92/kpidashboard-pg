# Sicherheit: Cronjobs, Header, Drosselung (Stand 12.11.2026)

## 1. Cronjobs bei cron-job.org auf Header umstellen (Ole, ca. 5 Minuten)

Bisher steht das Geheimnis in der URL (`…?token=…`). URLs landen leicht in
Protokollen, Verläufen und Screenshots. Neu wird es als **Kopfzeile (Header)**
mitgeschickt. Die alte Variante funktioniert vorerst weiter (Übergang), die App
schreibt dann aber stündlich eine Warnung ins Log.

Betroffene Jobs:

| Job | URL (ohne Token) | Header-Wert |
|---|---|---|
| WhatsApp-Cron (alle 5 Min.) | `https://app.performancegrowth.de/api/whatsapp/cron` | `Bearer ` + Wert von `WHATSAPP_WEBHOOK_SECRET` |
| Airtable-Abgleich (Sync) | `https://app.performancegrowth.de/api/sync` | `Bearer ` + Wert von `SYNC_TOKEN` |
| Termin-Erinnerungen (alt, falls noch aktiv) | `https://app.performancegrowth.de/api/whatsapp/reminders` | wie WhatsApp-Cron |
| Überwachung | `https://app.performancegrowth.de/api/status` | bleibt ohne Token (zeigt ohne Token nur ok/Fehler) |

Für **Staging** genauso mit `https://staging.performancegrowth.de/…` und den
Werten aus dem Railway-Service `staging-app`.

Schritte je Job in cron-job.org:

1. Job öffnen → **Bearbeiten**.
2. Im Feld **URL** den Teil `?token=…` (bzw. `&token=…`) löschen. Andere
   Parameter (z. B. `?wait=1`) bleiben stehen.
3. Reiter **Erweitert** öffnen → Bereich **Kopfzeilen** (Headers) → **Hinzufügen**:
   - Schlüssel: `Authorization`
   - Wert: `Bearer ` und direkt dahinter das Token (Wert aus Railway → Service →
     Variables; mit Leerzeichen nach „Bearer“).
4. Speichern → **Testlauf** („Test run“/„Jetzt ausführen“). Erwartet: Status 200.
   401 heißt: Token oder Schreibweise prüfen (`Bearer` + Leerzeichen).

Den Token-Wert bitte nur in cron-job.org und Railway eintragen, nicht per Chat
oder Mail weitergeben.

Alternativ geht statt `Authorization` auch der Header `x-cron-token: <Token>`
(ohne „Bearer“).

### Danach: URL-Token abschalten

Wenn alle Jobs grün laufen (ein, zwei Tage beobachten), in Railway bei
`live-app` (und `staging-app`) die Variable setzen:

```
CRON_TOKEN_IN_QUERY=off
```

Ab dann werden Aufrufe mit `?token=` abgelehnt (401). Prüfen: In den Railway-Logs
taucht `[cron-auth] … Token kam als ?token=` nicht mehr auf.

Nicht betroffen (bleiben vorerst wie sie sind, eigene Absender mit fester URL):
Zapier-/Perspective-Webhooks (`/api/leads/eingang`, `/api/leads/pool`,
`/api/vertrieb/…/webhook`) – dort ist ein Header je nach Absender nicht einstellbar.

## 2. Sicherheits-Header und Content-Security-Policy (CSP)

Alle Antworten tragen Sicherheits-Header (`src/lib/security-headers.ts`, eingebunden in
`next.config.ts`): HSTS, `nosniff`, Referrer-Policy, Permissions-Policy (Kamera aus,
Mikrofon nur eigene Seiten), kein `X-Powered-By`. Einbetten in fremde Seiten ist
verboten, außer **Buchungsseite** (`/book/…`) und **Rechner** (`/rechner`), die auf
Vermittler-Websites per iframe eingebunden sein dürfen.

Die CSP läuft zunächst nur als **Report-Only**: Der Browser blockiert nichts, meldet
Verstöße aber an `/api/csp-report`. Die App zählt sie und schreibt sie gedrosselt ins
Log (`[csp] Verstoß: …` beim ersten Auftreten, sonst alle 10 Minuten eine
Zusammenfassung). Gespeichert wird nichts, Pfade mit Tokens werden gekürzt.

**Auf erzwingend umstellen**, wenn ca. 2 Wochen lang keine echten Verstöße mehr im
Log stehen (Browser-Erweiterungen wie Übersetzer/Passwort-Manager erzeugen
gelegentlich Rauschen, das kann man ignorieren):

1. In Railway bei `staging-app` die Variable `CSP_ENFORCE=on` setzen und neu bauen
   lassen (wirkt zur Build-Zeit).
2. Staging durchklicken: Login (auch Google/Microsoft), Kundenbereich, Admin,
   Buchungsseite, Angebot annehmen bis Stripe, Rechner, Diktat, Push.
3. Dann bei `live-app` ebenfalls `CSP_ENFORCE=on`.

Zurück: Variable löschen und neu deployen.

## 3. Drosselung (Rate-Limiting)

`src/lib/rate-limit.ts`, im Arbeitsspeicher je App-Instanz (keine neue Infrastruktur).
Bei mehreren Instanzen zählt jede für sich; später austauschbar gegen Redis.

| Bereich | Grenze |
|---|---|
| Login (je IP, zusätzlich 10 Fehlversuche je E-Mail) | 30 / 15 Min. |
| 2FA-Code (je IP, zusätzlich 5 Versuche je Anmeldung) | 20 / 15 Min. |
| Passwort vergessen / zurücksetzen (je IP und je Adresse) | 5 / 15 Min. |
| KI-Hilfe (je Nutzer und je IP) | 30 / Std. |
| Öffentliche Buchung, Termin verschieben/absagen (je IP) | 20 / 10 Min. |
| Angebot annehmen / Zahlung starten (je IP) | 10 / 10 Min. |
| CSP-Berichte (je IP) | 30 / Min. |
| Webhooks (Stripe, Meta, 360dialog, Zapier, Instantly …), je Endpunkt gesamt | 1200 / Min. |

Antwort bei Überschreitung: HTTP 429 bzw. eine freundliche Meldung im Formular.
Die IP kommt aus `X-Real-IP` (setzt Railway am Edge).

## 4. Sitzungen

Sitzungen sind signierte Cookies (30 Tage). Jede Sitzung trägt die Sitzungsversion
des Logins; die App prüft sie bei jedem Seitenaufruf gegen die Datenbank
(15 Sekunden zwischengespeichert). Alle Sitzungen eines Logins enden bei:

- Passwort zurücksetzen (per Link oder durch Admin),
- Zwei-Faktor ein- oder ausschalten (das aktuelle Gerät bleibt angemeldet),
- „Überall abmelden“ (Kundenbereich → Profilmenü → Anmeldung & Sicherheit;
  Admin → Einstellungen → Sicherheit),
- Zuordnung zu einem anderen Kunden (Admin),
- Löschen des Logins.

Zwei-Faktor-Login gibt es jetzt auch für Kunden-Logins (freiwillig): Kundenbereich →
Profilmenü → „Anmeldung & Sicherheit“. Gleiche Authenticator-Apps und Notfall-Codes
wie bei Admins; funktioniert im Browser und in der App. Im Team sieht der Inhaber
ein „2FA“-Abzeichen bei allen, die es nutzen.

## 5. Abhängigkeiten

- `.github/dependabot.yml`: wöchentlich (montags) Updates für die App, `mobile/` und
  GitHub Actions, gruppiert; Sicherheitsupdates kommen zusätzlich sofort.
- CI-Schritt `npm audit --omit=dev --audit-level=high`: bricht bei hohen/kritischen
  Lücken in Produktionsabhängigkeiten ab. Stand 12.11.2026: 0 Funde nach Update auf
  Next.js 16.4.6 (u. a. kritische Lücke „Middleware-Umgehung“ behoben) und Prisma 7.10.1.
