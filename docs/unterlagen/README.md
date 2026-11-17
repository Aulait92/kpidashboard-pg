# Vertriebsunterlagen (Stand 15.11.2026, spätabends: Commit c60ca89)

Aktuelle Präsentationen für Admin → Marketing → Unterlagen (je Zielgruppe PPTX und PDF).

Grundlage: Oles neues Design (Logo, Seitenzahlen). Bestehende Folien unverändert, neu: Terminvorbereitung,
Beratungspräsentation (mit Tarif- und Bausteinwechsel), Vorbereitung als Übersicht, „Auch an den Alltag gedacht“ entfernt, Zusatzmodul-Folien entfernt (Stand 9e7915b). Vertreter 22 Folien, Makler 23. Die Folien sind Bilder (Text nicht
durchsuchbar). Paket-Folie: „Jedes weitere Produkt: 350 € monatlich, ohne Setup“ (hängt an der Preisänderung, die Ole noch bestätigt).

Fassung c60ca89 (Branch `claude/loving-mendel-j965x3`, nur diese vier Dateien übernommen):
- Folie 17: aktueller Screenshot aus der Live-Demo und Karte „Live ausprobieren“ mit QR-Code und Link auf
  https://www.dein-beratungstermin.de/demo (klickbar in PPTX und PDF). In der Web-Präsentation bleibt Folie 17 die
  eingebettete Live-Demo (das Folienbild liegt nur dahinter, rechts verdeckt).
- Garantien nach 120 Tagen (Ole, 15.11.2026): Vertreter Folie 21 „Nach 120 Tagen: Break-even-Garantie“,
  Makler Folie 22 „Nach 120 Tagen: Vertrags-Garantie“ (vorher 90). Gilt für neue Angebote, siehe docs/garantien.md.
- Paket-Folie (Vertreter 20, Makler 21) ohne „Bestandskunden-Modul: 149 €“ (Modul vorerst ausgeblendet).
- Folienbilder der Web-Präsentation neu erzeugt (`node scripts/vertrieb-folien.mjs`, geändert: vertreter/17, 20, 21 und makler/17, 21, 22).

In Produktion erst nach Oles OK hochladen.

| Datei | Zielgruppe | Format | Hinweis |
|---|---|---|---|
| `Vertreter-Praesentation.pptx` | vertreter | pptx | neues Design, 22 Folien |
| `Vertreter-Praesentation.pdf` | vertreter | pdf | Versandfassung, neues Design |
| `Makler-Praesentation.pptx` | makler | pptx | neues Design, 23 Folien |
| `Makler-Praesentation.pdf` | makler | pdf | Versandfassung, neues Design |

Hochladen ohne Admin-Login über den geschützten Upload (docs/sicherheit-cron.md):

```bash
for a in vertreter makler; do for f in pptx pdf; do
  n=$( [ $a = vertreter ] && echo Vertreter || echo Makler )-Praesentation.$f
  curl -sS -X POST "https://kpidashboard-pg-production.up.railway.app/api/ops/unterlagen?audience=$a&format=$f" \
    -H "X-Ops-Upload-Token: dummy" -H "X-File-Name: $n" --data-binary @docs/unterlagen/$n
done; done
```

Der Header-Wert `dummy` wird vom Netzwerk-Geheimnis der Claude-Umgebung durch den echten Schlüssel ersetzt
(Railway-Variable `OPS_UPLOAD_TOKEN` am Service „live-app“). Danach mit `GET /api/ops/unterlagen` prüfen.

## Web-Präsentation (Ole, 15.11.2026)

Die Folien gibt es auch als Web-Präsentation (Vollbild, Pfeiltasten, Wischen am Handy, PDF der Zielgruppe), ohne Sprechzettel:

- **Admin → Vertrieb → Kontakt → „Präsentation“**: Fassung nach Angebot (Vertreter/Makler) bzw. Kontakt („Makler“
  laut Anreicherung), umschaltbar. „Rechnet sich das?“ und „Ihr Paket“ sind HTML-Folien mit Namen und Preisen aus dem
  aktuellen Angebot des Kontakts, ohne Angebot mit Listenpreisen. Folie 17 zeigt rechts die Live-Demo
  (`/demo/beratung`, zum Anklicken), Folie 13 das Video des Assistenten.
- **Link für den Interessenten** (`/praesentation/<token>`, nur App-Adresse): im Kontakt oder als Häkchen beim Versand des
  Angebots; 14 Tage gültig, verlängerbar, beendbar. Aufrufe stehen im Kontakt („Präsentation geöffnet am …“), eigene
  Aufrufe als Admin zählen nicht.
- **Admin → Marketing → Unterlagen**: je Zielgruppe „Web-Präsentation“ mit Listenpreisen (Öffnen, Link kopieren) und der
  öffentliche Link zur Live-Demo.
- Neue Fassung der PPTX: `node scripts/vertrieb-folien.mjs` erzeugt `public/praesentation/vertrieb/{vertreter,makler}/NN.webp`
  und `assistent.mp4` neu; Folienliste und Sonderfolien in `src/lib/vertrieb/verkaufspraesentation.ts` prüfen
  (Nummern von Rechnung, Paket und Demo).

## Folie „Ihr Abschlussbonus“ in PPTX und PDF (17.11.2026, wartet auf Oles OK)

Vorletzte Folie (vor „Ihr Start in 3 Schritten“), gleiche Gestaltung wie in der Web-Präsentation, aber mit fester
Frist „bis zur Frist in Ihrem Angebot“ (die PDF geht mit der Angebotsmail raus und wird später gelesen) und ohne
Seitenzahl. Listenpreise: Vertreter 2.490 € → 2.190 €, Makler 990 € → 690 €. Erzeugen und einfügen:

```bash
npx tsx scripts/bonus-folie-unterlagen.ts /tmp/bonus
python3 scripts/bonus-folie-einfuegen.py /tmp/bonus /tmp/unterlagen-neu
```

Ergebnis: Vertreter 23 Folien (PDF 30 Seiten), Makler 24 Folien (PDF 31 Seiten). Das Einfügen ist wiederholbar
(erkennt eine schon vorhandene Bonusfolie). `scripts/vertrieb-folien.mjs` überspringt die Folie, weil die
Web-Präsentation sie selbst mit der Frist aus dem Angebot einfügt. Die Dateien liegen bewusst nicht im Repo
(je ca. 15 MB); nach Oles OK mit dem Upload oben (Ordner `/tmp/unterlagen-neu` statt `docs/unterlagen`) hochladen.
