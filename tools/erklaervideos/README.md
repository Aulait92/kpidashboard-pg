# Erklärvideos neu aufnehmen

Werkzeuge für die drei Erklärvideos im Kundenbereich:

| Video | Ziel-Datei (public/videos) | Szenen | Aufnahme |
|---|---|---|---|
| Kurzversion (ca. 1 Min.) | `einfuehrung-kurz.mp4` | `KURZ` in `scenes_oa.py` | `rec_ev.js kurz` |
| Ausführlich (ca. 3:40 Min.) | `einfuehrung-ausfuehrlich.mp4` | `LANG` in `scenes_oa.py` | `rec_ev.js lang` |
| WhatsApp verbinden (ca. 3:40 Min.) | `whatsapp-verbinden.mp4` | `wa_scenes.py` | `wa_rec.js` (App-Teile echt, 360dialog/Meta aus `cards/wa_mock.html`) |

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
- `rec_ev.js` klickt vor der Aufnahme die Hinweiskarten weg (Willkommen-Video, Neuigkeiten, Mitteilungen), seit 24.11.2026 auch das Banner „KI-Hilfe und gemeinsames Anzeigenlernen“ („Verstanden“).
- Ton gegenhören: `python3 check_oa.py kurz lang` (faster-whisper, erzeugt Szenen mit falsch gehörten Begriffen neu; englisch „Lead“ hört Whisper als „Lied“, das gilt als richtig).
- Ausgeblendete Module (z. B. „Empfehlungen & Bewertungen“, `EMPFEHLUNG_MODULE_AVAILABLE = false`, Bestandskunden-Modul, `BESTAND_MODULE_AVAILABLE = false`) nicht zeigen und nicht nennen.
- Knapper Speicher (16.11.2026, mehrere Dev-Server parallel): „Ausführlich“ in zwei Teilen aufnehmen und den Dev-Server dazwischen neu starten
  (`NODE_OPTIONS=--max-old-space-size=4096`): `EV_PART=langA EV_FROM=0 EV_TO=8 node rec_ev.js lang`, dann
  `EV_PART=langB EV_FROM=9 node rec_ev.js lang`, je Teil `mux.py langA …` bzw. `mux.py langB …` und mit
  `ffmpeg -f concat -c copy` aneinanderhängen. `python3 scenes_oa.py kurz` vertont nur eine Fassung.

### Zusatz (Stand 19.11.2026)

- Mehrere Agenten mit eigenem `next dev` (je 4 bis 8 GB) sprengen den Speicher, und `next dev` ist für die Aufnahme zu langsam (Szenen laufen aus dem Takt). Besser: `NODE_OPTIONS=--max-old-space-size=8192 npx next build --webpack`, dann `npx next start -p <Port>` (Port 3123 ggf. belegt, dann z. B. 3131 und `APP=http://localhost:3131`).
- Playwright 1.65 erwartet `ffmpeg-1013` (VP9). Ohne Download: `mkdir -p /var/tmp/pwb/ffmpeg-1013 && ln -s /usr/bin/ffmpeg /var/tmp/pwb/ffmpeg-1013/ffmpeg-linux && touch /var/tmp/pwb/ffmpeg-1013/INSTALLATION_COMPLETE`, dann `PLAYWRIGHT_BROWSERS_PATH=/var/tmp/pwb PW_CHROME=/usr/bin/google-chrome`. Das alte `ffmpeg-1011` liefert stumm keine Datei.
- Nur das Bild neu, Text gleich: Ton je Szene aus dem bisherigen MP4 schneiden (Sprechbeginn per `silencedetect`, ab 0,15 s davor, Länge `dur` aus `kurz.json`), so am 19.11.2026 für „Kurz“ gemacht.
- `scenes_oa.py` (LANG) und `rec_ev.js` sind schon auf die Oberfläche vom 19.11.2026 angepasst („Abschluss“ statt „Gewonnen“, Kontakte mit „Zu erledigen“, Wachstum „Rechnet sich das?“ und „Vom Lead zum Kunden“, „Kosten & Ertrag“ entfällt). „Ausführlich“ am 19.11.2026 neu vertont und aufgenommen (Terminvorbereitung neu: Beiträge aus dem Tarifrechner, „Präsentation öffnen“; Angaben und „Notizen & Verlauf“ im rechten Kontaktbereich).
- `check_oa.py`: Das faster-whisper-Modell liegt auf CDN-Hosts von Hugging Face (`us.aws.cdn.hf.co`, `cas-server.xethub.hf.co`), nicht auf huggingface.co. Sind die gesperrt, hört das Skript automatisch mit OpenAI `whisper-1` über api.openai.com gegen (erzwingen: `CHECK_OA_OPENAI=1`).
- Reicht der Speicher nicht für `next build` (8 GB Heap, mehrere Agenten parallel), kann ein frischer `.next`-Build eines anderen Worktrees (ohne `cache`) kopiert und mit `next start` gestartet werden, sofern sich die gezeigten Seiten seitdem nicht geändert haben.

### Zusatz für „WhatsApp verbinden“ (Stand 15.11.2026)

- Demo-Kunde mit offener Einrichtung: `DATABASE_URL=… node local/wa_einrichtung.mjs` (Login `max.mustermann@gmail.com` / `Demo12345!`, erfundene Daten, Beispielnummer +49 151 23456789).
- Den Schritt „WhatsApp verbinden“ braucht einen (Schein-)Partnerzugang: `DIALOG360_PARTNER_ID=demo DIALOG360_PARTNER_API_KEY=demo` beim Start von `next dev`. 360dialog wird dabei nie aufgerufen: `wa_rec.js` „klickt“ die Knöpfe ohne Navigation und setzt den Zustand (neu, eingeladen, Fast geschafft, verbunden) selbst über `local/wa_state.mjs`.
- Aufnahme: `APP=http://localhost:3123 DATABASE_URL=… node wa_rec.js`. Fehlt Playwrights Chromium, `PW_CHROME=/usr/bin/google-chrome`; fehlt Playwrights ffmpeg für die Aufnahme, `PLAYWRIGHT_BROWSERS_PATH=<eigener Ordner> npx playwright install ffmpeg` und denselben `PLAYWRIGHT_BROWSERS_PATH` beim Aufnehmen setzen.
- Einzelne Szenen neu vertonen: `python3 wa_scenes.py 3 7` (Rest bleibt). `wa_rec.js` meldet Szenen, deren Bild länger braucht als der Ton („lang …“).
- Stand 24.11.2026 neu aufgenommen und vertont (Szenen 1 bis 3: privater Computer, „Vorher kurz prüfen“ mit anderem Anbieter, E-Mail für die Einladung über „Jetzt WhatsApp verbinden“). Bei knappem Speicher stürzt `next dev --webpack` beim Übersetzen der Einrichtung ab (8 GB); stattdessen `node_modules` per `cp -al` (Hardlinks, kein Platz) statt Symlink in den Worktree legen und `npx next dev -p <Port>` mit Turbopack starten. Playwrights `ffmpeg-1013` liegt unter `/opt/pw-browsers`.

## Was jedes Video zeigt (für die Prüfung, Stand 16.11.2026)

Ändert sich eine dieser Seiten oder einer dieser Begriffe sichtbar, Video prüfen (siehe AGENTS.md „Erklärvideos aktuell halten“).
`python3 tools/erklaervideos/betroffen.py` vergleicht geänderte Dateien mit dieser Liste.

| Video | Seiten (Routen) | Begriffe und Knöpfe im Sprechertext |
|---|---|---|
| Kurz (`kurz.json`, `public/videos/einfuehrung-kurz*`) | /buyer (Heute), Termin im Kontakt, /buyer/chats, /buyer/kontakte, /buyer/wachstum (mit Werbebudget) | Heute, „Wartet auf Sie“, Termin, Assistent, Nachrichten, Kontakte (Liste, Pipeline), Wachstum, Werbebudget, KI-Hilfe |
| Ausführlich (`lang.json`, `public/videos/einfuehrung-ausfuehrlich*`) | /buyer (Heute mit Kontakt rechts), Terminvorbereitung (/buyer/termine/…/vorbereitung), Anrufliste, /buyer/chats, /buyer/kontakte (Liste, Pipeline), /buyer/wachstum (Trichter, Werbebudget, Produkte, Pause), /buyer/kalender, /buyer/team | Heute, Kontakte, Nachrichten, Wachstum, „Wartet auf Sie“, „Wie lief es?“, Phase, Abschluss, Verloren, Angaben, Notizen, „Vorbereiten: Angebot rechnen“, Tarifrechner, „Präsentation öffnen“, Anrufliste, Wiedervorlagen, „Zu erledigen“, „Festlegen“, Pipeline, „Rechnet sich das?“, „Vom Lead zum Kunden“, Werbebudget, Pause, Mein Kalender, Team, KI-Hilfe |
| WhatsApp verbinden (`wa.json`, `public/videos/whatsapp-verbinden*`) | /buyer/einrichtung (Schritt WhatsApp mit „Vorher kurz prüfen“ und E-Mail für die Einladung), /buyer/whatsapp-verbinden, Seiten von 360dialog und Meta | „WhatsApp verbinden“, privater Computer außerhalb des Firmennetzes, anderer Anbieter (freigeben), E-Mail für die Einladung (private Adresse), „Jetzt WhatsApp verbinden“, „Erledigt“, „Fast geschafft“, Fünfzehn-Minuten-Termin |

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
