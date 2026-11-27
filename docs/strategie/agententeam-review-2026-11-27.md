# Agententeam-Review 27.11.2026

Vier Agenten haben unabhängig voneinander geprüft: Produkt, Wachstum und Vertrieb, Firmenwert, Technik und Risiko. Grundlage waren der Live-Code (origin/live 54418027) und die Unterlagen in docs/. Alles wurde nur gelesen, nichts geändert. Echte Kennzahlen zu Kunden und Umsatz fehlen. Die Aussagen beruhen deshalb auf Code, Unterlagen und Pipeline.

## Kernaussage

Gebaut ist schon viel, eher zu viel. Der Firmenwert entsteht jetzt nicht durch weitere Funktionen, sondern durch drei Dinge:
1. Die Strecken arbeiten verlässlich (keine falschen Nachrichten).
2. Der Erfolg beim Vermittler ist messbar und belegt.
3. Der Vertrieb läuft über Organisationen statt über einzelne Vermittler.

## Zahlen zum Produkt

- **Code:** rund 300.000 Zeilen, 183 Datenmodelle, 527 Migrationen, rund 120 API-Routen.
- **Änderungen seit 1.11.:** 2.670 Commits, fast alle von der KI-Session.
- **Tests:** 752 Testdateien, CI mit Typprüfung, Lint, Unit- und Integrationstests. Das ist eine echte Stärke.

## Was als Nächstes gebaut werden sollte

| # | Was | Aufwand | Warum |
|---|---|---|---|
| 1 | **Eine zentrale Stelle für Statuswechsel,** die alle Strecken stoppt, plus Test über alle Strecken | M | Ursache des Sonntags-Bugs. Mindestens drei Stellen setzen den Status ohne Abgleich, sechs Strecken laufen parallel. Ist an die Software-Session gegeben. |
| 2 | **No-Show automatisch erkennen,** für alle Terminarten | S | Heute nur bei Videoterminen oder wenn der Vermittler es einträgt. |
| 3 | **Wiedervorlage nach Vertragsablauf,** 6 bis 8 Wochen vorher | M | Die Rückrufgrenze liegt bei 90 Tagen, das Kündigungsfenster aus Policen landet nur als Notiz. Kfz- und Sachwechsel gehen verloren. |
| 4 | **Funnel und Kosten pro Abschluss je Kunde** | M | Wichtigstes Argument, die 990 € weiterzuzahlen, und die Basis für jede Bewertung. |
| 5 | **CAPI-Status je Kunde anzeigen,** Optimierung auf Termin | S | Gebaut und standardmäßig an. Ob Ereignisse ankommen, ist ungeprüft. |
| 6 | **U1 beheben:** E-Mail an falschen Empfänger | S | Datenschutzrisiko, seit 25.11. bekannt. |
| 7 | **Angebotsdaten per Chat** | M | Beauftragt. |
| 8 | **Empfehlungen schlank wieder einschalten** | M | Der Code (5.100 Zeilen) ist da, aber abgeschaltet. |

**Nicht mehr bauen oder abbauen:**
- weitere Werbekanäle (TikTok, Outbrain, LinkedIn) und Video- oder Bildgeneratoren
- Airtable doppelt beschreiben
- weitere A/B-Systeme

**Trennen:**
- Interne Vertriebs- und Buchhaltungssoftware (Vertrieb, Belege, Bank, BWA, rund 22.000 Zeilen) aus dem Kundenprodukt und dem Kunden-Cron herauslösen.
- Den Sammel-Cron mit rund 60 Jobs aufteilen.

## Technik und Risiko

1. **(S) Live nur nach grüner CI,** mit einem echten main-Branch statt Feature-Branch, Releases täglich gebündelt.
2. **(S) Virenprüfung als Pflicht setzen** (VIRENPRUEFUNG_PFLICHT). Heute wird bei Ausfall von ClamAV ungeprüft angenommen.
3. **(S) Schlüssel doppelt sichern:** ENCRYPTION_KEY und POLICEN_SCHLUESSEL außerhalb von Railway hinterlegen. Ohne sie sind alle Policen verloren.
4. **(M) Backup außerhalb von Railway:** täglicher Datenbank-Dump, R2-Versionierung, Wiederherstellung einmal im Quartal üben.
5. **(M) Mandantentrennung absichern,** mit Test „jede Route mit fremdem Kunden“.
6. **(M) Menschlicher Reviewer in Teilzeit** sowie ein Betriebs- und Architekturhandbuch. Heute liegt der Bus-Faktor bei 1.
7. **(M) Beobachtbarkeit:** Heartbeat für jeden Cron-Job von cron-job.org, Sentry-Alarme, strukturiertes Logging.
8. **(L) Hotspots zerlegen:** WhatsApp-Bot, Termin-Strecke, Abrechnung, Media-Buyer, dazu KI-Kostenlimits je Kunde.

## Vertrieb, die nächsten 6 Wochen

1. **30.11. Signal Iduna:** Teamstart unterschreiben, Zahlung bis 15.12., Start noch im Dezember. Vorher Kalender für Nicht-Allianz und 4 WhatsApp-Kanäle bereit.
2. **Bis 05.12. Haferstroh und Deibel:** Vorkasse für 6 oder 12 Monate anbieten. Das entscheidet zwischen rund 14.000 € und über 30.000 € am 31.12.
3. **Bis 06.12. Grzella:** Termin mit allen Teamleads, Organisationsangebot nach NV-Muster ab 5 Agenturen.
4. **PPL-Kunden:** Januar-Kontingent im Dezember vorauszahlen, mit Bonusleads statt Rabatt.
5. **Instantly mit v2-Text:** Erst hochfahren, wenn die Beschwerdequote nahe 0 liegt.
6. **NV:** Februar-Programm vorbereiten, Absichtserklärung im Dezember einholen.
7. **Erfolgsbeleg:** Bei jedem Onboarding „Abschlüsse pro Monat bisher“ erfassen, erste 30-Tage-Fallstudie bis Ende Dezember.

**Pakete:**
- Organisationslizenz ab 5 Agenturen, dazu ein Teamlead-Zugang mit Team-Dashboard als eigener Preis
- Standardlaufzeit 6 statt 3 Monate, weil die Lernphase der Kampagnen 4 bis 8 Wochen dauert
- Upsell statt Rabatt
- Keine Erfolgsbeteiligung an Provisionen (Vermittlerrecht, nicht prüfbar)

## Maximaler Firmenwert

Grobe Schätzung, nicht belegt:

| Geschäftstyp | Bewertung |
|---|---|
| Agentur | 0,5 bis 1,5 × Umsatz |
| Vertikale SaaS unter 1 Mio. ARR, Ein-Personen-Firma | 1,5 bis 4 × ARR |
| Vertikale SaaS über 1 Mio. ARR, mit Team, NRR über 110 % | 4 bis 8 × ARR |

**Die 5 stärksten Hebel:**
1. **Software vom Agenturgeschäft trennen:** eigene Verträge, eigene Preisliste, eigene Buchhaltung, eventuell eine eigene GmbH unter der Holding. Werbebudget nie als Umsatz zeigen.
2. **Belegter Erfolg:** Ausgangslage beim Onboarding erfassen, Ergebnis nach 90 Tagen.
3. **Vertrieb über Organisationen:** Versicherer-Vertriebe, Pools, Teamleads. Ein Vertrag bringt 10 bis 50 Agenturen.
4. **Risiken vor einer Due Diligence bereinigen:**
   - AVV-Anlagen und Unterauftragnehmer-Liste vervollständigen
   - Muster-DSFA erstellen
   - Benchmark-Klausel einbauen
   - EU-Upload für Kranken-, BU- und Lebenpolicen
5. **Unabhängigkeit von Ole und von Meta:**
   - Betriebshandbücher
   - eigener WhatsApp-Kanal nach dem App Review
   - KI-Anbieter austauschbar
   - zweite Leadquelle

**Kennzahlen, die ab sofort wöchentlich automatisch zu messen sind:**
- MRR getrennt nach Software, PPL und Einrichtung
- Abwanderung und NRR je Startmonat
- Bruttomarge je Umsatzart
- CAC und Amortisation
- Lead-Kette bis zur Kosten pro Abschluss
- Bot-Antwortzeit
- Liquiditätsreichweite
- App-Nutzung
- Beschwerden

**Käufer und Partner, die passen könnten:**
- Pools (Fonds Finanz, Jung DMS, blau direkt): beste Passung
- Strukturvertriebe (eher als Kunde)
- Versicherer über ihre Venture-Einheiten
- CRM- und Maklersoftware-Anbieter

Gespräche mit Pools lohnen sich nach Schätzung ab 300.000 bis 500.000 € ARR mit belegter NRR.

## Korrekturen des Orchestrators zu den Agentenberichten

- **Die Garantie in der Instantly-Kampagne ist bereits entfernt** (PATCH am 26.11.). Der „Re:“-Betreff ist noch zu prüfen.
- **vorlagenVon:** Ole hat entschieden, dass die Anzeigen aller Kunden für Verbesserungen genutzt werden dürfen. Information per Banner, mit einer Klausel in den AGB. Das Restrisiko bleibt, bis die Klausel in den AGB und der AVV steht.

## Fragen an Ole

1. **Preisliste:** Welche gilt? Der Code nennt 1.000, 1.400 und 1.800 €, Setup 2.490, 1.990 oder 990 € und 2 Geschenkmonate bei Jahresvorkasse. Der Cash-Plan nennt 990, 1.390 und 1.790 €, 6 Monate mit 1.490 € Setup und 3 Geschenkmonate bei 12 Monaten.
2. **Agentur oder Software:** Was ist der Kern? Ist die Leadgenerierung künftig Zusatz der Software oder umgekehrt?
3. **Zielkunde:** einzelne Vermittler oder Organisationen?
4. **Organisationen:** Organisationslizenz ab wie vielen Agenturen? Teamlead-Zugang als eigener Preis?
5. **Laufzeit:** künftig 6 statt 3 Monate als Standard?
6. **Kapazität:** Wie viele Onboardings pro Woche schaffst du? Geschätzt sind es 4 bis 6.
7. **Grzella:** Wie viele Teamleads und Vertreter, und wer entscheidet?
8. **Reviewer:** Ist ein menschlicher Entwickler in Teilzeit als Reviewer denkbar?
9. **Zugänge:** Wer hat Admin-Zugang zu GitHub, Railway, Meta und Stripe? Liegen die Schlüssel außerhalb von Railway?
10. **Ziel 30.000 €:** brutto auf dem Konto oder frei verfügbar nach der USt-Nachzahlung?
11. **Finanzierung:** Bootstrapping mit Vorkasse, Business Angel oder Pilotgeld eines strategischen Partners?
