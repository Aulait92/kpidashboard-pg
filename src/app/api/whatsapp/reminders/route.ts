import { isCronAuthorized } from "@/lib/cron-auth";
import { runReminders } from "@/lib/whatsapp/reminders";

// Termin-Erinnerungen (Alt-Endpunkt; /api/whatsapp/cron erledigt Erinnerungen
// UND Erstanschreiben in einem Aufruf). Per WHATSAPP_WEBHOOK_SECRET gesichert.
export const dynamic = "force-dynamic";

const LABEL = "whatsapp-reminders";
function authorized(req: Request): boolean {
  return isCronAuthorized(req, process.env.WHATSAPP_WEBHOOK_SECRET, { label: LABEL, legacyHeaders: ["x-webhook-secret"] });
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ ok: true, ...(await runReminders()) });
}

export const GET = handle;
export const POST = handle;
