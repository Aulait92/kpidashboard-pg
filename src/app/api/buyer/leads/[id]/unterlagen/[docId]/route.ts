import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { prisma } from "@/lib/prisma";
import { leadScope } from "@/lib/team";
import { ladeUnterlage, loescheUnterlage } from "@/lib/policen/server";

// Unterlage, die der Lead per WhatsApp geschickt hat (lib/policen): ansehen (entschlüsselt) oder löschen.
// Nur für Logins, die den Lead sehen dürfen (Inhaber bzw. zuständiger Berater). Unterlagen mit möglichen
// Gesundheitsangaben nie in der Admin-Vorschau.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }): Promise<Response> {
  const { id, docId } = await params;
  const ctx = await getBuyerContext();
  if (!ctx || ctx.demo) return new Response("Nicht gefunden.", { status: 404 });
  const lead = await prisma.lead.findFirst({ where: { id, ...leadScope(ctx) }, select: { id: true } });
  if (!lead) return new Response("Nicht gefunden.", { status: 404 });
  const doc = await ladeUnterlage(lead.id, docId, ctx);
  if (!doc) return new Response("Nicht gefunden.", { status: 404 });
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.data.length),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; docId: string }> }): Promise<Response> {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host && origin !== process.env.APP_URL?.replace(/\/$/, "")) {
    return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  }
  const { id, docId } = await params;
  const customerId = await writableCustomerId(id);
  if (!customerId) return Response.json({ error: "In der Vorschau nicht möglich." }, { status: 403 });
  const ctx = await getBuyerContext();
  const ok = await loescheUnterlage(id, docId, customerId, ctx?.userId ?? null);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "Nicht gefunden." }, { status: 404 });
}
