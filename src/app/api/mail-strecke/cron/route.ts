import { isCronAuthorized } from "@/lib/cron-auth";
import { reportError } from "@/lib/monitoring";
import { runMailStrecke } from "@/lib/mail-strecke/server";

// Minuten-Cron der Mail-Strecke für Leads ohne WhatsApp (Ole, 18.11.2026, E0, lib/mail-strecke/server.ts): Auslöser
// (keine Nummer, Festnetz, ohne WhatsApp-Einwilligung) binnen Minuten starten, Takt (Tag 2 bis 10, SMS) abarbeiten,
// ausstehende Einladungen nachholen. cron-job.org jede Minute, gesichert wie der WhatsApp-Cron (WHATSAPP_WEBHOOK_SECRET,
// Header „Authorization: Bearer …“ bzw. x-cron-token). Diagnose: /api/ops/diagnose?q=mail-strecke.
export const dynamic = "force-dynamic";

async function handle(req: Request): Promise<Response> {
  if (!isCronAuthorized(req, process.env.WHATSAPP_WEBHOOK_SECRET, { label: "mail-strecke-cron", legacyHeaders: ["x-webhook-secret"] }))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const r = await runMailStrecke();
    return Response.json({ ok: true, ...r, fehler: r.fehler.length });
  } catch (err) {
    reportError(err, "mail-strecke-cron");
    return Response.json({ ok: false }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
