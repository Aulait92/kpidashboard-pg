import { sendToAdmins } from "@/lib/push";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { recordUsage, type UsageType } from "@/lib/usage";

// Client-Ereignisse aus dem Kunden-CRM: Seitenaufrufe, Fehler-Toasts,
// Feedback („Etwas unklar?"). Nur mit gültiger Sitzung (Middleware).
export const dynamic = "force-dynamic";

const TYPES = new Set<UsageType>(["page", "error", "feedback", "action"]);

export async function POST(req: Request): Promise<Response> {
  let body: { type?: string; name?: string; path?: string; text?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const type = body.type as UsageType;
  if (!TYPES.has(type)) return Response.json({ ok: false }, { status: 400 });
  const name = String(body.name ?? type).slice(0, 120);
  const path = body.path ? String(body.path).slice(0, 200) : null;

  if (type === "feedback") {
    const text = String(body.text ?? "").trim().slice(0, 2000);
    if (!text) return Response.json({ ok: false }, { status: 400 });
    await recordUsage("feedback", "feedback", { path, meta: { text } });
    const ctx = await getBuyerContext();
    if (ctx && !ctx.preview) {
      const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true } });
      await sendToAdmins({
        title: `💬 Feedback von ${c?.name ?? "Kunde"}`,
        body: text.slice(0, 140),
        url: "/admin/nutzung",
        tag: `feedback:${Date.now()}`,
      }).catch(() => {});
    }
    return Response.json({ ok: true });
  }
  await recordUsage(type, name, { path });
  return Response.json({ ok: true });
}
