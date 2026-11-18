import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { prisma } from "@/lib/prisma";
import { leadScope } from "@/lib/team";
import { behalteUnterlage, loescheUnterlage } from "@/lib/policen/server";
import { signiereLink } from "@/lib/policen/ablage";
import { zweiFaktorAktiv } from "@/lib/totp-account";

// Unterlage, die der Lead per WhatsApp geschickt hat (lib/policen): öffnen bzw. herunterladen (?download=1), löschen
// oder als „Beratungsdokumentation behalten“ kennzeichnen (PATCH { behalten, vermerk? }).
// Nur für Logins, die den Lead sehen dürfen (Inhaber bzw. zuständiger Berater), nie in der Admin-Vorschau.
// GET gibt keine Datei aus, sondern leitet auf einen kurzlebigen signierten Link (2 Minuten, nur für diesen Login,
// lib/policen/ablage.ts signiereLink) weiter; die Datei liefert api/buyer/policen/datei (Rechtsprüfung A6).
// Ohne Zwei-Faktor-Login (AVV § 5, Ole 18.11.2026) geht es zur Einrichtung und danach zurück zu den Dokumenten.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; docId: string }> }): Promise<Response> {
  const { id, docId } = await params;
  const ctx = await getBuyerContext();
  if (!ctx || ctx.demo || ctx.preview || !ctx.userId) return new Response("Nicht gefunden.", { status: 404 });
  const lead = await prisma.lead.findFirst({ where: { id, ...leadScope(ctx) }, select: { id: true } });
  if (!lead) return new Response("Nicht gefunden.", { status: 404 });
  const doc = await prisma.leadDocument.findFirst({ where: { id: docId, leadId: lead.id, customerId: ctx.customerId, status: "gespeichert" }, select: { id: true } });
  if (!doc) return new Response("Nicht gefunden.", { status: 404 });
  if (!(await zweiFaktorAktiv(ctx.userId))) {
    const zurueck = encodeURIComponent(`/buyer/leads/${lead.id}#dokumente`);
    return new Response(null, { status: 303, headers: { Location: `/buyer/konto/sicherheit/zwei-faktor?zurueck=${zurueck}`, "Cache-Control": "private, no-store" } });
  }
  const download = new URL(req.url).searchParams.get("download") === "1";
  const t = signiereLink({ leadId: lead.id, docId: doc.id, userId: ctx.userId, download });
  return new Response(null, { status: 303, headers: { Location: `/api/buyer/policen/datei?t=${encodeURIComponent(t)}`, "Cache-Control": "private, no-store" } });
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

function fremdeHerkunft(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !!origin && new URL(origin).host !== new URL(req.url).host && origin !== process.env.APP_URL?.replace(/\/$/, "");
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; docId: string }> }): Promise<Response> {
  if (fremdeHerkunft(req)) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  const { id, docId } = await params;
  const customerId = await writableCustomerId(id);
  if (!customerId) return Response.json({ error: "In der Vorschau nicht möglich." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { behalten?: unknown; vermerk?: unknown } | null;
  if (typeof body?.behalten !== "boolean") return Response.json({ error: "Angabe fehlt." }, { status: 400 });
  const ctx = await getBuyerContext();
  const ok = await behalteUnterlage(id, docId, {
    customerId,
    userId: ctx?.userId ?? null,
    behalten: body.behalten,
    vermerk: typeof body.vermerk === "string" ? body.vermerk : null,
  });
  return ok ? Response.json({ ok: true }) : Response.json({ error: "Nicht gefunden." }, { status: 404 });
}
