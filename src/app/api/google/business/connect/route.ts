import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { gbpAuthUrl } from "@/lib/empfehlung/google-business";

// Bewertungs-Wächter: Google-Unternehmensprofil verbinden (nur Inhaber, nur mit Modul).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || ctx.teamRole !== "owner") return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { empfehlungEnabled: true } });
  if (!c?.empfehlungEnabled) return Response.json({ error: "Modul nicht aktiv." }, { status: 403 });
  try {
    return new Response(null, { status: 302, headers: { Location: gbpAuthUrl(ctx.customerId) } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Fehler" }, { status: 500 });
  }
}
