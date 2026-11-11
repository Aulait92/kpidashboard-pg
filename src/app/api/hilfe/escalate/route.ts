import { getBuyerContext } from "@/lib/buyer-context";
import { reportError } from "@/lib/monitoring";
import { shortSummary } from "@/lib/support";
import { contactEscalation, offerEscalation, type SupportChannel } from "@/lib/support-server";
import { limitResponse } from "@/lib/rate-limit";

// „Mit Mensch sprechen“ im Hilfe-Chat.
// POST {questions?: string[], page?} → Weitergabe anbieten (Referenz + Kontakt-Links).
// PATCH {id, channel: "whatsapp"|"email"|"team"} → Kunde hat einen Weg gewählt: Admins per Push informieren.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx) return Response.json({ error: "Bitte neu anmelden." }, { status: 401 });
  const limited = limitResponse("supportEscalation", ctx.userId ?? ctx.customerId);
  if (limited) return limited;
  let body: { questions?: unknown; page?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // leerer Body ist erlaubt
  }
  const questions = Array.isArray(body.questions) ? body.questions.filter((q): q is string => typeof q === "string").slice(-2) : [];
  const page = typeof body.page === "string" ? body.page.slice(0, 200) : null;
  try {
    const escalation = await offerEscalation(ctx, {
      reason: "user_request",
      summary: questions.length ? shortSummary(questions.join(" / ")) : "Möchte mit unserem Team sprechen.",
      source: "user",
      page,
    });
    return Response.json({ escalation });
  } catch (err) {
    reportError(err, "hilfe-escalate");
    return Response.json({ error: "Das hat nicht geklappt. Bitte noch einmal versuchen." }, { status: 500 });
  }
}

export async function PATCH(req: Request): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx) return Response.json({ ok: false }, { status: 401 });
  if (limitResponse("supportEscalation", `patch:${ctx.userId ?? ctx.customerId}`)) return Response.json({ ok: false }, { status: 429 });
  let body: { id?: unknown; channel?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const channel = body.channel;
  if (typeof body.id !== "string" || (channel !== "whatsapp" && channel !== "email" && channel !== "team")) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const ok = await contactEscalation(ctx, body.id, channel as SupportChannel).catch((e: unknown) => {
    reportError(e, "hilfe-escalate-contact");
    return false;
  });
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
