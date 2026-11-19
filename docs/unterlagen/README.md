# Vertriebsunterlagen (Stand 17.11.2026: Commit eca12945, Folie 19 „Policen vorab“)

Aktuelle Präsentationen für Admin → Marketing → Unterlagen (je Zielgruppe PPTX und PDF).

Grundlage: Oles neues Design (Logo, Seitenzahlen). Bestehende Folien unverändert, neu: Terminvorbereitung,
Beratungspräsentation (mit Tarif- und Bausteinwechsel), Vorbereitung als Übersicht, „Auch an den Alltag gedacht“ entfernt, Zusatzmodul-Folien entfernt (Stand 9e7915b). Vertreter 24 Folien, Makler 25 (Fassung eca12945). Die Folien sind Bilder (Text nicht
durchsuchbar). Paket-Folie: „Jedes weitere Produkt: 350 € monatlich, ohne Setup“ (hängt an der Preisänderung, die Ole noch bestätigt).

Fassung 19.11.2026, Folie 19 „Policen vorab“ (Ole): statt WhatsApp-Telefon jetzt oben das Vergleichsblatt kompakt
(Doppelt, Kündbar, Fehlt) und darunter ein echter Screenshot der Vergleichsfolie der Beratungspräsentation mit Spalte
„Ihr bisheriger Vertrag“ neben Basis, Smart und Komfort (erfundene Daten, mit dem App-Code gerendert); links neuer
Punkt „Alter Vertrag direkt neben den neuen Tarifen“. PPTX (Vertreter image23.jpg, Makler image24.jpg), PDF Seite 26,
Web-Folien vertreter/19 und makler/19 neu.

Fassung 19.11.2026, Folientausch (Ole): „Niemand geht ran? Egal, der Lead bucht selbst.“ ist jetzt Folie 11, „Sonntag,
21:47 Uhr“ Folie 12 (Vertreter und Makler). PPTX: Reihenfolge in `ppt/presentation.xml` getauscht, Seitenzahl auf beiden
Bildern korrigiert (zweite Ziffer aus derselben Folie übernommen); PDF: Seiten 11 und 12 mit den neuen Bildern (Folie 13
mit dem Assistenten steht danach weiter als 8 Einzelbilder); Web-Folien vertreter/11, 12 und makler/11, 12 neu,
Titelliste in `verkaufspraesentation.ts` und Sprechzettel angepasst. Video (13) und Live-Demo (17) bleiben, wo sie sind.

Fassung 19.11.2026 (Branch `claude/vertreter-folien-screenshots`, nur Vertreter): App-Screenshots auf Folie 15 („Heute“ mit
neuen Leads oben, Termin mit Zusammenfassung, „Wie lief es?“; Satz jetzt „Nach dem Gespräch: 2 Klicks“), 16 (neue
Terminvorbereitung) und 20 („Wachstum“ mit „Rechnet sich das?“) neu, sonst unverändert; in PPTX und PDF (Seiten 22, 23, 27)
ersetzt, Web-Folien vertreter/15, 16, 20 neu. Zum Hochladen Bonusfolie wie unten einfügen.
Makler (19.11.2026, Ole: „makler auch nachziehen“): dieselben drei Folien (15, 16, 20, Seitenzahl „n / 25“), PDF Seiten 22, 23, 27,
Web-Folien makler/15, 16, 20 neu.

Fassung eca12945 (17.11.2026, Branch `claude/loving-mendel-j965x3`, nur die vier Präsentationen und
`sprechzettel-vertrieb.md` übernommen; `docs/webseite/policen-abschnitt.md` nicht, siehe docs/webseite-offen.md):
- Neue Folie 19 „Ihr Kunde schickt seine Policen. Sie sehen vorher, wo er doppelt zahlt.“ (Rubrik „Ihre Software“),
  direkt nach dem Komplettcheck (18). Folie 20 „Sie wissen jederzeit …“ mit dem Satz zur laufenden Kampagnen-Optimierung
  nach Umsatz je Werbe-Euro. Alle Folien danach eine Nummer weiter: „Rechnet sich das?“ 21, Makler „Mit Tarifvergleich“ 22,
  Paket Vertreter 22 / Makler 23, „Und wenn es schlecht läuft?“ Vertreter 23 / Makler 24, „Ihr Start in 3 Schritten“
  Vertreter 24 / Makler 25. Folie 13 (Video) und 17 (Live-Demo) bleiben.
- PDF: Vertreter 31 Seiten, Makler 32 (Folie 13 als 8 Einzelbilder). Ohne Bonusfolie; mit Bonusfolie beim Upload
  (Abschnitt „Ihr Abschlussbonus“ unten): Vertreter 25 Folien / PDF 32 Seiten, Makler 26 Folien / PDF 33 Seiten.
- Folienbilder der Web-Präsentation alle neu erzeugt (Seitenzahl „n / 24“ bzw. „n / 25“; neu: vertreter/24.webp,
  makler/25.webp). Folienliste in `src/lib/vertrieb/verkaufspraesentation.ts` um Folie 19 „Policen vorab“ ergänzt;
  Web-Präsentation mit Bonusfolie: Vertreter 25, Makler 26 Folien.
- Sprechzettel `sprechzettel-vertrieb.md` (Vertreter 24 / Makler 25 Folien) neu im Ordner.

Fassung bc0fecc (17.11.2026, Branch `claude/loving-mendel-j965x3`, nur diese vier Dateien übernommen):
- Neue Folie 18 „Viele wollen den Komplettcheck. Ein Termin, mehrere Verträge.“ (Cross-Selling im Termin, Rubrik
  „Ihre Software“), direkt nach „Beraten mit echten Preisen“. Alle Folien danach rücken eine Nummer weiter:
  „Sie wissen jederzeit …“ 19, „Rechnet sich das?“ 20, Makler „Mit Tarifvergleich“ 21, Paket Vertreter 21 / Makler 22,
  „Und wenn es schlecht läuft?“ Vertreter 22 / Makler 23, „Ihr Start in 3 Schritten“ Vertreter 23 / Makler 24.
- PDF: Vertreter 30 Seiten, Makler 31 (Folie 13, der Assistent, steht im PDF als 8 Einzelbilder). Ohne Bonusfolie,
  die kommt beim Upload dazu (Abschnitt „Ihr Abschlussbonus“ unten): dann Vertreter 24 Folien / PDF 31 Seiten,
  Makler 25 Folien / PDF 32 Seiten.
- Folienbilder der Web-Präsentation neu erzeugt (alle, weil die Seitenzahl „n / 23“ bzw. „n / 24“ auf jeder Folie steht;
  neu: vertreter/23.webp, makler/24.webp). Folienliste in `src/lib/vertrieb/verkaufspraesentation.ts` um Folie 18 ergänzt.

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
| `Vertreter-Praesentation.pptx` | vertreter | pptx | neues Design, 24 Folien (ohne Bonusfolie) |
| `Vertreter-Praesentation.pdf` | vertreter | pdf | Versandfassung, 31 Seiten (ohne Bonusfolie) |
| `Makler-Praesentation.pptx` | makler | pptx | neues Design, 25 Folien (ohne Bonusfolie) |
| `Makler-Praesentation.pdf` | makler | pdf | Versandfassung, 32 Seiten (ohne Bonusfolie) |

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
  (`/demo/beratung`, zum Anklicken), Folie 13 das Video des Assistenten, Folie 18 den Komplettcheck und Folie 19
  „Policen vorab“ (Bilder). Mit Bonusfolie: Vertreter 25, Makler 26 Folien.
- **Link für den Interessenten** (`/praesentation/<token>`, nur App-Adresse): im Kontakt oder als Häkchen beim Versand des
  Angebots; 14 Tage gültig, verlängerbar, beendbar. Aufrufe stehen im Kontakt („Präsentation geöffnet am …“), eigene
  Aufrufe als Admin zählen nicht.
- **Admin → Marketing → Unterlagen**: je Zielgruppe „Web-Präsentation“ mit Listenpreisen (Öffnen, Link kopieren) und der
  öffentliche Link zur Live-Demo.
- Neue Fassung der PPTX: `node scripts/vertrieb-folien.mjs` erzeugt `public/praesentation/vertrieb/{vertreter,makler}/NN.webp`
  und `assistent.mp4` neu; Folienliste und Sonderfolien in `src/lib/vertrieb/verkaufspraesentation.ts` prüfen
  (Nummern von Rechnung, Paket und Demo).

## Folie „Ihr Abschlussbonus“ in PPTX und PDF (17.11.2026, nach Oles OK hochgeladen am 17.11.2026, 10:40 Uhr)

Vorletzte Folie (vor „Ihr Start in 3 Schritten“), gleiche Gestaltung wie in der Web-Präsentation, aber mit fester
Frist „bis zur Frist in Ihrem Angebot“ (die PDF geht mit der Angebotsmail raus und wird später gelesen) und ohne
Seitenzahl. Listenpreise: Vertreter 2.490 € → 2.190 €, Makler 990 € → 690 €. Erzeugen und einfügen:

```bash
npx tsx scripts/bonus-folie-unterlagen.ts /tmp/bonus
python3 scripts/bonus-folie-einfuegen.py /tmp/bonus /tmp/unterlagen-neu
```

Ergebnis mit der Fassung eca12945 (Policen vorab, 17.11.2026): Vertreter 25 Folien (PDF 32 Seiten), Makler 26 Folien
(PDF 33 Seiten); Upload in Produktion nach dem Deploy (Ole: „überall ersetzen“).

Ergebnis mit der Fassung bc0fecc (Komplettcheck, 17.11.2026, nach Oles OK in Produktion hochgeladen am 17.11.2026, 15:59 Uhr): Vertreter 24 Folien (PDF 31 Seiten),
Makler 25 Folien (PDF 32 Seiten); vorher (22/23 Folien) 23 und 24. Ohne Playwright-Chromium mit
`E2E_CHROMIUM=/usr/bin/google-chrome`, Python mit python-pptx/pypdf/Pillow (`/usr/bin/python3`). Das Einfügen ist wiederholbar
(erkennt eine schon vorhandene Bonusfolie). `scripts/vertrieb-folien.mjs` überspringt die Folie, weil die
Web-Präsentation sie selbst mit der Frist aus dem Angebot einfügt. Die Dateien liegen bewusst nicht im Repo
(je ca. 15 MB); nach Oles OK mit dem Upload oben (Ordner `/tmp/unterlagen-neu` statt `docs/unterlagen`) hochladen.
