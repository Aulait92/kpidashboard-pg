# Garantien: automatische Prüfung

Stand 11.11.2026. Grundlage: AGB „Garantien“ (`src/lib/legal-texts.ts`) und die
Rechner-Konfiguration (Admin → Einstellungen → Rechner). Code:

| Datei | Inhalt |
|---|---|
| `src/lib/garantien.ts` | reine Bewertung (ohne Datenbank, getestet in `tests/unit/garantien.test.ts`) |
| `src/lib/garantien-server.ts` | Daten laden, täglicher Lauf, Gewähren/Ablehnen |
| `prisma/migrations/20261113120000_garantien` | Tabelle `GarantieFall` |
| `src/app/api/whatsapp/cron/route.ts` | täglicher Schritt (03:00–03:05 UTC) |
| `src/lib/admin-heute.ts`, `src/components/admin/heute-list.tsx` | Admin „Heute“: Gewähren/Ablehnen |
| `src/components/admin/garantien-card.tsx` | Kundenakte: Karte „Garantien“ |
| `src/components/garantie-kunde-card.tsx` | Kundenbereich → Zahlen: „Deine Garantie“ |

## Wer bekommt die Garantie?

Kunden, deren angenommenes Angebot (über `Onboarding.offerId`) **ab 11.11.2026**
erstellt wurde (`GUARANTEES_FROM`) und ein Produkt mit Katze/TKV enthält
(`isGuaranteeProduct`). Beide Regeln stehen in `lib/garantien.ts` und werden auch
vom Angebot (`offer-document.tsx`) benutzt, damit Angebotstext und Prüfung nie
auseinanderlaufen. Archivierte Kunden werden nicht geprüft. Jede Garantie lässt
sich in der Rechner-Konfiguration abschalten (`guarantees.leads.enabled`,
`guarantees.breakEven.enabled`).

## Eckwerte (nicht doppelt hinterlegt)

| Wert | Quelle |
|---|---|
| 100 Leads | Rechner-Konfiguration, Produkt TKV `minLeads30` |
| 20 € pro Tag | Rechner-Konfiguration, `guarantees.leads.minBudgetPerDay` (gilt für beide Garantien) |
| 30 / 90 Tage, 80 %, 6 Monate | `GARANTIE_FRISTEN` in `src/lib/rechner.ts` |

## Kampagnenstart

Die AGB sagen „Tag der ersten Auslieferung der Anzeigen“. Am verlässlichsten ist
deshalb der **erste Tag mit Meta-Kosten > 0** (`CustomerAdSpend`) ab dem Tag der
Annahme des Angebots. Kosten davor (z. B. ein altes Werbekonto) zählen nicht.
Ohne Meta-Daten nehmen wir das **Go-live aus dem Onboarding** (`Onboarding.liveAt`);
Karte und Kennzahlen zeigen dann „Go-live“ als Quelle. Ohne beides: „Noch nicht
gestartet“. `Onboarding.startDate` (geplanter Start) nehmen wir bewusst nicht, weil
er sich oft verschiebt.

Tage zählen nach Berliner Kalendertagen.

## Pausen (Urlaub, Krankheit, Zahlungsverzug)

Pausen schließen die Garantien **nicht** aus, sie **verlängern den Prüfzeitraum**:
gezählt werden 30 bzw. 90 **aktive** Tage (Tage ohne angewendete `CustomerPause`).
Das gilt für jede Art von Pause, auch für Pausen wegen Zahlungsverzug.

- Das Mindestbudget gilt nur für aktive Tage (Ø Meta-Kosten je aktivem Tag).
- Eine laufende Pause ohne Ende verlängert bis heute; künftige Tage gelten als aktiv.
- **Ausnahme Zahlungsverzug:** Ist zum Prüfzeitpunkt eine Rechnung offen
  (`Customer.paymentOverdueSince` gesetzt oder Pause `kind = dunning` aktiv), gibt es
  keinen Anspruch: Status „Bedingungen fehlen: Offene Rechnung“. Der Fall bleibt offen
  und wird täglich neu bewertet; nach Zahlung wird daraus ein Anspruch.
- Der AGB-Text sagt noch „ununterbrochen“ bzw. „ohne Pause“ – Anpassung nach Oles Freigabe.

## Lead-Garantie

- Zeitraum: die ersten **30 aktiven Tage** ab Start.
- Bedingung: Ø **≥ 20 € Meta-Kosten pro aktivem Tag**. Tage ohne Ausgaben senken den Schnitt.
  Gemessen wird der Schnitt, nicht jeder einzelne Tag (Meta verteilt Budget ungleich).
- Gezählt werden Leads mit Katze/TKV in der Quelle, angelegt im Zeitraum, ohne
  anerkannte Reklamation. Alle Meta-Kosten des Kunden zählen für das Budget
  (Garantiekunden laufen nur mit Katze/TKV).
- Geprüft wird am Tag nach dem 30. aktiven Tag. Weniger als 100 Leads und Bedingungen
  erfüllt → **Anspruch: Betreuung + Software im Folgemonat** (Monat nach dem 30. Tag)
  kostenlos. Ab 100 Leads: „Erfüllt“.

## Break-even-Garantie

- **Nur für Vertreter** (`Customer.vermittlerTyp = vertreter`). Makler bekommen bei
  TKV nur Bestandsprovision und lägen nach 90 Tagen immer unter den Kosten: Status
  „Nicht anwendbar (Makler)“, kein Fall, kein Eintrag in „Heute“; die Karten zeigen
  „Für Makler gilt die Lead-Garantie“. Die Lead-Garantie gilt für beide.
- Erste Prüfung am Tag nach dem **90. aktiven Tag**, danach täglich, je Kalendermonat ein Fall.
- **Provision seit Start**: Abschlüsse (Status „Abschluss“, Datum `closedAt`) seit Start,
  ohne anerkannte Reklamation, geschätzt mit `estimatedProvision` und den
  **effektiven Sätzen des Kunden** (`loadCustomerProvision`, eigene Sätze vor Standard).
- **Kosten seit Start** = Meta-Kosten + Betreuung/Software inkl. Zusätze (weitere Logins,
  Bestandskunden-Modul), tagesgenau wie im Umsatzbuch (`retainerRows`, Einführungspreis,
  Kunden-Pausen, Jahreszahlung), **ohne bereits gewährte kostenlose Monate**.
- **Netto.** Die AGB sprechen von „Werbebudget und Vergütung für Betreuung und
  Software“; Vergütungen im Angebot sind Nettopreise, Provision ist umsatzsteuerfrei,
  Meta-Kosten werden netto erfasst. Brutto wäre für Vertreter ohne Vorsteuerabzug
  günstiger – bitte bei der AGB-Prüfung bestätigen.
- Bedingungen:
  - Ø ≥ 20 € Meta-Kosten pro aktivem Tag seit Start
  - **≥ 80 % der Termine wahrgenommen**: vergangene, über die Software gebuchte Termine
    (ohne abgesagte); wahrgenommen = „completed“. „no_show“ und vergangene, nie
    abgeschlossene „booked“ zählen dagegen. Ohne Termine gilt die Bedingung als erfüllt.
  - **≥ 80 % der Leads mit Ergebnis**: Leads seit Start ohne anerkannte Reklamation,
    älter als 3 Tage; Ergebnis = Status gesetzt und nicht „Neuer Lead“. Ohne Leads erfüllt.
  - **Provisionssätze hinterlegt**: Es gibt kein Feld „bestätigt“. Gezählt werden nur
    **eigene Sätze** unter „Meine Provisionen“ (`Customer.provisionRates` nicht leer).
    Standardsätze reichen nicht.
  - keine offene Rechnung (siehe Pausen)
- Ergebnis je Monat: Provision ≥ Kosten → „Erfüllt“ (offene Fälle des laufenden
  Monats werden automatisch geschlossen). Sonst Anspruch bzw. „Bedingungen fehlen“
  für den **laufenden Monat** (Betreuung kostenlos, Software wird weiter berechnet).
- **Längstens 6 Monate** ab dem Monat der ersten Prüfung; danach oder nach 6 gewährten
  Monaten „Abgelaufen“.

## Status

| Status | Bedeutung |
|---|---|
| Noch nicht gestartet | keine Meta-Kosten und kein Go-live |
| Läuft | Zeitraum noch nicht vorbei (Fortschritt: „Tag 12 von 30 · 41 von 100 Leads“) |
| Erfüllt | Ziel erreicht (100 Leads bzw. Break-even) |
| Anspruch | Ziel verfehlt, alle Bedingungen erfüllt |
| Bedingungen fehlen | Ziel verfehlt, mindestens eine Bedingung fehlt (mit Text, z. B. „Ergebnisse nur bei 54 % der Leads eingetragen“) |
| Abgelaufen | Break-even: 6 Monate vorbei |
| Nicht anwendbar (Makler) | Break-even bei Maklern |

## Fälle, Cron und Entscheidung

- Der tägliche Cron (`runGarantien`) legt bei „Anspruch“ und „Bedingungen fehlen“
  einen `GarantieFall` an (eindeutig je Kunde, Art und Monat) und aktualisiert offene
  Fälle mit den aktuellen Kennzahlen. Entschiedene Fälle bleiben unverändert.
  Protokoll: `garantie.fall`.
- **Nichts wird automatisch gutgeschrieben.** Admin „Heute“ zeigt:
  - Anspruch: „Garantiefall: Kunde – Lead-Garantie (82 von 100 Leads) → Betreuung +
    Software im Januar 2027 kostenlos“ mit **Gewähren** und **Ablehnen**.
  - Bedingungen fehlen: Hinweis mit den fehlenden Bedingungen; „Ablehnen“ ist mit
    der Begründung vorbelegt, „Gewähren“ bleibt als Kulanz möglich.
- **Gewähren**: negativer Rechnungsposten in Stripe über den Nettobetrag des Monats
  (Lead: Betreuung + Software inkl. Zusätze; Break-even: nur Betreuung), mit USt. wie
  die Abo-Positionen, idempotent je Fall (`garantie-<id>`). Stripe verrechnet ihn mit
  der nächsten Rechnung; ist er höher, bleibt Guthaben. Ohne Stripe-Kunde lehnt die
  App ab („Gutschrift bitte von Hand“). Protokoll: `garantie.gewaehrt`.
- **Ablehnen** nur mit Begründung. Protokoll: `garantie.abgelehnt`.
- **Umsatzbuch** (Admin → Zahlen): gewährte Monate fallen weg (Lead: Betreuung und
  Software, Break-even: Betreuung), über `RetainerInput.freeMonths`.

## Offene Punkte

- AGB: „ohne Pause“/„ununterbrochen“ an die Pausen-Regel anpassen, Break-even nur für
  Vertreter ergänzen; netto bestätigen.
- Rechner-Text der Lead-Garantie sagt „Betreuung im Folgemonat“, AGB „Betreuung und Software“.
- Jahreszahler: Die Gutschrift landet auf der nächsten Rechnung, also ggf. erst bei der
  Verlängerung. Bei Bedarf manuell erstatten.
- Kunden ohne Stripe-Kunde (Altkunden aus Airtable) können nicht per Knopf gewährt werden.
