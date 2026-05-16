import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";

const TABLES = [
  process.env.AIRTABLE_TABLE_WECHSEL ?? "PKV-Wechsel-Leads",
  process.env.AIRTABLE_TABLE_NEUGESCHAEFT ?? "PKV-Neugeschäft-Leads",
];

// Diagnose-Endpoint: zeigt für jede Lead-Tabelle die Spaltennamen des
// ersten Records (mit gekürzten Sample-Werten). Hilft beim Debuggen welche
// Airtable-Spalten verfügbar sind und wie sie genau heißen.
export async function GET() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Nur Admins." }, { status: 403 });
  }

  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) {
    return NextResponse.json(
      { error: "AIRTABLE_TOKEN / AIRTABLE_BASE_ID nicht gesetzt." },
      { status: 500 },
    );
  }

  const out: Record<string, unknown> = {};

  for (const table of TABLES) {
    try {
      const url = new URL(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`,
      );
      url.searchParams.set("maxRecords", "1");
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        out[table] = { error: `HTTP ${res.status}: ${await res.text()}` };
        continue;
      }
      const json = (await res.json()) as {
        records?: { id: string; fields: Record<string, unknown> }[];
      };
      const rec = json.records?.[0];
      if (!rec) {
        out[table] = { error: "Keine Records vorhanden." };
        continue;
      }
      const sample: Record<string, string> = {};
      for (const [k, v] of Object.entries(rec.fields)) {
        const s =
          typeof v === "string"
            ? v
            : Array.isArray(v)
              ? `[Array len=${v.length}]`
              : typeof v === "object" && v !== null
                ? "[Object]"
                : String(v);
        sample[k] = s.length > 60 ? s.slice(0, 60) + "…" : s;
      }
      out[table] = {
        recordId: rec.id,
        fieldKeys: Object.keys(rec.fields),
        sample,
      };
    } catch (err) {
      out[table] = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json(out, {
    headers: { "cache-control": "no-store" },
  });
}
