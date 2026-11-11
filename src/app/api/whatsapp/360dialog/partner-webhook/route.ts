import { reportError } from "@/lib/monitoring";
import { retryPendingSelfConnect } from "@/lib/whatsapp/self-connect";
import { syncTemplates } from "@/lib/whatsapp/template-submit";

// Partner-Webhook von 360dialog (im Partner Hub als Webhook-URL eintragen,
// mit ?token=<WHATSAPP_WEBHOOK_SECRET>). Wir nutzen nur die Kanal-Ereignisse
// (channel_created / channel_running): Ist ein selbst verbundener Channel fertig,
// holen wir den API-Key sofort statt erst im nächsten Cron-Lauf.
// Format laut Doku (Using Custom IO): { type: "channel_running", payload: { channel: "<id>" } }.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("token");
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!expected || token !== expected) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let type = "";
  try {
    const body = (await req.json()) as { type?: unknown; event?: unknown };
    type = typeof body.type === "string" ? body.type : typeof body.event === "string" ? body.event : "";
  } catch {
    /* leer oder kein JSON – trotzdem 200, sonst wiederholt 360dialog endlos */
  }
  if (type.startsWith("channel")) {
    await retryPendingSelfConnect(new Date(Date.now() + 31_000)).catch((err) => reportError(err, "d360-partner-webhook"));
  }
  // Vorlagen-Status geändert (waba_template_status_changed, Format laut Doku nicht beschrieben):
  // einfach sofort abgleichen statt auf den nächsten Cron-Lauf zu warten.
  if (type.includes("template")) {
    await syncTemplates(new Date(), { force: true, limit: 20 }).catch((err) => reportError(err, "d360-partner-webhook-templates"));
  }
  // Übrige Ereignisse (z. B. history, smb_app_state_sync bei Coexistence) bewusst ignoriert.
  return Response.json({ ok: true });
}
