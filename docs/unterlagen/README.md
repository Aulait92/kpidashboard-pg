# Vertriebsunterlagen (Stand 15.11.2026, abends)

Aktuelle Präsentationen für Admin → Marketing → Unterlagen (je Zielgruppe PPTX und PDF).

Grundlage: Oles neues Design (Logo, Seitenzahlen). Bestehende Folien unverändert, neu: Terminvorbereitung,
Beratungspräsentation (mit Tarif- und Bausteinwechsel), Vorbereitung als Übersicht, „Auch an den Alltag gedacht“ entfernt, Zusatzmodul-Folien entfernt (Stand 9e7915b). Vertreter 22 Folien, Makler 23. Die Folien sind Bilder (Text nicht
durchsuchbar). Vertreter-Garantie in dieser Fassung wie in Oles Datei. Paket-Folie: „Jedes weitere Produkt: 350 € monatlich, ohne Setup“ (hängt an der Preisänderung, die Ole noch bestätigt).
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
