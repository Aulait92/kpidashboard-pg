import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gmiDatei } from "@/lib/belege/gmi";

// Beleg-PDF aus GetMyInvoices (nur Admins), verlinkt aus BWA „Woraus besteht das?“ und Geld › Kosten › Belege.
// Nur Belege, die in unserer Tabelle stehen (kein freier Zugriff auf beliebige GetMyInvoices-IDs).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ uid: string }> }): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  const uid = Number((await ctx.params).uid);
  if (!Number.isInteger(uid) || uid <= 0) return new Response("Nicht gefunden.", { status: 404 });
  const beleg = await prisma.beleg.findUnique({ where: { gmiUid: uid }, select: { dateiname: true, firma: true, nummer: true } });
  if (!beleg) return new Response("Nicht gefunden.", { status: 404 });
  const datei = await gmiDatei(uid).catch(() => null);
  if (!datei) return new Response("Beleg gerade nicht abrufbar.", { status: 502 });
  const name = beleg.dateiname || `${beleg.firma ?? "Beleg"} ${beleg.nummer ?? uid}.pdf`;
  return new Response(new Uint8Array(datei.daten), {
    headers: {
      "Content-Type": datei.typ,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
