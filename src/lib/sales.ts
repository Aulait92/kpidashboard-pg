// Sales-Pipeline (Performance-Growth eigener B2B-Verkaufsprozess) —
// Server-only: liest Deals aus einer eigenen Airtable-Base (Env:
// AIRTABLE_SALES_BASE_ID und AIRTABLE_TOKEN — same PAT wie Leads-Sync,
// braucht Read-Scope auf die "Deal-Pipeline"-Tabelle), spiegelt sie
// in der DB (siehe Deal-Model in prisma/schema.prisma).
//
// Sync-Verhalten ist defensiv: ist die ENV nicht gesetzt, no-op. Das
// erlaubt das schrittweise Hochfahren ohne den restlichen Sync zu brechen.
//
// Client-safe Phasen-Konstanten + Helpers liegen separat in
// lib/sales-phases.ts — Client-Komponenten importieren von dort, damit
// Prisma nicht ins Browser-Bundle leakt.

import { prisma } from "@/lib/prisma";
import { findSalesPhaseForStatus } from "@/lib/sales-phases";

export {
  SALES_PIPELINE_PHASES,
  findSalesPhaseForStatus,
  winProbabilityFor,
  type SalesPhase,
} from "@/lib/sales-phases";

const SALES_TABLE =
  process.env.AIRTABLE_TABLE_DEAL_PIPELINE ?? "Deal-Pipeline";

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
const VALUE_FIELDS = [
  "Abschluss-Volumen",
  "Abschlussvolumen",
  "Wert",
  "Deal-Wert",
  "Value",
  "Volumen",
];
const STATUS_FIELDS = ["Status", "Phase", "Stage", "Bearbeitungsstatus"];
// Owner brauchen wir nicht — pro PG-Setup gibt's keinen dedizierten
// Sales-Owner pro Deal. Wir lesen das Feld nicht (und schreiben nichts
// rein). DB-Spalte Deal.owner bleibt als Legacy bestehen, wird einfach
// nicht befüllt.
const OWNER_FIELDS: readonly string[] = [];
const SOURCE_FIELDS = ["Source", "Quelle", "Kanal"];
const PRODUCT_FIELDS = ["Produkt", "Product", "Paket", "Angebot"];
const CLOSE_DATE_FIELDS = [
  "Abschluss-Datum",
  "Abschlussdatum",
  "Close Date",
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
      // ALLE Array-Elemente durchsuchen (nicht nur das erste): Lookup-/Linked-
      // Felder liefern oft [recXYZ, "Klarname"] o. ä. — der Klarname steht
      // dann nicht zwingend an Position 0.
      for (const item of v) {
        if (typeof item === "string" && item.trim() && !item.startsWith("rec")) {
          return item.trim();
        }
        if (typeof item === "number" && Number.isFinite(item)) {
          return String(item);
        }
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
  // Diagnose: Rohwert der „Produkt"-Spalte + was daraus gelesen wurde (erste
  // paar Deals mit gesetztem Produkt-Feld). Zeigt, ob die Spalte ein
  // Linked-Record (rec-IDs), Single-Select-String o. ä. ist.
  productSample: { deal: string | null; raw: unknown; resolved: string | null }[];
};

export async function syncSales(): Promise<SalesSyncResult> {
  const result: SalesSyncResult = {
    records: 0,
    upserts: 0,
    deletes: 0,
    skipped: false,
    errors: [],
    productSample: [],
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
      const product = readString(rec.fields, PRODUCT_FIELDS);
      // Diagnose-Sample: Rohwert der ersten Produkt-Spalte, die im Record
      // existiert (auch wenn readString sie nicht auflösen konnte).
      if (result.productSample.length < 12) {
        const rawKey = PRODUCT_FIELDS.find((k) => rec.fields[k] != null);
        if (rawKey) {
          result.productSample.push({
            deal: name,
            raw: rec.fields[rawKey],
            resolved: product,
          });
        }
      }
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
          product,
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
          product,
          closeDate,
          notes,
          lostReason,
          // Status ist Source-of-Truth: wonAt/lostAt reflektieren NUR
          // den aktuellen Terminal-Zustand. Bewegt sich ein Deal aus
          // Serienbetrieb/Verloren wieder zurück, werden die Felder
          // geleert — sonst zählen die KPIs den Deal weiter als gewonnen
          // bzw. der Filter "Nur aktiv" versteckt ihn fälschlich.
          // Erste Entry-Zeit bleibt erhalten (existing ?? new Date()).
          wonAt: isWon ? (existing?.wonAt ?? new Date()) : null,
          lostAt: isLost ? (existing?.lostAt ?? new Date()) : null,
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
