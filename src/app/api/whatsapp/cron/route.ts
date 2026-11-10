import { checkAppointmentResponses } from "@/lib/calendar";
import { runOutreach } from "@/lib/whatsapp/outreach";
import { runReminders } from "@/lib/whatsapp/reminders";
import { pruneUsage } from "@/lib/usage";
import { pruneAudit } from "@/lib/audit";
import { pruneTransient } from "@/lib/erasure";
import { reportError } from "@/lib/monitoring";
import { runOnboardingCron } from "@/lib/onboarding-cron";
import { beat } from "@/lib/heartbeat";

// Zentraler Cron (z. B. cron-job.org alle 5 Minuten):
//   1. Erstanschreiben neuer Leads ohne Termin
//   2. Termin-Erinnerungen ~24 h vorher
//   3. Onboarding-Automatik (siehe lib/onboarding-cron.ts)
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
  const outreach = await runOutreach().catch((e: unknown) => {
    reportError(e, "cron-outreach");
    return { error: e instanceof Error ? e.message : String(e) };
  });
  // Absagen über die Kalendereinladung (Lead oder Berater) erkennen — vor den
  // Erinnerungen, damit abgesagte Termine keine Erinnerung mehr bekommen.
  const responses = await checkAppointmentResponses().catch((e: unknown) => {
    reportError(e, "cron-calendar-responses");
    return { error: e instanceof Error ? e.message : String(e) };
  });
  const reminders = await runReminders().catch((e: unknown) => {
    reportError(e, "cron-reminders");
    return { error: e instanceof Error ? e.message : String(e) };
  });
  // Onboarding: Erinnerungen, Leads per E-Mail (Nur Betreuung), Feedback, Tag 90.
  const onboarding = await runOnboardingCron().catch((e: unknown) => {
    reportError(e, "cron-onboarding");
    return { error: e instanceof Error ? e.message : String(e) };
  });
  // Einmal täglich (03:00–03:05 UTC): Löschfristen (siehe docs/datenschutz.md).
  const now = new Date();
  const pruned =
    now.getUTCHours() === 3 && now.getUTCMinutes() < 5
      ? {
          usage: await pruneUsage().catch(() => null),
          audit: await pruneAudit(now).catch(() => null),
          transient: await pruneTransient(now).catch(() => null),
        }
      : undefined;
  const failed = Object.entries({ outreach, responses, reminders, onboarding })
    .filter(([, r]) => r && typeof r === "object" && "error" in r)
    .map(([k]) => k);
  await beat("cron", failed.length === 0, failed.length ? `Fehler in: ${failed.join(", ")}` : null);
  return Response.json({ ok: true, outreach, responses, reminders, onboarding, pruned });
}

export const GET = handle;
export const POST = handle;
