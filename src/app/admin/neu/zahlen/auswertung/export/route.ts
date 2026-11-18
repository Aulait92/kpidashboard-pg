import { getCurrentSession } from "@/lib/auth";
import { investorenCsv, investorenPdf } from "@/lib/investoren/export";
import { loadInvestoren, parseInvestorSicht } from "@/lib/investoren/server";

// Export der Investoren-Kennzahlen (Geld › Auswertung): ?format=pdf|csv, ?sicht=kern|gesamt wie die Seite. Nur Admins.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  const p = new URL(req.url).searchParams;
  const d = await loadInvestoren(new Date(), parseInvestorSicht(p.get("sicht")));
  const name = `investoren-kennzahlen-${d.k.lastComplete}-${d.sicht}`;
  if (p.get("format") === "csv") {
    return new Response(investorenCsv(d), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"`, "cache-control": "private, no-store" },
    });
  }
  const pdf = await investorenPdf(d);
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}.pdf"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}
