import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";

const TABLES = [
  process.env.AIRTABLE_TABLE_LEADS ?? "Leads",
  process.env.AIRTABLE_TABLE_BUYERS ?? "Kunden",
  process.env.AIRTABLE_TABLE_KUNDEN_PRODUKT_BEZUG ?? "Kunden-Produkt-Bezug",
];

// Diagnose-Endpoint: zeigt für jede Tabelle die Spaltennamen + den
// vollen Wert (gekürzt) des ersten Records. Für Arrays/Objekte JSON-
// stringified, damit man Lookup- vs. Linked-Record-Format unterscheiden
// kann. Hilft beim Debuggen, warum classifyLeadProduct nichts findet.
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
      url.searchParams.set("maxRecords", "3");
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
      const records = json.records ?? [];
      if (records.length === 0) {
        out[table] = { error: "Keine Records vorhanden." };
        continue;
      }
      out[table] = records.map((rec) => {
        const sample: Record<string, string> = {};
        for (const [k, v] of Object.entries(rec.fields)) {
          let s: string;
          if (typeof v === "string") s = v;
          else if (typeof v === "number" || typeof v === "boolean") s = String(v);
          else s = JSON.stringify(v);
          sample[k] = s.length > 200 ? s.slice(0, 200) + "…" : s;
        }
        return { recordId: rec.id, fields: sample };
      });
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
