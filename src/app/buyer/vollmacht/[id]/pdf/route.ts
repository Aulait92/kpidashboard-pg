// PDF der Maklervollmacht für den Makler: ohne ?v= alle Dokumente (wie unterschrieben), mit ?v=<Versicherer> das
// Übertragungsschreiben samt Vollmacht (und ggf. Einwilligung) für diesen Versicherer, mit ?offen=1 alle noch offenen in einer Datei.

import { getBuyerContext } from "@/lib/buyer-context";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await getBuyerContext();
  if (!c) return new Response("Nicht angemeldet", { status: 401 });
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const v = q.get("v");
  const { vollmachtPdfFuer } = await import("@/lib/maklervollmacht/server");
  const r = await vollmachtPdfFuer(id, c.customerId, q.get("offen") ? { offen: true } : v ? v.slice(0, 80) : null);
  if (!r) return new Response("Nicht gefunden", { status: 404 });
  return new Response(Buffer.from(r.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${r.name.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
