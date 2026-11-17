import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { widerrufDurchVermittler } from "@/lib/policen/server";

// „Einwilligung widerrufen / Unterlagen löschen“ im Kontakt (lib/policen, Ole 17.11.2026): Der Kunde hat seinen
// Widerruf auf anderem Weg erklärt (Telefon, E-Mail, im Termin). Löscht alle Unterlagen vom Kunden an diesem Lead
// und protokolliert den Widerruf.
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host && origin !== process.env.APP_URL?.replace(/\/$/, "")) {
    return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  }
  const { id } = await params;
  const customerId = await writableCustomerId(id);
  if (!customerId) return Response.json({ error: "In der Vorschau nicht möglich." }, { status: 403 });
  const ctx = await getBuyerContext();
  const r = await widerrufDurchVermittler(id, customerId, ctx?.userId ?? null);
  return r ? Response.json({ ok: true, geloescht: r.geloescht }) : Response.json({ error: "Nicht gefunden." }, { status: 404 });
}
