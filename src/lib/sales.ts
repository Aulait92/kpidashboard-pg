// Sales-Pipeline (Performance-Growth eigener B2B-Verkaufsprozess).
//
// Liest Deals aus einer eigenen Airtable-Base (Env: AIRTABLE_SALES_BASE_ID
// und AIRTABLE_TOKEN — same PAT wie Leads-Sync, braucht Read-Scope auf
// die "Deal-Pipeline"-Tabelle), spiegelt sie in der DB (siehe Deal-Model
// in prisma/schema.prisma) und ist die Datenquelle für /admin/crm und
// /admin/kpis.
//
// Sync-Verhalten ist defensiv: ist die ENV nicht gesetzt, no-op. Das
// erlaubt das schrittweise Hochfahren ohne den restlichen Sync zu brechen.

import { prisma } from "@/lib/prisma";

const SALES_TABLE =
  process.env.AIRTABLE_TABLE_DEAL_PIPELINE ?? "Deal-Pipeline";

// Pipeline-Phasen. Spalten im Kanban + Phase-Default-Status beim
// Verschieben — analog zu PIPELINE_PHASES auf der Buyer-Seite.
// Status-Strings müssen MIT den Single-Select-Werten in Airtable
// übereinstimmen — vor dem ersten Live-Test prüfen + ggf. anpassen.
export type SalesPhase = {
  key: string;
  label: string;
  statuses: readonly string[];
  defaultStatus: string;
  // Win-Wahrscheinlichkeit für die gewichtete Pipeline (0..1).
  winProbability: number;
  // UI-Akzent.
  accent: string;
  // Spezial-Flag für Sieg/Niederlage — beeinflusst KPI-Buckets (Win-Rate,
  // Loss-Reasons). Ohne den Flag ist die Phase "in-progress".
  terminal?: "won" | "lost";
};

export const SALES_PIPELINE_PHASES: readonly SalesPhase[] = [
  {
    key: "neu",
    label: "Neu",
    statuses: ["Neu", "New"],
    defaultStatus: "Neu",
    winProbability: 0.1,
    accent: "border-t-zinc-400",
  },
  {
    key: "qualifiziert",
    label: "Qualifiziert",
    statuses: ["Qualifiziert", "Qualified"],
    defaultStatus: "Qualifiziert",
    winProbability: 0.25,
    accent: "border-t-amber-400",
  },
  {
    key: "termin",
    label: "Termin",
    statuses: ["Termin vereinbart", "Demo", "Meeting"],
    defaultStatus: "Termin vereinbart",
    winProbability: 0.4,
    accent: "border-t-amber-500",
  },
  {
    key: "angebot",
    label: "Angebot",
    statuses: ["Angebot", "Proposal"],
    defaultStatus: "Angebot",
    winProbability: 0.6,
    accent: "border-t-blue-500",
  },
  {
    key: "verhandlung",
    label: "Verhandlung",
    statuses: ["Verhandlung", "Negotiation"],
    defaultStatus: "Verhandlung",
    winProbability: 0.8,
    accent: "border-t-blue-600",
  },
  {
    key: "gewonnen",
    label: "Gewonnen",
    statuses: ["Gewonnen", "Won", "Closed Won"],
    defaultStatus: "Gewonnen",
    winProbability: 1,
    accent: "border-t-emerald-500",
    terminal: "won",
  },
  {
    key: "verloren",
    label: "Verloren",
    statuses: ["Verloren", "Lost", "Closed Lost"],
    defaultStatus: "Verloren",
    winProbability: 0,
    accent: "border-t-rose-400",
    terminal: "lost",
  },
] as const;

export function findSalesPhaseForStatus(
  status: string | null | undefined,
): SalesPhase | null {
  if (!status) return null;
  return (
    SALES_PIPELINE_PHASES.find((p) =>
      (p.statuses as readonly string[]).includes(status),
    ) ?? null
  );
}

export function winProbabilityFor(status: string | null | undefined): number {
  return findSalesPhaseForStatus(status)?.winProbability ?? 0.1;
}

// ─── Sync ──────────────────────────────────────────────────────────────

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
};

type AirtableListResponse = {
  records: AirtableRecord[];
  offset?: string;
};

function getSalesEnv(): { token: string; baseId: string } | null {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_SALES_BASE_ID;
  if (!token || !baseId) return null;
  return { token, baseId };
}

async function fetchAllSalesRecords(): Promise<AirtableRecord[]> {
  const env = getSalesEnv();
  if (!env) return [];
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  const url = new URL(
    `https://api.airtable.com/v0/${env.baseId}/${encodeURIComponent(SALES_TABLE)}`,
  );
  url.searchParams.set("pageSize", "100");
  do {
    if (offset) url.searchParams.set("offset", offset);
    else url.searchParams.delete("offset");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable Sales ${res.status} (${SALES_TABLE}): ${body}`);
    }
    const json = (await res.json()) as AirtableListResponse;
    records.push(...json.records);
    offset = json.offset;
  } while (offset);
  return records;
}

// ─── Field-Resolver ───────────────────────────────────────────────────
// Tolerant gegenüber unterschiedlicher Field-Benennung in Airtable —
// erstbester Treffer wins. Wenn der Sync nichts findet, bleibt das
// Feld leer und kann nachgepflegt werden.

const NAME_FIELDS = ["Name", "Deal", "Kontakt", "Lead", "Kunde"];
const COMPANY_FIELDS = ["Unternehmen", "Firma", "Company", "Account"];
const EMAIL_FIELDS = ["E-Mail", "Email", "Mail"];
const PHONE_FIELDS = ["Telefon", "Telefonnummer", "Phone", "Tel"];
const VALUE_FIELDS = ["Wert", "Deal-Wert", "Value", "Volumen", "MRR", "ARR"];
const STATUS_FIELDS = ["Status", "Phase", "Stage", "Bearbeitungsstatus"];
const OWNER_FIELDS = ["Owner", "Sales", "Inhaber", "Verantwortlich", "Zuständig"];
const SOURCE_FIELDS = ["Source", "Quelle", "Kanal"];
const CLOSE_DATE_FIELDS = [
  "Close Date",
  "Abschlussdatum",
  "Erwarteter Abschluss",
  "Wunschdatum",
];
const NOTES_FIELDS = ["Notizen", "Notes", "Beschreibung", "Description"];
const LOST_REASON_FIELDS = ["Lost Reason", "Verlustgrund", "Absagegrund"];

function readString(
  fields: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const k of keys) {
    const v = fields[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (Array.isArray(v) && v.length > 0) {
      const first = v[0];
      if (typeof first === "string" && first.trim() && !first.startsWith("rec")) {
        return first.trim();
      }
    }
  }
  return null;
}

function readNumber(
  fields: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const k of keys) {
    const v = fields[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number.parseFloat(v.replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function readDate(
  fields: Record<string, unknown>,
  keys: readonly string[],
): Date | null {
  for (const k of keys) {
    const v = fields[k];
    if (typeof v !== "string" || v === "") continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

// ─── Public Sync ──────────────────────────────────────────────────────

export type SalesSyncResult = {
  records: number;
  upserts: number;
  deletes: number;
  skipped: boolean; // true wenn ENV nicht konfiguriert ist
  errors: string[];
};

export async function syncSales(): Promise<SalesSyncResult> {
  const result: SalesSyncResult = {
    records: 0,
    upserts: 0,
    deletes: 0,
    skipped: false,
    errors: [],
  };
  if (!getSalesEnv()) {
    result.skipped = true;
    return result;
  }

  let records: AirtableRecord[];
  try {
    records = await fetchAllSalesRecords();
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }
  result.records = records.length;

  for (const rec of records) {
    try {
      const name = readString(rec.fields, NAME_FIELDS);
      const company = readString(rec.fields, COMPANY_FIELDS);
      const email = readString(rec.fields, EMAIL_FIELDS);
      const phone = readString(rec.fields, PHONE_FIELDS);
      const value = readNumber(rec.fields, VALUE_FIELDS);
      const status = readString(rec.fields, STATUS_FIELDS);
      const owner = readString(rec.fields, OWNER_FIELDS);
      const source = readString(rec.fields, SOURCE_FIELDS);
      const closeDate = readDate(rec.fields, CLOSE_DATE_FIELDS);
      const notes = readString(rec.fields, NOTES_FIELDS);
      const lostReason = readString(rec.fields, LOST_REASON_FIELDS);

      const phase = findSalesPhaseForStatus(status);
      const isWon = phase?.terminal === "won";
      const isLost = phase?.terminal === "lost";

      // Bestehenden Deal lesen, um Status-Wechsel-Aktivität auto-loggen
      // zu können + wonAt/lostAt nicht zu überschreiben falls schon gesetzt.
      const existing = await prisma.deal.findUnique({
        where: { airtableId: rec.id },
        select: { id: true, status: true, wonAt: true, lostAt: true },
      });

      const deal = await prisma.deal.upsert({
        where: { airtableId: rec.id },
        create: {
          airtableId: rec.id,
          name,
          company,
          email,
          phone,
          value,
          status,
          owner,
          source,
          closeDate,
          notes,
          lostReason,
          wonAt: isWon ? new Date() : null,
          lostAt: isLost ? new Date() : null,
          rawFields: rec.fields as object,
          createdAt: new Date(rec.createdTime),
        },
        update: {
          name,
          company,
          email,
          phone,
          value,
          status,
          owner,
          source,
          closeDate,
          notes,
          lostReason,
          // wonAt/lostAt nur setzen wenn neu in den jeweiligen Terminal-
          // Status; nicht zurücksetzen wenn der Deal von "gewonnen" zurück
          // gezogen wird (dann steht's halt nicht mehr in der DB exakt
          // konsistent — ist der seltenere Fall, später ggf. fixen).
          ...(isWon && !existing?.wonAt ? { wonAt: new Date() } : {}),
          ...(isLost && !existing?.lostAt ? { lostAt: new Date() } : {}),
          rawFields: rec.fields as object,
        },
        select: { id: true, status: true },
      });

      // Status-Change als Activity loggen, wenn Status sich geändert hat.
      if (existing && existing.status !== status) {
        await prisma.dealActivity.create({
          data: {
            dealId: deal.id,
            kind: "status_change",
            title: `Status: ${existing.status ?? "—"} → ${status ?? "—"}`,
            metadata: { fromStatus: existing.status, toStatus: status },
          },
        });
      }

      result.upserts += 1;
    } catch (err) {
      result.errors.push(
        `Record ${rec.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Sweep: in Airtable gelöschte Deals lokal entfernen.
  const seenIds = records.map((r) => r.id);
  const stale = await prisma.deal.findMany({
    where: { airtableId: { not: null, notIn: seenIds } },
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.deal.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
    result.deletes = stale.length;
  }

  return result;
}
