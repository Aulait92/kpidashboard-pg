import { limitResponse } from "@/lib/rate-limit";
import { handleInboundLead } from "@/lib/vertrieb/inbound";

// Lead-Eingang für Meta Lead Ads (über Zapier/Make) und Landingpage-Formulare.
// https://<deine-domain>/api/vertrieb/leads/webhook?token=<WEBHOOK_TOKEN>&source=META_ADS
// source = META_ADS (Standard) oder INBOUND (Website-Formular)
export async function POST(req: Request) {
  // Nur grobe Obergrenze (Absender schicken Bursts; Echtheit prüft die Signatur/das Token)
  const limited = limitResponse("webhook", "vertrieb-leads");
  if (limited) return limited;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("x-webhook-token");
  if (!process.env.VERTRIEB_WEBHOOK_TOKEN || token !== process.env.VERTRIEB_WEBHOOK_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const source = (url.searchParams.get("source") ?? "META_ADS").toUpperCase();
  const type = req.headers.get("content-type") ?? "";
  let body: unknown;
  try {
    body = type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")
      ? Object.fromEntries((await req.formData()).entries())
      : await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const items = Array.isArray(body) ? body : [body];
  const results = [];
  for (const item of items) results.push(await handleInboundLead(item, source));
  return Response.json({ results });
}
