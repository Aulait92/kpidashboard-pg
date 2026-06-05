# Broker Scraper

Scraper für Versicherungsmakler (§34d GewO) in Deutschland mit ≥ 30 Mitarbeitern.

## Run

```bash
npm run scrape:brokers
# mit Optionen:
npm run scrape:brokers -- --cities=Berlin,Hamburg --max=50 --keep-unknown
```

Output: `data/brokers.csv`

## Args

| Flag              | Default                                          | Zweck                                                       |
| ----------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| `--cities=A,B`    | 12 größte DE-Städte                              | Komma-separierte Stadtliste                                 |
| `--max=N`         | `200`                                            | Hard-Cap auf Anzahl angereicherter Firmen                   |
| `--query=...`     | `Versicherungsmakler`                            | Gelbe-Seiten-Suchbegriff                                    |
| `--pages=N`       | `3`                                              | Ergebnisseiten je Stadt                                     |
| `--concurrency=N` | `4`                                              | Parallele Browser-Contexts beim Enrichment                  |
| `--keep-unknown`  | aus                                              | Auch Firmen ohne MA-Schätzung in den Output schreiben       |

## Pipeline

1. **Listings** über Gelbe Seiten je Stadt (JSON-LD aus `LocalBusiness`-Schema).
2. **Dedupe** per Domain bzw. Name+Stadt.
3. **Enrichment** je Webseite: Home + Impressum + Kontakt + Team-Seite.
   - E-Mails: regex inkl. anti-obfuscation (`info (at) ...`).
   - Telefone: DE-Regex.
   - **MA-Schätzung**:
     - Team-Page-Heuristik: Anzahl Personen-Cards via Selektor-Patterns.
     - Text-Regex: "wir sind ein Team von 30 …", "über 50 Mitarbeiter …".
4. **Filter** ≥ 30 MA (oder `--keep-unknown`).
5. **CSV-Export**.

## Limitierungen

- Heuristische MA-Schätzung — manuelle Nachkontrolle empfohlen.
- Selektoren von Gelbe Seiten können sich ändern; das Script setzt primär
  auf das stabilere JSON-LD-Schema, fällt aber leise aus, wenn keine
  strukturierten Daten geliefert werden.
- Politeness: 800ms Delay zwischen Seiten, Browser-UA gesetzt. Trotzdem
  nicht parallel über viele Städte feuern.
- E-Mail-Feld zeigt die erste gefundene Adresse; weitere Treffer werden
  derzeit nicht serialisiert (lässt sich bei Bedarf erweitern).
