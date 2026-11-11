import { limitResponse } from "@/lib/rate-limit";
import { handleWaalaxyWebhook } from "@/lib/vertrieb/linkedin";
import { reportError } from "@/lib/monitoring";

// Waalaxy → Vertrieb: Prospect-Updates (Vernetzt, Nachricht gesendet, Antwort …)
// aus dem Schritt „CRM Sync“. URL: /api/vertrieb/waalaxy/webhook?token=<WEBHOOK_TOKEN>
export async function POST(req: Request) {
  // Nur grobe Obergrenze (Absender schicken Bursts; Echtheit prüft die Signatur/das Token)
  const limited = limitResponse("webhook", "waalaxy");
  if (limited) return limited;
  const token = new URL(req.url).searchParams.get("token") ?? req.headers.get("x-webhook-token");
  if (!process.env.VERTRIEB_WEBHOOK_TOKEN || token !== process.env.VERTRIEB_WEBHOOK_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  try {
    return Response.json({ ok: true, results: await handleWaalaxyWebhook(body) });
  } catch (err) {
    reportError(err, "waalaxy-webhook");
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
