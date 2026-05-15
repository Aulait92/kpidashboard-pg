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
