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

Steuert die Meta-Tagesbudgets je (Kunde × Produkt) so, dass zum Monatsende
möglichst 100 % der gewünschten Leads geliefert sind — ohne teure
Überlieferung.

- **Lead-Ziele** kommen produkt-getrennt aus der Airtable-Buyer-Tabelle
  (Spalten „PKV-Wechsel Leadziel pro Monat" / „PKV-Neugeschäft Leadziel pro
  Monat") und werden beim Sync auf den Kunden übernommen.
- Pflege pro Kunde unter **Media Buyer** (Admin-Menü): Autopilot-Schalter,
  Kampagnen-Keyword und max. Tagesbudget je Produkt. Die Ziele werden dort
  nur angezeigt (read-only, Quelle Airtable).
- Kunde ↔ Kampagne über Namens-Keyword (default = Kundenname) **plus**
  Produkt-Klassifizierung des Kampagnennamens (Wechsel/Neugeschäft).
- Hebel: Tagesbudget rauf/runter (nach Cost-per-Lead und Pacing),
  Pausieren bei erreichtem Ziel, Endspurt-Boost in den letzten Tagen.
- Logik in `src/lib/media-buyer.ts` (`decideBudget` ist seiteneffektfrei),
  Meta-Schreibzugriffe in `src/lib/meta-ads.ts`.

Täglich per Cron triggern (Token wie bei `/api/sync`):

```bash
curl -X POST "https://.../api/media-buyer?token=$SYNC_TOKEN"
# Trockenlauf ohne Meta-Schreibzugriff: zusätzlich &dryRun=1
```

Guardrails über Env (alle optional):

| Variable                        | Default | Zweck                                  |
| ------------------------------- | ------- | -------------------------------------- |
| `MEDIA_BUYER_MIN_DAILY_BUDGET`  | `5`     | Untergrenze Tagesbudget (EUR)          |
| `MEDIA_BUYER_MAX_DAILY_BUDGET`  | `200`   | Obergrenze, falls Kunde keine eigene   |
| `MEDIA_BUYER_MAX_STEP`          | `0.5`   | Max. relative Budget-Änderung pro Lauf |
| `MEDIA_BUYER_BOOST_DAYS`        | `5`     | Länge des Endspurt-Fensters (Tage)     |
