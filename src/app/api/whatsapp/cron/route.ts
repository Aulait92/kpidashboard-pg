import { after } from "next/server";
import { checkAppointmentResponses } from "@/lib/calendar";
import { runOutreach } from "@/lib/whatsapp/outreach";
import { runReminders } from "@/lib/whatsapp/reminders";
import { pruneUsage } from "@/lib/usage";
import { pruneAudit } from "@/lib/audit";
import { pruneTransient } from "@/lib/erasure";
import { berlinMonth, chargeWhatsAppFees, feeChargeDue } from "@/lib/whatsapp/fees";
import { expireBestandCancellations, reconcileSeatBilling } from "@/lib/billing";
import { renewOrders } from "@/lib/ppl/orders";
import { redistributeParked } from "@/lib/ppl/engine";
import { runCampaigns } from "@/lib/bestand/campaigns";
import { runSequences } from "@/lib/lead-sequences";
import { reportError } from "@/lib/monitoring";
import { runOnboardingCron } from "@/lib/onboarding-cron";
import { beat } from "@/lib/heartbeat";
import { runGarantien } from "@/lib/garantien-server";
import { enrichPendingAddresses } from "@/lib/vertrieb/address-enrich";
import { retryPendingSelfConnect } from "@/lib/whatsapp/self-connect";

// Zentraler Cron (z. B. cron-job.org alle 5 Minuten):
//   1. Erstanschreiben neuer Leads ohne Termin
//   2. Termin-Erinnerungen ~24 h vorher
//   3. Onboarding-Automatik (siehe lib/onboarding-cron.ts)
//   4. Nachfass-Abfolgen (siehe lib/lead-sequences.ts)
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
  // Einmal täglich (03:00–03:05 UTC): Löschfristen (siehe docs/datenschutz.md), Logins, Garantien.
  const now = new Date();
  // Bestandskunden-Modul: zum Periodenende gekündigte Module abschalten (Kunde hat selbst gekündigt)
  await expireBestandCancellations(now).catch((e: unknown) => reportError(e, "cron-bestand-expire"));
  const pruned =
    now.getUTCHours() === 3 && now.getUTCMinutes() < 5
      ? {
          usage: await pruneUsage().catch(() => null),
          audit: await pruneAudit(now).catch(() => null),
          transient: await pruneTransient(now).catch(() => null),
          // Logins im Abo nachziehen (z. B. nach Startpreis-Phase oder Abo-Start)
          seats: await reconcileSeatBilling().catch((e: unknown) => {
            reportError(e, "cron-seats");
            return null;
          }),
          // Lead- und Break-even-Garantie prüfen: legt Fälle an, bucht nichts (Gewähren in Admin „Heute“)
          garantien: await runGarantien(now).catch((e: unknown) => {
            reportError(e, "cron-garantien");
            return null;
          }),
        }
      : undefined;
  // WhatsApp-Gebühren des Vormonats: am 1.–3. um 03 Uhr UTC (idempotent,
  // Wiederholungen holen fehlgeschlagene Stripe-Übertragungen nach).
  const berlinDay = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", day: "numeric" }).format(now));
  const fees =
    // Seit 11.11.2026 sind WhatsApp-Gebühren im Preis enthalten (PRICE_LIST.whatsappIncluded):
    // keine Weiterberechnung mehr; erfasst werden sie weiter (Zahlen-Seite: direkte Kosten).
    pruned && feeChargeDue(berlinDay)
      ? await chargeWhatsAppFees(berlinMonth(now, -1)).catch((e: unknown) => {
          reportError(e, "cron-whatsapp-fees");
          return { error: e instanceof Error ? e.message : String(e) };
        })
      : undefined;
  // Pay-per-Lead: Wochenbestellungen verlängern (Fr ab 10 Uhr), geparkte Leads erneut verteilen
  const ppl = {
    renewed: await renewOrders(now).catch((e: unknown) => {
      reportError(e, "cron-ppl-renew");
      return null;
    }),
    redistributed: await redistributeParked(undefined, now).catch(() => null),
  };
  // Bestandskunden-Kampagnen: gedrosselter Versand (Mo–Sa 9–19 Uhr)
  const campaigns = await runCampaigns(now).catch((e: unknown) => {
    reportError(e, "cron-campaigns");
    return null;
  });
  // Nachfass-Abfolgen (WhatsApp Mo–Sa 9–19 Uhr, Anruf-Aufgaben jederzeit)
  const sequences = await runSequences(now).catch((e: unknown) => {
    reportError(e, "cron-sequences");
    return { error: e instanceof Error ? e.message : String(e) };
  });
  // Vertrieb: fehlende Adressen aus dem Impressum nachholen – nach der Antwort,
  // damit der Cron nicht auf langsame Websites wartet (gedrosselt, je Kontakt einmal).
  after(() =>
    enrichPendingAddresses(Number(process.env.ADDRESS_ENRICH_PER_RUN ?? 10)).catch((e: unknown) => reportError(e, "cron-addresses")),
  );
  // WhatsApp selbst verbunden: API-Keys für Channels nachholen, die beim Redirect noch eingerichtet wurden
  const whatsappConnect = await retryPendingSelfConnect(now).catch((e: unknown) => {
    reportError(e, "cron-d360-connect");
    return null;
  });
  const failed = Object.entries({ outreach, responses, reminders, onboarding, sequences })
    .filter(([, r]) => r && typeof r === "object" && "error" in r)
    .map(([k]) => k);
  await beat("cron", failed.length === 0, failed.length ? `Fehler in: ${failed.join(", ")}` : null);
  return Response.json({ ok: true, outreach, responses, reminders, onboarding, pruned, fees, ppl, campaigns, sequences, whatsappConnect });
}

export const GET = handle;
export const POST = handle;
