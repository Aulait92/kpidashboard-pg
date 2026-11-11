import { limitResponse } from "@/lib/rate-limit";
import { handleWebhook } from "@/lib/vertrieb/instantly";

// Instantly → Settings → Integrations → Webhooks
// URL: https://<deine-domain>/api/vertrieb/instantly/webhook?token=<WEBHOOK_TOKEN>
export async function POST(req: Request) {
  // Nur grobe Obergrenze (Absender schicken Bursts; Echtheit prüft die Signatur/das Token)
  const limited = limitResponse("webhook", "instantly");
  if (limited) return limited;
  const token = new URL(req.url).searchParams.get("token") ?? req.headers.get("x-webhook-token");
  if (!process.env.VERTRIEB_WEBHOOK_TOKEN || token !== process.env.VERTRIEB_WEBHOOK_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const events = Array.isArray(body) ? body : [body];
  const results = [];
  for (const e of events) {
    if (e && typeof e === "object") results.push(await handleWebhook(e as Record<string, unknown>));
  }
  return Response.json({ results });
}
