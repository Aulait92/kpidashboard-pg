import { handleCalendlyWebhook, verifySignature } from "@/lib/vertrieb/calendly";

// Calendly → Webhook-Subscription (wird über "Calendly verbinden" im CRM angelegt)
// https://<deine-domain>/api/vertrieb/calendly/webhook?token=<WEBHOOK_TOKEN>
export async function POST(req: Request) {
  const secret = process.env.VERTRIEB_WEBHOOK_TOKEN;
  const raw = await req.text();
  const token = new URL(req.url).searchParams.get("token");
  const signed = secret ? verifySignature(raw, req.headers.get("calendly-webhook-signature"), secret) : false;
  if (!secret || (token !== secret && !signed)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  return Response.json(await handleCalendlyWebhook(body as Parameters<typeof handleCalendlyWebhook>[0]));
}
