# Buchungsdomain dein-beratungstermin.de

Leads und Bestandskunden der Vermittler sehen ihre Seiten unter einer neutralen Adresse statt
`app.performancegrowth.de` (Ole, 15.11.2026). Kanonisch ist **https://www.dein-beratungstermin.de**,
die Adresse ohne www leitet dorthin weiter.

## Was die App macht (sobald `PUBLIC_BOOKING_URL` gesetzt ist)

- **Links für Endkunden** zeigen auf die Buchungsadresse (`src/lib/public-url.ts`): Buchungsseite als Kurzlink
  `www.dein-beratungstermin.de/<slug>` (intern `/book/<slug>`), Termin verwalten `/book/manage/<token>`,
  Kalenderdatei `…/ics`, Lead-Mails, Kalender-Einladungen an Leads, persönlicher Terminlink (`{terminlink}`),
  Empfehlungs- und Google-Links, Einwilligung, Double-Opt-in, Abmelden (auch List-Unsubscribe), Erstinformation,
  Dankeseite im Meta-Leadformular (neue Formulare), Karte „Ihre Buchungsseite“ unter Mein Kalender.
  Links für Vermittler und Admins (Kundenbereich, Login, Chatverlauf im Kalendereintrag) bleiben auf der App.
- **Auf der Buchungsadresse** (`src/lib/public-booking-host.ts`, Middleware) gibt es nur die Endkunden-Seiten
  (`/book`, `/empfehlung`, `/einwilligung`, `/abmelden`, `/api/abmelden`, `/erstinformation`) und was sie brauchen
  (`/_next`, Icons, `/monitoring`, `/api/csp-report`). Alles andere (`/login`, `/admin`, `/buyer`, andere `/api`)
  ist 404, ohne Weiterleitung in die App. `/` zeigt eine neutrale Seite „Terminbuchung“. `robots.txt` sperrt alles,
  jede Antwort trägt `X-Robots-Tag: noindex, nofollow`. Fußzeile: Impressum und Datenschutz des Vermittlers
  (aus seiner Website, Onboarding), dazu unser Hinweis als technischer Dienstleister; ohne Angaben des Vermittlers
  die allgemeinen Links.
- **Alte Links** `app.performancegrowth.de/book/…`, `/empfehlung/…`, `/einwilligung/…`, `/abmelden/…`,
  `/erstinformation/…` leiten per 308 auf die Buchungsadresse (gleicher Pfad und gleiche Query, Buchungsseite als
  Kurzlink). Nur GET/HEAD; Formulare und `/api/abmelden` (POST) laufen auf der App weiter. Ausnahme: ein
  eingeloggter Berater mit `?lead=` (Vorbelegung) bleibt auf der App.
- Ohne `PUBLIC_BOOKING_URL` ändert sich nichts.

## Einrichtung

### 1. Railway (Service der App)

Custom Domains sind angelegt:

| Domain | Ziel |
|---|---|
| `www.dein-beratungstermin.de` | CNAME auf `9no0r4am.up.railway.app` |
| `dein-beratungstermin.de` | (Railway verlangt einen CNAME am Apex, das kann GoDaddy nicht, siehe unten) |

Railway zeigt zusätzlich einen TXT-Eintrag zur Bestätigung (`_railway-verify.www`); den Wert bitte aus Railway
übernehmen (Service → Settings → Networking → Custom Domain).

### 2. GoDaddy (DNS von dein-beratungstermin.de)

1. **CNAME** anlegen: Name `www`, Wert `9no0r4am.up.railway.app`, TTL Standard.
   Einen vorhandenen `www`-Eintrag (z. B. GoDaddy-Parkseite) vorher löschen.
2. **TXT** anlegen: Name `_railway-verify.www`, Wert: siehe Railway.
3. **Apex (ohne www):** GoDaddy kann am Apex keinen CNAME. Deshalb unter Domain → **Weiterleitung**
   (Forwarding) `dein-beratungstermin.de` dauerhaft (301) auf `https://www.dein-beratungstermin.de` weiterleiten,
   wenn möglich **mit Pfad** („Forward with path“ bzw. ohne Maskierung). Ohne Pfad-Weiterleitung landen
   Links ohne www auf der Startseite; deshalb verschickt die App immer Links **mit** www.
   Die Custom Domain `dein-beratungstermin.de` in Railway kann dann entfernt werden oder bleibt ungenutzt.
   (Alternative: DNS zu einem Anbieter mit ALIAS/ANAME bzw. CNAME-Flattening am Apex, z. B. Cloudflare, und den
   Apex dann wie `www` auf Railway zeigen lassen; die App leitet ohne www selbst per 308 auf www um.)
4. Warten, bis Railway das Zertifikat für `www` ausgestellt hat (Status „Active“), dann prüfen:
   `https://www.dein-beratungstermin.de/` zeigt „Terminbuchung“, `/login` ist 404.

### 3. Umgebungsvariable setzen (Railway → App → Variables)

```
PUBLIC_BOOKING_URL=https://www.dein-beratungstermin.de
```

Kein neuer Build nötig für die Links, ein Neustart reicht (Railway startet beim Speichern neu). Danach:

- Unter „Mein Kalender“ zeigt die Karte „Ihre Buchungsseite“ `https://www.dein-beratungstermin.de/<slug>`.
- `https://app.performancegrowth.de/book/<slug>` leitet auf `https://www.dein-beratungstermin.de/<slug>`.
- Neue Termin-Mails an Leads enthalten Links auf die Buchungsadresse.

**Erst setzen, wenn DNS und Zertifikat stehen**, sonst führen neue Links und die Weiterleitung ins Leere.
Zurücknehmen: Variable löschen, dann gilt wieder alles auf der App-Adresse (bereits verschickte neue Links auf
dein-beratungstermin.de funktionieren nur, solange die Domain auf Railway zeigt).

## Hinweise

- **Einbetten (iframe):** Für Vermittler-Websites die lange Form `https://www.dein-beratungstermin.de/book/<slug>`
  nehmen; der Kurzlink ist nicht einbettbar (Sicherheits-Header gelten je Pfad, siehe `src/lib/security-headers.ts`).
- **WhatsApp-Vorlagen:** Die Vorlagentexte enthalten keine Adresse, Links (Empfehlung, Erstinformation) kommen als
  Platzhalter-Werte. Neu einreichen ist deshalb nicht nötig; neue Nachrichten tragen die neue Adresse automatisch.
- **Meta-Leadformulare:** Schon veröffentlichte Formulare behalten `app.performancegrowth.de/book/<slug>` als
  Dankeseite; das leitet weiter. Neue Formulare bekommen die neue Adresse.
- **Login/Cookies:** Die Endkunden-Seiten brauchen keinen Login. Der persönliche Terminlink mit `?lead=` füllt die
  Kontaktdaten nur für den eingeloggten Berater vor; auf der Buchungsadresse gibt es kein Login-Cookie, der Lead
  füllt dort selbst aus (wie bisher).
- **Datenschutz:** In der Datenschutzerklärung bzw. im AVV kann die Domain dein-beratungstermin.de als von uns
  betriebene Adresse genannt werden (mit dem Anwalt abstimmen).
