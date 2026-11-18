import { getCurrentSession } from "@/lib/auth";
import { tarifExport } from "@/lib/tarif-vorschlaege-server";

// Export der übernommenen Vorschläge (Einstellungen › Tarifkatalog) als JSON für
// scripts/tarif-vorschlaege-export.mjs, das sie in die Katalogdateien unter data/tarifkatalog schreibt. Nur Admins.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  const d = await tarifExport();
  return new Response(`${JSON.stringify(d, null, 2)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="tarif-vorschlaege-${d.erzeugt.slice(0, 10)}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
