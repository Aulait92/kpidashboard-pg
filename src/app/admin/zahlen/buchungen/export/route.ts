import { getCurrentSession } from "@/lib/auth";
import { buchungenCsv, loadBuchungen, type BuchungFilter } from "@/lib/admin-buchungen";

// CSV-Export der gefilterten Buchungen (gleiche Filter wie die Seite).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  const url = new URL(req.url);
  const p = url.searchParams;
  const get = (k: string) => p.get(k) || undefined;
  const f: BuchungFilter = { monat: get("monat"), von: get("von"), bis: get("bis"), art: get("art"), status: get("status"), kunde: get("kunde"), q: get("q") };
  const { rows } = await loadBuchungen(f);
  const name = `buchungen-${f.monat ?? (f.von || f.bis ? `${f.von ?? ""}_${f.bis ?? ""}` : "monat")}.csv`.replace(/[^\w.-]/g, "");
  return new Response(buchungenCsv(rows, url.origin), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` },
  });
}
