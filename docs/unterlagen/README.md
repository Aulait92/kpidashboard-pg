# Vertriebsunterlagen (Stand 15.11.2026)

Aktuelle Präsentationen für Admin → Marketing → Unterlagen (je Zielgruppe PPTX und PDF).

| Datei | Zielgruppe | Format | Hinweis |
|---|---|---|---|
| `Vertreter-Praesentation.pptx` | vertreter | pptx | Break-even-Garantie „nach 120 Tagen“ (aktive Tage, Pausen verlängern) |
| `Vertreter-Praesentation.pdf` | vertreter | pdf | Versandfassung mit Demo-Bildern des Assistenten, 120 Tage |
| `Makler-Praesentation.pptx` | makler | pptx | unverändert vom 11.11.2026; Vertrags-Garantie bleibt 90 Tage |
| `Makler-Praesentation.pdf` | makler | pdf | Versandfassung, unverändert vom 11.11.2026 |

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
