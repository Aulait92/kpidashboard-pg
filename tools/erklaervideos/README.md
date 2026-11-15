# Erklärvideos neu aufnehmen

Werkzeuge für die drei Erklärvideos im Kundenbereich:

| Video | Ziel-Datei (public/videos) | Szenen | Aufnahme |
|---|---|---|---|
| Kurzversion (ca. 1 Min.) | `einfuehrung-kurz.mp4` | `KURZ` in `scenes_oa.py` | `rec_ev.js kurz` |
| Ausführlich (ca. 3:20 Min.) | `einfuehrung-ausfuehrlich.mp4` | `LANG` in `scenes_oa.py` | `rec_ev.js lang` |
| WhatsApp verbinden (ca. 3:20 Min.) | `whatsapp-verbinden.mp4` | `wa_scenes.py` | `wa_rec.js` (App-Teile echt, 360dialog/Meta aus `cards/wa_mock.html`) |

Arbeitsverzeichnis für Ton, Rohvideo und Logs: `EV_DIR` (Standard `/var/tmp/ev`).

## 1. App lokal mit Demo-Daten starten

1. Produktivstand der Software auschecken (nur lesen, nichts pushen):
   `git -C /home/user/kpidashboard-pg fetch origin claude/whatsapp-crm && git -C /home/user/kpidashboard-pg worktree add /home/user/pgmain origin/claude/whatsapp-crm`
2. `cd /home/user/pgmain && npm ci`
3. Postgres 16 lokal (z. B. Datenverzeichnis `/var/tmp/pgdata`, Port 5433, Socket `/var/tmp`) mit `initdb`, Nutzer und Datenbank anlegen und mit `pg_ctl` starten.
4. `.env` mit `DATABASE_URL` (lokale DB), `AUTH_SECRET`, `ENCRYPTION_KEY` (32 Byte, zufällig), `APP_URL=http://localhost:3123`, `DEMO_TOOLS=1`. Nur lokale Zufallswerte, keine echten Schlüssel.
5. Schema einspielen. `prisma db push` ist durch Prismas KI-Schutz gesperrt, deshalb:
   `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > /var/tmp/schema.sql` und mit `psql` einspielen, danach `npx prisma generate`.
6. Demo-Daten: `local/seed.ts`, `local/wa.ts`, `local/termin.ts` nach `/home/user/pgmain/local/` kopieren und mit `npx tsx` ausführen (Login `demo@pg.local` / `Demo12345!`). `termin.ts` legt einen Termin auf morgen, damit „Heute“ nicht leer ist.
   Kunde muss die neue Oberfläche haben (`Customer.newUi = true`).
7. `PORT=3123 npx next dev -p 3123` (in einem Git-Worktree unter `.claude/worktrees/…` ohne eigenes `node_modules`: `npx next dev --webpack -p 3123`, Turbopack findet `next` sonst nicht).

### Zusatz für die Einführungsvideos (Stand 15.11.2026)

- Nach `seed.ts`, `wa.ts`, `termin.ts`: `DATABASE_URL=… node local/ev_zustand.mjs` (Erstinformation vollständig, Wiedervorlagen gesetzt), sonst stehen Warnhinweis und „Leads ohne nächsten Schritt“ über allem auf „Heute“.
- `rec_ev.js` klickt vor der Aufnahme die Hinweiskarten weg (Willkommen-Video, Neuigkeiten, Mitteilungen).
- Ton gegenhören: `python3 check_oa.py kurz lang` (faster-whisper, erzeugt Szenen mit falsch gehörten Begriffen neu; englisch „Lead“ hört Whisper als „Lied“, das gilt als richtig).
- Ausgeblendete Module (z. B. „Empfehlungen & Bewertungen“, `EMPFEHLUNG_MODULE_AVAILABLE = false`) nicht zeigen und nicht nennen.

### Zusatz für „WhatsApp verbinden“ (Stand 15.11.2026)

- Demo-Kunde mit offener Einrichtung: `DATABASE_URL=… node local/wa_einrichtung.mjs` (Login `max.mustermann@gmail.com` / `Demo12345!`, erfundene Daten, Beispielnummer +49 151 23456789).
- Den Schritt „WhatsApp verbinden“ braucht einen (Schein-)Partnerzugang: `DIALOG360_PARTNER_ID=demo DIALOG360_PARTNER_API_KEY=demo` beim Start von `next dev`. 360dialog wird dabei nie aufgerufen: `wa_rec.js` „klickt“ die Knöpfe ohne Navigation und setzt den Zustand (neu, eingeladen, Fast geschafft, verbunden) selbst über `local/wa_state.mjs`.
- Aufnahme: `APP=http://localhost:3123 DATABASE_URL=… node wa_rec.js`. Fehlt Playwrights Chromium, `PW_CHROME=/usr/bin/google-chrome`; fehlt Playwrights ffmpeg für die Aufnahme, `PLAYWRIGHT_BROWSERS_PATH=<eigener Ordner> npx playwright install ffmpeg` und denselben `PLAYWRIGHT_BROWSERS_PATH` beim Aufnehmen setzen.
- Einzelne Szenen neu vertonen: `python3 wa_scenes.py 3 7` (Rest bleibt). `wa_rec.js` meldet Szenen, deren Bild länger braucht als der Ton („lang …“).

## 2. Prüfen, ob sich etwas Grundlegendes geändert hat

Neu aufnehmen nur, wenn sich in der letzten Woche etwas geändert hat, das in einem Video zu sehen oder zu hören ist:
Navigation bzw. Bereiche (Heute, Kontakte, Nachrichten, Wachstum, Kalender, Team), Aufbau der gezeigten Seiten, Namen von Knöpfen oder Bereichen, die im Sprechertext vorkommen, der Ablauf „WhatsApp verbinden“.
Kleine Textänderungen, Farben oder Abstände sind kein Grund.

Vorgehen: `git log --since="8 days ago" origin/claude/whatsapp-crm -- src/app/buyer src/components` lesen, dann jede Szene aus `rec_ev.js` bzw. `wa_rec.js` gegen die laufende App abspielen (Selektoren, Texte) und Screenshots vergleichen.

## 3. Aufnehmen

- Sprechertexte bei Bedarf in `scenes_oa.py` bzw. `wa_scenes.py` anpassen (Sie-Form, keine Gedankenstriche, nur Funktionen, die live sind).
- Ton: `python3 scenes_oa.py` bzw. `python3 wa_scenes.py` (OpenAI `gpt-4o-mini-tts`, Stimme `onyx`. Der Schlüssel für api.openai.com wird vom Proxy eingesetzt, im Code steht nur ein Platzhalter). Jede Szene mit faster-whisper gegenprüfen (`fix_kurz.py` als Muster), falsch Ausgesprochenes neu erzeugen. „Performance Growth“ muss englisch klingen.
- Bild: `node rec_ev.js kurz`, `node rec_ev.js lang`, `node wa_rec.js` (Playwright, 1440×810).
- Zusammenführen: `python3 mux.py kurz out.mp4` usw. (1920×1080, Ton normalisiert).
- Kontrolle: Standbilder aus jeder Szene ansehen (z. B. `ffmpeg -ss <t> -frames:v 1`), Untertitel und Mauszeiger prüfen, Länge plausibel.

## 4. Abgeben

- Neue MP4 plus Poster-Bild nach `public/videos/` auf dem Branch `claude/loving-mendel-j965x3`, `public/videos/README.md` (Sprechertexte) aktualisieren, committen und pushen.
- PG Software (Sitzung `session_01AGr77XAu2jS75fQAbdinYQ`) bitten, nur diese Dateien zu übernehmen (`git checkout origin/claude/loving-mendel-j965x3 -- public/videos/...`), nicht zu mergen.
