# Lead-Scraper

Findet **Firmen, die Leads kaufen** (Portal-Partner) je Nische und reichert sie mit
**Website, Telefon, E-Mail und Reichweite** (bundesweit/überregional/regional) an.
Zielgruppe: eigene Lead-Gen-Ansprache — wer schon auf Portalen Anfragen kauft, ist der beste Pitch-Kandidat.

Gebaut für wiederholten Einsatz über mehrere Nischen. **Keine npm-Abhängigkeiten** — nur Node ≥ 18
(nutzt das eingebaute `fetch`). Läuft lokal ohne die Such-Limits einer Claude-Session.

## Quickstart

```bash
cd tools/lead-scraper

# 1) Portal-Verzeichnis scrapen (Firmen + Ort)        -> output/badumbau_raw.csv
node scrape.mjs badumbau

# 2) Anreichern (Website/Telefon/E-Mail/Reichweite)   -> output/badumbau.csv   (resume-fähig)
node enrich.mjs badumbau

# 3) optional: dedupe + sortieren (bundesweit zuerst) -> output/badumbau_final.csv
node finalize.mjs badumbau
```

Fertig ist `output/badumbau_final.csv` mit den Spalten:
`Firma · Nische · Reichweite · Ort · Website · Telefon · E-Mail · Lead-Kauf-Signal · Quelle`
(Semikolon-getrennt, UTF-8 mit BOM → öffnet direkt sauber in Excel.)

## Wie es funktioniert

1. **scrape.mjs** ruft je Stadt `https://www.pflegehilfe.org/<stadt>-<slug>` ab und liest die
   Anbieter aus den `LocalBusiness`-JSON-LD-Blöcken (Name + Ort). Dedupe über den Firmennamen.
   pflegehilfe.org ist ein Lead-Portal → jede gelistete Firma **kauft dort Anfragen**.
2. **enrich.mjs** löst pro Firma die offizielle Website via DuckDuckGo auf (nur echte Treffer,
   Portale/Verzeichnisse gefiltert), lädt Startseite + `/impressum` + `/kontakt` und zieht
   Telefon + E-Mail (inkl. Cloudflare-`cfemail`-Decode). Reichweite aus Website-Signalen
   („bundesweit"/„überregional"). **Rät nie** — nicht Belegtes bleibt leer.
3. **finalize.mjs** dedupliziert erneut und sortiert bundesweit → überregional → regional.

## Optionen

```bash
node scrape.mjs badumbau --max 5        # nur die ersten 5 Städte (Test)
node enrich.mjs badumbau --limit 50     # nur 50 Firmen anreichern
node enrich.mjs badumbau --conc 2       # Nebenläufigkeit (Default 2; höher = schneller, aber DDG drosselt)
```

`enrich.mjs` ist **resume-fähig**: bereits angereicherte Firmen (in `output/<nische>.csv`)
werden bei erneutem Lauf übersprungen. Einfach nochmal starten, wenn es abbricht.

## Nischen / Konfiguration (`config.mjs`)

- **`NISCHEN`** — Registry. `badumbau` ist verifiziert. Weitere pflegehilfe.org-Slugs
  (`hausnotruf`, `treppenlift`, `24-stunden-pflege`, `pflegehilfsmittel`) sind vorkonfiguriert,
  aber `verifiziert: false` → einmal `node scrape.mjs <nische>` laufen lassen; kommen 404s,
  den `slug` anpassen (echten Slug im Seiten-URL von pflegehilfe.org nachsehen).
- **`STAEDTE`** — ~90 Städte inkl. Ostdeutschland. Erweiterbar.
- **`BLOCK_DOMAINS`** — Verzeichnisse/Portale/Social, die NICHT als Firmenseite zählen.
- Nationale Nischen (Teilverkauf, Versicherungen) laufen nicht über Städte-Loop, sondern über
  feste Anbieterlisten — als `nationalList`-Gerüst angelegt, Seeds beim Bearbeiten füllen.

## Hinweise

- Bitte fair bleiben: die Defaults sind bewusst gedrosselt (Delays, globale DDG-Zeitsperre).
- Trefferquote Kontaktdaten ~55–70 % — Rest hat keine auffindbare/lesbare Website
  (reine Portalprofile, JS-only-Seiten, verschlüsselte Mails). Diese Zeilen stehen mit
  Firma + Ort + Quelle drin und lassen sich manuell nachziehen.
- Für höhere Trefferquote optional einen Such-API-Key (SerpAPI/Bing) einbauen — Einstiegspunkt
  ist `resolveWebsite()` in `lib.mjs`.
