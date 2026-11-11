import { limitResponse } from "@/lib/rate-limit";
import { fromFlatPayload, ingestLead } from "@/lib/lead-intake";
import { reportError } from "@/lib/monitoring";

// Lead-Eingang per Webhook (Übergang, z. B. Zapier „Facebook Lead Ads“ →
// „Webhooks by Zapier: POST“). Zuordnung über form_id (Lead-Eingang im Admin)
// oder per ?kunde=<Kunden-ID>&produkt=<Produkt>.
// https://<domain>/api/leads/eingang?token=<LEAD_WEBHOOK_TOKEN>
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Nur grobe Obergrenze (Absender schicken Bursts; Echtheit prüft die Signatur/das Token)
  const limited = limitResponse("webhook", "leads-eingang");
  if (limited) return limited;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("x-webhook-token");
  if (!process.env.LEAD_WEBHOOK_TOKEN || token !== process.env.LEAD_WEBHOOK_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const type = req.headers.get("content-type") ?? "";
  let body: unknown;
  try {
    body =
      type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")
        ? Object.fromEntries((await req.formData()).entries())
        : await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const items = (Array.isArray(body) ? body : [body]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  const override = { customerId: url.searchParams.get("kunde"), productKey: url.searchParams.get("produkt") };
  const results = [];
  for (const item of items) {
    try {
      results.push(await ingestLead(fromFlatPayload(item), "zapier", override));
    } catch (err) {
      reportError(err, "lead-webhook");
      return Response.json({ error: "Lead konnte nicht gespeichert werden." }, { status: 500 });
    }
  }
  return Response.json({ ok: true, results });
}
