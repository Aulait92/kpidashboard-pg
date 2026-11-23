import { getCurrentSession } from "@/lib/auth";
import { paketZip } from "@/lib/belege/monatspaket";

// Monatspaket als ZIP herunterladen (nur Admins), Geld › Kosten › Belege.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(_req: Request, ctx: { params: Promise<{ monat: string }> }): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  const monat = (await ctx.params).monat;
  if (!/^\d{4}-\d{2}$/.test(monat)) return new Response("Ungültiger Monat.", { status: 400 });
  const { zip } = await paketZip(monat);
  return new Response(new Uint8Array(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="Belege ${monat}.zip"`, "Cache-Control": "private, no-store" },
  });
}
