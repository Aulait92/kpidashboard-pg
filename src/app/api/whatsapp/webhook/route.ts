import { handleInboundPayload } from "@/lib/whatsapp/gateway";

// 360dialog/Meta liefern eingehende WhatsApp-Nachrichten und Zustellstatus per
// POST an diese URL. Nicht cachen (Route Handler sind standardmäßig nicht
// gecacht; GET hier explizit dynamisch).
export const dynamic = "force-dynamic";

// Absicherung: Die Webhook-URL wird mit ?token=<secret> registriert und gegen
// WHATSAPP_WEBHOOK_SECRET geprüft. Solange das Secret nicht gesetzt ist, läuft
// der Endpoint offen (nur für die lokale Inbetriebnahme) — VOR dem Go-Live
// zwingend setzen.
function isAuthorized(req: Request): boolean {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!expected) {
    console.warn(
      "[whatsapp webhook] WHATSAPP_WEBHOOK_SECRET nicht gesetzt — Endpoint offen.",
    );
    return true;
  }
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("token") ?? req.headers.get("x-webhook-secret") ?? "";
  return provided === expected;
}

// Verifizierungs-Handshake (hub.challenge) — schadet nicht, falls ungenutzt.
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const challenge = url.searchParams.get("hub.challenge");
  if (challenge) return new Response(challenge, { status: 200 });
  return Response.json({ ok: true });
}

export async function POST(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }

  try {
    const result = await handleInboundPayload(payload);
    // Immer 200 quittieren, damit 360dialog/Meta nicht endlos erneut zustellen;
    // fachliche Fehler werden im Ergebnis gemeldet und geloggt.
    if (result.errors.length > 0) {
      console.warn("[whatsapp webhook] Fehler:", result.errors);
    }
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[whatsapp webhook]", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 },
    );
  }
}
