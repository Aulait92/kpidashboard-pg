# KPI-Dashboard (Next.js + PostgreSQL)

Lead-, Umsatz- und Profitabilitäts-KPIs mit Kunden- und Zeitraum-Filter.

## KPIs

- Erreichbarkeitsquote (erreichte Leads / alle Leads)
- Kontaktversuche pro Lead (Ø)
- Zeit bis zum Erstkontakt (Ø)
- Closing Rate (Abschlüsse / alle Leads)
- Umsatz
- Cost per Lead
- Gewinn vor weiteren Kosten (Umsatz − Lead-Kosten)
- Gewinn nach weiteren Kosten (Umsatz − Lead-Kosten − weitere Kosten)
- Marge vor / nach weiteren Kosten

## Filter

- Kundenauswahl (alle / einzelner Kunde)
- Zeitraum-Quickbuttons: Heute, Gestern, Letzte 7 Tage, Letzte 30 Tage,
  Diese/Letzte Woche, Dieser/Letzter Monat, Dieses Jahr
- Eigener Zeitraum (von/bis)

## Stack

- Next.js 16 (App Router, React Server Components)
- TypeScript, Tailwind CSS v4
- Prisma 7 (PostgreSQL via `@prisma/adapter-pg`)
- date-fns

## Setup

```bash
# 1. .env mit eigener DATABASE_URL versehen
#    DATABASE_URL="postgresql://user:pass@host:5432/kpidashboard"

# 2. Schema in die DB pushen
npm run db:push

# 3. Beispieldaten laden (optional)
npm run db:seed

# 4. Dev-Server starten
npm run dev
```

## Datenmodell

| Tabelle    | Zweck                                                       |
| ---------- | ----------------------------------------------------------- |
| `Customer` | Kundenstamm                                                 |
| `Lead`     | Einzelner Lead inkl. Kontaktversuche, Erstkontakt, Closing  |
| `Revenue`  | Umsatzbuchungen (optional einem Lead zugeordnet)            |
| `Cost`     | Kosten, getrennt nach `LEAD` (Akquise) und `OTHER` (Betr.)  |

Die KPI-Berechnung liegt vollständig in `src/lib/kpis.ts`.

## Automatischer Media Buyer

Steuert die Meta-Budgets je **Liefer-Pool** so, dass zum Monatsende möglichst
100 % der gewünschten Leads geliefert sind — ohne teure Überlieferung. Ein
Pool = eine Kampagne, in die die Nachfrage mehrerer Kunden fließt:

- **PKV**: ein Pool je Produkt (Wechsel/Neugeschäft) über *alle* Kunden.
  Pool-Ziel = Summe der Kunden-Ziele, eine Kampagne pro Produkt.
- **Kinderwunsch**: ein Pool je **Region**. Die Region kommt vom Kunden;
  alle Kunden einer Region teilen sich die Regions-Kampagne. Pool-Ziel =
  Summe der KiWu-Ziele der Kunden dieser Region.

Daten & Steuerung:

- **Lead-Ziele und Region** kommen aus der Airtable-Buyer-Tabelle und werden
  beim Sync auf den Kunden übernommen. Erwartete Spalten (mehrere
  Schreibweisen werden akzeptiert): „PKV-Wechsel Leadziel pro Monat",
  „PKV-Neugeschäft Leadziel pro Monat", „Kinderwunsch Leadziel pro Monat",
  „Region".
- **Pflege je Pool** unter **Media Buyer** (Admin-Menü): Autopilot-Schalter,
  max. Tagesbudget, optionales Kampagnen-Keyword. Ziele sind read-only.
- Pool ↔ Kampagne: PKV über Produkt-Klassifizierung des Kampagnennamens,
  Kinderwunsch über „Kinderwunsch"/„KiWu" + Regionsname im Kampagnennamen.
  Per Pool-Keyword überschreibbar.
- Cost-per-Lead = Meta-Spend (Monat) der Pool-Kampagnen ÷ gelieferte Leads.
- Hebel: Tagesbudget rauf/runter, Pausieren bei erreichtem Ziel,
  Endspurt-Boost in den letzten Tagen.
- Logik in `src/lib/media-buyer.ts` (`decideBudget` ist seiteneffektfrei),
  Meta-Zugriffe in `src/lib/meta-ads.ts`.

Kinderwunsch-Leads werden nur synchronisiert, wenn
`AIRTABLE_TABLE_KINDERWUNSCH` (Tabellenname) gesetzt ist.

Täglich per Cron triggern (Token wie bei `/api/sync`):

```bash
curl -X POST -H "Authorization: Bearer $SYNC_TOKEN" "https://.../api/media-buyer"
# Trockenlauf ohne Meta-Schreibzugriff: zusätzlich &dryRun=1
```

Guardrails über Env (alle optional):

| Variable                        | Default | Zweck                                  |
| ------------------------------- | ------- | -------------------------------------- |
| `MEDIA_BUYER_MIN_DAILY_BUDGET`  | `5`     | Untergrenze Tagesbudget (EUR)          |
| `MEDIA_BUYER_MAX_DAILY_BUDGET`  | `200`   | Obergrenze, falls Kunde keine eigene   |
| `MEDIA_BUYER_MAX_STEP`          | `0.5`   | Max. relative Budget-Änderung pro Lauf |
| `MEDIA_BUYER_BOOST_DAYS`        | `5`     | Länge des Endspurt-Fensters (Tage)     |
| `MEDIA_BUYER_PRECISION_DAYS`    | `3`     | Präzisions-Fenster am Monatsende: Step-Limit & Totzone aus, feines Tarieren, vorausschauendes Pausieren |
| `MEDIA_BUYER_PRECISION_MIN_BUDGET` | `1`  | Budget-Untergrenze im Präzisions-Fenster (EUR) |
| `MEDIA_BUYER_NORMAL_INTERVAL_HOURS` | `12` | Drosselung im Normalbetrieb: außerhalb des Präzisions-Fensters wird höchstens alle X h wirklich nachgesteuert (auch bei häufigerem Cron-Aufruf). |
| `MEDIA_BUYER_RUN_INTERVAL_HOURS` | _auto_ | Override für die Stunden bis zum nächsten Lauf (fürs vorausschauende Pausieren). Ohne Wert wird der Abstand **automatisch** aus den letzten echten Läufen abgeleitet. |
| `MEDIA_BUYER_GOAL_SOURCE` | `software` | Lead-Ziele aus den Bezügen der App (`software`) oder aus Airtable (`airtable`, CustomerProduct.leadGoal). Admin zeigt immer beide mit Abweichung. |
| `MEDIA_BUYER_GOAL_RENEWALS` | an | `0` = Verlängerungen von Wochenbestellungen nicht als „erwartet“ ins Ziel rechnen. |
| `MEDIA_BUYER_RC_VAT` | `0.19` | Reverse-Charge-USt auf Meta-Rechnungen; für steuerfreie Leads nicht abziehbar, senkt den Höchstpreis: P × (1 − s) / (1 + USt × q). |
| `MEDIA_BUYER_REGION_DAYS` | `30` | Zeitraum (mind. 14 Tage) für den Anteil der Leads in offenen Regionen (Regionen-Rechnung). |
| `MEDIA_BUYER_REGION_MIN_LEADS` | `30` | Mindestzahl eingegangener Leads für die Regionen-Rechnung. |

**Lead-Ziele aus der Software** (`src/lib/media-buyer-ziele.ts`, Ole 20.11.2026): Soll je Bezug bis Monatsende =
geliefert im Monat + fest offen + erwartet. Fest offen: bezahlte Wochenbestellungen (paid/processing) mit Rest
(Menge − schon auf die Bestellung geliefert; Woche über das Monatsende anteilig nach Tagen), Monatsziele der
Großabnehmer (Ziel, sonst Summe der Gebietsmengen; Start mitten im Monat anteilig) minus Geliefertes, Einmal-Mengen
minus alles Gelieferte. Erwartet: jüngste bezahlte Wochenbestellung mit „jede Woche wiederholen“ für die Restwochen.
Offene/fehlgeschlagene/stornierte Bestellungen, pausierte/gekündigte Bezüge und ruhende Konten haben nichts offen (ihr
Geliefertes bleibt im Soll, weil es auch im Ist steckt). Pool-Ziel = Summe; Lead-Preis und Anteil steuerfreier Leads
gewichtet mit dem Soll. Beim Wechsel der Quelle mitten im Monat gilt im ersten Lauf ±20 % und kein Pausieren. Ist die
Pool-Summe erreicht und ein Kunde unter 95 % seines Ziels: Push (höchstens 1x/Tag).

**Regionen-Rechnung** (`src/lib/media-buyer-regionen.ts`): Sind im Produkt-Pool nur noch Bezüge mit PLZ-Grenze offen
(z. B. Heinrich von Kleist), gilt Kosten je verwertbarem Lead = CPL je eingegangenem Lead (7 Tage) / Anteil der Leads mit
PLZ in den offenen Regionen (30 Tage). Break-even = Lead-Preis der offenen Bezüge × (1 − Storno) / (1 + USt × q).
Darunter weiterlaufen, darüber keine Erhöhung, über 120 % des Break-even einen Schritt (20 %) senken; Empfehlung im
Admin und Push (1x/Tag). Pausieren oder regionale Kampagne anlegen entscheidet Ole.

**Empfohlenes Setup:** den Cron **fest stündlich** laufen lassen und nie wieder
anfassen. Im Normalbetrieb drosselt der Buyer selbst auf
`MEDIA_BUYER_NORMAL_INTERVAL_HOURS` (≈ 2×/Tag), im Präzisions-Fenster der
letzten `MEDIA_BUYER_PRECISION_DAYS` Tage nutzt er jeden stündlichen Aufruf für
die exakte Landung — ohne manuelle Umstellung.

In den letzten `MEDIA_BUYER_PRECISION_DAYS` Tagen schaltet der Buyer in den
Präzisionsmodus: Step-Limit und ±5 %-Totzone entfallen, das Budget wird exakt
auf `Restleads × CPL` heruntergefahren, und er pausiert **vorausschauend**,
sobald das Ziel vor dem nächsten Lauf erreicht würde (`Leads + erwartete Leads
bis zum nächsten Lauf ≥ Ziel`). Das Lauf-Intervall dafür ermittelt der Buyer
selbst aus den Zeitstempeln der letzten Läufe — stellst du den Cron im Endspurt
auf stündlich, zieht das Pausieren automatisch nach (kein Env-Eingriff nötig).
Für eine möglichst exakte 100 %-Landung den Cron im Endspurt häufiger laufen
lassen (z. B. stündlich).
