import { runOutreach } from "@/lib/whatsapp/outreach";
import { runReminders } from "@/lib/whatsapp/reminders";

// Zentraler WhatsApp-Cron (z. B. cron-job.org alle 5 Minuten):
//   1. Erstanschreiben neuer Leads ohne Termin
//   2. Termin-Erinnerungen ~24 h vorher
// Per WHATSAPP_WEBHOOK_SECRET gesichert (?token= oder x-webhook-secret).
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
  const outreach = await runOutreach().catch((e: unknown) => ({
    error: e instanceof Error ? e.message : String(e),
  }));
  const reminders = await runReminders().catch((e: unknown) => ({
    error: e instanceof Error ? e.message : String(e),
  }));
  return Response.json({ ok: true, outreach, reminders });
}

export const GET = handle;
export const POST = handle;
