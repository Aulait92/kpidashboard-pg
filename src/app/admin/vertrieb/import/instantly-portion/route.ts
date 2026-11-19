import { getCurrentSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { instantlyPortion, portionCsv } from "@/lib/vertrieb/instantly-portion";

// Tagesportion der Vermittlerliste als CSV für den Instantly-Import (lib/vertrieb/instantly-portion.ts): gemischt nach
// Gesellschaft und Mail-Domain, je Ziel-Domain höchstens N am Tag. Markiert die Kontakte als vergeben; am selben Tag
// kommt beim erneuten Herunterladen dieselbe Portion. Kein Instantly-Aufruf, nichts wird gesendet.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  const fd = await req.formData().catch(() => null);
  const zahl = (k: string) => {
    const n = Number(fd?.get(k));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const p = await instantlyPortion({ menge: zahl("menge"), proDomain: zahl("proDomain"), anwenden: true });
  await audit("vertrieb.instantly_portion", {
    entity: "SalesContact",
    details: { tag: p.tag, anzahl: p.zeilen.length, wiederholt: p.wiederholt, offen: p.offen, gesperrt: p.gesperrt, jeGesellschaft: p.jeGesellschaft },
  });
  return new Response(portionCsv(p.zeilen), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="instantly-portion-${p.tag}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
