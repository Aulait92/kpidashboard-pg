import { runReminders } from "@/lib/whatsapp/reminders";

// Termin-Erinnerungen (Alt-Endpunkt; /api/whatsapp/cron erledigt Erinnerungen
// UND Erstanschreiben in einem Aufruf). Per WHATSAPP_WEBHOOK_SECRET gesichert.
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!expected) return false;
  const token =
    new URL(req.url).searchParams.get("token") ??
    req.headers.get("x-webhook-secret") ??
    "";
  return token === expected;
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ ok: true, ...(await runReminders()) });
}

export const GET = handle;
export const POST = handle;
