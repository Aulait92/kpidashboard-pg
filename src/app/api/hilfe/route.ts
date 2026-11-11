import Anthropic from "@anthropic-ai/sdk";
import { getBuyerContext } from "@/lib/buyer-context";
import { askHilfe, type HilfeTurn } from "@/lib/hilfe";
import { reportError } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import { detectEscalation, shortSummary } from "@/lib/support";
import { offerEscalation } from "@/lib/support-server";

// KI-Hilfe im Kundenbereich. POST {question, history, page} → {id, answer, links}.
// PATCH {id, rating: "up"|"down"} → Bewertung speichern.
// Bei Abrechnung, Vertrag, Fehlern, fehlenden Daten oder Frust (Regeln in
// lib/support.ts oder Einschätzung der KI) kommt `escalation` mit: Referenz und
// fertige Links zu unserem Team (WhatsApp/E-Mail, siehe /api/hilfe/escalate).
// Fragen landen (wie anderes Feedback) als UsageEvent im Admin unter „Nutzung“.
export const dynamic = "force-dynamic";

const LIMIT_PER_HOUR = 30;
const recent = new Map<string, number[]>();
function allowed(key: string): boolean {
  const now = Date.now();
  const list = (recent.get(key) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (list.length >= LIMIT_PER_HOUR) return false;
  list.push(now);
  recent.set(key, list);
  return true;
}

export async function POST(req: Request): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx) return Response.json({ error: "Bitte neu anmelden." }, { status: 401 });

  let body: { question?: unknown; history?: unknown; page?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";
  if (question.length < 2) return Response.json({ error: "Bitte eine Frage eingeben." }, { status: 400 });
  const page = typeof body.page === "string" ? body.page.slice(0, 200) : null;
  const history: HilfeTurn[] = Array.isArray(body.history)
    ? body.history
        .filter((t): t is HilfeTurn => !!t && typeof t === "object" && (t.role === "user" || t.role === "assistant") && typeof t.text === "string")
        .slice(-6)
    : [];

  if (!allowed(ctx.userId ?? ctx.customerId)) {
    return Response.json({ error: "Sie haben gerade sehr viele Fragen gestellt. Bitte in ein paar Minuten noch einmal versuchen." }, { status: 429 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Die KI-Hilfe ist gerade nicht verfügbar." }, { status: 503 });
  }

  try {
    const whatsapp = await hasWhatsAppInbox(ctx.customerId);
    const res = await askHilfe({ question, history, page, role: ctx.teamRole, whatsapp });
    const ev = await prisma.usageEvent
      .create({
        data: {
          customerId: ctx.customerId,
          userId: ctx.userId,
          preview: ctx.preview,
          type: "help",
          name: "question",
          path: page,
          meta: { question, answer: res.answer.slice(0, 2000), links: res.links.map((l) => l.href) },
        },
        select: { id: true },
      })
      .catch(() => null);
    // Regeln zuerst (verlässlich), sonst die Einschätzung der KI
    const thumbsDown = await prisma.usageEvent
      .count({
        where: {
          type: "help",
          customerId: ctx.customerId,
          ...(ctx.userId ? { userId: ctx.userId } : {}),
          at: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          meta: { path: ["rating"], equals: "down" },
        },
      })
      .catch(() => 0);
    const rule = detectEscalation(question, { thumbsDown });
    const reason = rule ?? res.escalate?.reason ?? null;
    const escalation = reason
      ? await offerEscalation(ctx, {
          reason,
          summary: res.escalate?.summary || shortSummary(question),
          source: rule ? "rule" : "ai",
          page,
        }).catch((e: unknown) => {
          reportError(e, "hilfe-escalate");
          return null;
        })
      : null;
    return Response.json({ id: ev?.id ?? null, answer: res.answer, links: res.links, escalation });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      reportError(err, "hilfe-auth");
      return Response.json({ error: "Die KI-Hilfe ist gerade nicht verfügbar." }, { status: 503 });
    }
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
      return Response.json({ error: "Die KI-Hilfe ist gerade ausgelastet. Bitte gleich noch einmal versuchen." }, { status: 503 });
    }
    reportError(err, "hilfe");
    return Response.json({ error: "Das hat nicht geklappt. Bitte noch einmal versuchen." }, { status: 500 });
  }
}

export async function PATCH(req: Request): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx) return Response.json({ ok: false }, { status: 401 });
  let body: { id?: unknown; rating?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (typeof body.id !== "string" || (body.rating !== "up" && body.rating !== "down")) return Response.json({ ok: false }, { status: 400 });
  const ev = await prisma.usageEvent.findFirst({ where: { id: body.id, customerId: ctx.customerId, type: "help" }, select: { id: true, meta: true } });
  if (!ev) return Response.json({ ok: false }, { status: 404 });
  await prisma.usageEvent.update({ where: { id: ev.id }, data: { meta: { ...((ev.meta as Record<string, unknown>) ?? {}), rating: body.rating } } });
  return Response.json({ ok: true });
}
