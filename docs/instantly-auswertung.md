# Instantly-Auswertung je Kampagne und Postfach (Stand 17.11.2026)

Nur lesende Auswertung der Cold-Mail-Kampagnen aus dem, was die App lokal speichert. Ausgabe: nur Zahlen und
Kategorien, **keine Mailtexte, keine Adressen von Kontakten**; eigene Postfächer gekürzt (`ver…@beispiel.de`).
Code: `src/lib/vertrieb/instantly-auswertung.ts` (reine Funktionen, Test `tests/unit/instantly-auswertung.test.ts`),
Abfrage `q=instantly-auswertung` in `src/app/api/ops/diagnose/route.ts`.

## Aufruf (nach dem nächsten Live-Deploy)

Die Abfrage gibt es erst, wenn dieser Stand auf `app.performancegrowth.de` deployt ist. Schlüssel: `OPS_READ_TOKEN`
aus Railway (live-app), nie in Chat oder Datei kopieren.

```bash
curl -s -H "Authorization: Bearer $OPS_READ_TOKEN" \
  "https://app.performancegrowth.de/api/ops/diagnose?q=instantly-auswertung" | jq -r .data.markdown
```

- `jq -r .data.markdown`: fertige Markdown-Tabellen (zum Einfügen in eine Mail, ein Dokument oder den Chat).
- `jq .data`: dieselben Zahlen als JSON (`kampagnen.gesamt`, `kampagnen.letzte30`, `postfaecher.gesamt`,
  `postfaecher.letzte30`, `betreffs`, `einwaende.gesamt`, `einwaende.letzte30`, `hinweise`).
- Läuft auch auf staging (`https://staging.performancegrowth.de/...`, dortiger `OPS_READ_TOKEN`), dort aber mit
  Testdaten.
- Vorher sinnvoll: Instantly-Abgleich aktuell (`q=instantly` zeigt „letzteAntwortGespeichert“). Fehlende Antworten
  ggf. mit `q=instantly&nachholen=1` prüfen.

## Was gezählt wird

| Kennzahl | Quelle in der App | Gesamt | Letzte 30 Tage |
|---|---|---|---|
| Angeschrieben | `SalesCampaignLead.sentAt` | Kontakte mit Versand | letzter Versand im Zeitraum (Instantly liefert nur „letzter Kontakt“) |
| Geöffnet | `SalesCampaignLead.openCount`, `lastOpenAt` | Kontakte mit ≥ 1 Öffnung | letzte Öffnung im Zeitraum |
| Antworten | `SalesEmail` (IN, ohne Auto-Antwort, ohne „manuell“); ohne Text: `SalesCampaignLead.replyCount` | Kontakte | Antwortdatum |
| Positiv / Später / Absagen / Neutral | `SalesEmail.sentiment` der letzten Antwort (Instantly-Interessenstatus hat beim Speichern Vorrang, sonst `lib/vertrieb/sentiment.ts`); bei „Neutral“ oder ohne Text `SalesCampaignLead.interest` | Kontakte | Antwortdatum |
| Bounces, Abmeldungen | `SalesCampaignLead.bounced`, `unsubscribed` | Kontakte | Näherung über den letzten Versand (kein eigenes Datum gespeichert) |
| Termine | `SalesMeeting` (nicht abgesagt), gebucht nach der ersten Antwort in der Kampagne; dazu Instantly-Status „Termin gebucht/stattgefunden/Gewonnen“ | Kontakte | Buchungsdatum |
| Betreffzeilen | Betreff der Antworten („Re:“/„AW:“ entfernt, Ziffern als `#`) | ab 3 antwortenden Kontakten je Kampagne und Betreff, Rest zusammengefasst (personalisierte Betreffs erscheinen so nicht) | nur gesamt |
| Einwände | Stichwort-Kategorien über Absagen und Später-Antworten (`EINWAND_KATEGORIEN`), je Kontakt jede Kategorie einmal, Top 10 | Kontakte | Antwortdatum |

Ignorierte Kampagnen (Vertrieb → Import, z. B. Pflege) zählen nicht. Ein Kontakt in mehreren Kampagnen zählt in
jeder. Einwand-Kategorien: Kein Bedarf/ausgelastet, Hat schon Anbieter, Läuft über Allianz/Versicherer, Darf nicht
(Vorgaben), Zu teuer, Schlechte Erfahrung mit Leads, Zeitpunkt/später, Austragen/keine Werbung, Datenschutz/Herkunft
der Adresse, Falsche Person, Ruhestand, Macht Marketing selbst; ohne Treffer „Kein Interesse ohne Begründung“.
`SalesContact.lossReason` wird nicht genutzt, weil die App bei Absagen automatisch „Kein Interesse“ setzt.

## Gesperrt: nie kontaktieren (seit 19.11.2026)

Abschnitt „Gesperrt (nie kontaktieren)“ bzw. `data.gesperrt` (auch in `q=instantly`): Kontakte mit
`SalesContact.nieKontaktierenAt` je Grund (`austragen`, `widerspruch`, `datenschutz`, `bounce_hart`, `manuell`),
in Instantly noch offene Sperren und offene Aufgaben „Auskunft nach Art. 15“. Nur Zahlen, keine Adressen.

- Automatisch gesetzt bei Antworten mit Austragungs- oder Widerspruchswunsch bzw. Datenschutzfrage (eigener Text,
  ohne Zitat und Signatur, `src/lib/vertrieb/nie-kontaktieren.ts`) und bei Abmeldung in Instantly; von Hand in der
  Kontaktakte (Stammdaten → E-Mail → „Nie kontaktieren“).
- Gesetzt heißt: keine Nachricht mehr aus der App (`kontaktGesperrt`), Adresse auf der Instantly-Blocklist
  (`POST /api/v2/block-lists-entries`), in jeder Kampagne Interessenstatus „kein Interesse“
  (`POST /api/v2/leads/update-interest-status`). Nur mit `INSTANTLY_AUTO_SYNC=1`; Fehler wiederholt der
  Instantly-Cron alle 15 Minuten. Datenschutzfragen: Aufgabe „Auskunft nach Art. 15 beantworten, Frist …“ (ein Monat).
- Nachhol-Lauf über alle bisherigen Antworten und Abmeldungen: Einstellungen → Anbindungen & Import → Instantly →
  „Austragungen aus bisherigen Antworten sperren“ (Vorschau, dann sperren; mehrfach ausführbar). Nur zählen:
  `q=instantly&sperren=1`. Übersprungen werden Kontakte mit späterer Zusage, Termin oder Kundenkonto.
- Harte Bounces setzt die App nicht automatisch (sonst wären auch WhatsApp-Terminbestätigungen gesperrt); sie fallen
  beim Abgleich vor einem Upload (`vorUploadPruefen`) heraus, ebenso Sperrliste, Abmeldungen und Instantly-Blocklist.

## Was lokal fehlt (und was die Instantly-API stattdessen bräuchte)

| Wunsch | Lokal? | Weg über die Instantly-API (v2), nicht eingebaut, nicht aufgerufen |
|---|---|---|
| Gesendete **Mails** (nicht Kontakte), Öffnungen je Mail | nein, nur je Kontakt (`openCount`, letzter Versand) | Kampagnen-Analytics (`GET /api/v2/campaigns/analytics`, Zeitraum über Start-/Enddatum; je Tag `…/campaigns/analytics/daily`) |
| Versand, Öffnungen, Bounces **je Postfach** | nein (`SalesCampaignLead` kennt kein Postfach; nur Antworten tragen `eaccount`) | Postfach-Analytics je Tag (`GET /api/v2/accounts/analytics/daily`) |
| Bounces/Abmeldungen mit Datum (30 Tage) | nur Merkmal, kein Datum | Kampagnen-Analytics je Tag (siehe oben) |
| **Sequenzschritte** (welcher Schritt bringt positive Antworten) | nein: Schritt steht nur als Text in der ersten „Gesendet“-Aktivität, bei Antworten gar nicht | Schritt-Analytics (`GET /api/v2/campaigns/analytics/steps`, je Schritt und Variante: gesendet, geöffnet, Antworten, Opportunities). Alternativ künftig selbst speichern: Instantly schickt `step` im Webhook, die E-Mail-Liste liefert ihn je Mail; dafür bräuchte `SalesEmail` eine Spalte `step` |
| Betreff-Varianten (A/B) | nur indirekt über den Antwort-Betreff; Folgeschritte im selben Thread tragen den Betreff von Schritt 1 | Schritt-Analytics je Variante (siehe oben) |

Endpunktnamen vor einem Einbau in der aktuellen Instantly-API-Doku prüfen; der Schlüssel `INSTANTLY_API_KEY` ist in
Railway gesetzt (`q=instantly` zeigt `konfiguration.apiKey`).

## Ausgabeformat (Beispiel mit erfundenen Testdaten)

Erzeugt am 17.11.2026 gegen eine lokale Datenbank mit Beispieldaten (900 Kontakte, 3 Kampagnen, 3 Postfächer),
gekürzt:

```markdown
# Instantly-Auswertung (Stand 17.11.2026)

## Je Kampagne: gesamter Zeitraum
| Kampagne | Angeschrieben | Geöffnet | Antworten | Antwortquote | Positiv | Positivquote | Später | Absagen | Neutral | Bounces | Bouncequote | Abgemeldet | Termine |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Allianz Hauptvertretungen Okt | 420 | 176 | 41 | 9,8 % | 11 | 2,6 % | 7 | 20 | 3 | 14 | 3,3 % | 10 | 2 |
| Allianz Generalvertretungen Nov | 300 | 135 | 29 | 9,7 % | 11 | 3,7 % | 4 | 14 | 0 | 13 | 4,3 % | 6 | 5 |
| Makler PKV Nov | 180 | 85 | 15 | 8,3 % | 6 | 3,3 % | 2 | 6 | 1 | 6 | 3,3 % | 0 | 2 |
| **Summe** | 900 | 396 | 85 | 9,4 % | 28 | 3,1 % | 13 | 40 | 4 | 33 | 3,7 % | 16 | 9 |

## Je Kampagne: letzte 30 Tage (ab 18.10.2026)
(gleiche Spalten)

## Je Postfach: gesamter Zeitraum
| Postfach | Antworten | Positiv | Anteil positiv | Später | Absagen | Neutral | Termine |
|---|---:|---:|---:|---:|---:|---:|---:|
| ver…@beispiel-a.de | 22 | 11 | 50,0 % | 2 | 8 | 1 | 5 |
| ver…@beispiel-b.de | 37 | 10 | 27,0 % | 8 | 16 | 3 | 2 |
| **Summe** | 59 | 21 | 35,6 % | 10 | 24 | 4 | 7 |

## Je Postfach: letzte 30 Tage
(gleiche Spalten)

## Betreffzeilen nach positiven Antworten (gesamter Zeitraum)
| Kampagne | Betreff | Antworten | Positiv | Später | Absagen |
|---|---|---:|---:|---:|---:|
| Allianz Hauptvertretungen Okt | Neue Kunden für Ihre Agentur | 25 | 8 | 5 | 9 |
| Makler PKV Nov | PKV-Anfragen aus Ihrer Region | 15 | 6 | 2 | 6 |

## Sequenzschritte
_nicht lokal gespeichert, siehe Hinweise_

## Häufigste Einwände (Top 10, Kontakte)
**Gesamter Zeitraum**

| Einwand | Anzahl |
|---|---:|
| Zeitpunkt passt nicht, später | 14 |
| Kein Interesse ohne Begründung | 9 |
| Austragen, keine Werbung | 6 |
| Zu teuer, kein Budget | 5 |

**Letzte 30 Tage**
(gleiche Spalten)

## Hinweise
- Zählweise: Kontakte, nicht Mails. …
```

Quoten beziehen sich auf „Angeschrieben“ (je Postfach: Anteil positiv an den Antworten); ohne Nenner steht „k. A.“.
