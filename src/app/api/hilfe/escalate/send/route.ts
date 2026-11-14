import { getBuyerContext } from "@/lib/buyer-context";
import { reportError } from "@/lib/monitoring";
import { limitResponse } from "@/lib/rate-limit";
import { sendSupportMail } from "@/lib/support-server";

// „Mit Mensch sprechen“: Nachricht direkt aus der App an den Support (lib/support-server.ts → sendSupportMail).
// POST {id, text} → { ok, ref, via } bzw. { ok: false, error }.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx) return Response.json({ ok: false, error: "Bitte neu anmelden." }, { status: 401 });
  const limited = limitResponse("supportEscalation", `send:${ctx.userId ?? ctx.customerId}`);
  if (limited) return limited;
  let body: { id?: unknown; text?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Ungültige Anfrage." }, { status: 400 });
  }
  if (typeof body.id !== "string" || typeof body.text !== "string") return Response.json({ ok: false, error: "Ungültige Anfrage." }, { status: 400 });
  try {
    const r = await sendSupportMail(ctx, body.id, body.text);
    return Response.json(r, { status: r.ok ? 200 : 400 });
  } catch (err) {
    reportError(err, "hilfe-escalate-send");
    return Response.json({ ok: false, error: "Senden hat nicht geklappt." }, { status: 500 });
  }
}
