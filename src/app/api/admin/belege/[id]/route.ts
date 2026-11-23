import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Beleg-Datei (nur Admins), verlinkt aus BWA „Woraus besteht das?“ und Geld › Kosten › Belege. Eigene Datei aus der
// Ablage (lib/belege/ablage.ts), sonst bei übernommenen Belegen aus GetMyInvoices.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  const id = (await ctx.params).id;
  const beleg = await prisma.beleg.findUnique({ where: { id }, select: { datei: true, mimeType: true, gmiUid: true, dateiname: true, firma: true, nummer: true } });
  if (!beleg) return new Response("Nicht gefunden.", { status: 404 });
  let daten: Uint8Array | null = beleg.datei ? new Uint8Array(beleg.datei) : null;
  let typ = beleg.mimeType ?? "application/pdf";
  if (!daten && beleg.gmiUid) {
    const { gmiDatei } = await import("@/lib/belege/gmi");
    const d = await gmiDatei(beleg.gmiUid).catch(() => null);
    if (d) {
      daten = d.daten;
      typ = d.typ;
    }
  }
  if (!daten) return new Response("Beleg gerade nicht abrufbar.", { status: 502 });
  const name = beleg.dateiname || `${beleg.firma ?? "Beleg"} ${beleg.nummer ?? id}.pdf`;
  return new Response(Buffer.from(daten), {
    headers: { "Content-Type": typ, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`, "Cache-Control": "private, no-store" },
  });
}
