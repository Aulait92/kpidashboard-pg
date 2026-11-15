# Vertriebsunterlagen (Stand 15.11.2026, abends)

Aktuelle Präsentationen für Admin → Marketing → Unterlagen (je Zielgruppe PPTX und PDF).

Neu am 15.11.2026 abends (beide Zielgruppen): zwei Folien nach „Jeden Morgen wissen Sie, wen Sie anrufen“:
„Perfekt vorbereitet in jeden Termin. Mit Leitfaden.“ und „Ihre Beratung als Präsentation. Mit echten Preisen.“

| Datei | Zielgruppe | Format | Hinweis |
|---|---|---|---|
| `Vertreter-Praesentation.pptx` | vertreter | pptx | Break-even-Garantie „nach 120 Tagen“ (aktive Tage, Pausen verlängern) |
| `Vertreter-Praesentation.pdf` | vertreter | pdf | Versandfassung mit Demo-Bildern des Assistenten, 120 Tage |
| `Makler-Praesentation.pptx` | makler | pptx | Vertrags-Garantie bleibt 90 Tage; Folien Terminvorbereitung und Beratungspräsentation (15.11. abends) |
| `Makler-Praesentation.pdf` | makler | pdf | Versandfassung mit den neuen Folien (15.11. abends) |

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
