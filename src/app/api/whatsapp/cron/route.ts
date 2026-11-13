import { isCronAuthorized } from "@/lib/cron-auth";
import { after } from "next/server";
import { checkAppointmentResponses } from "@/lib/calendar";
import { runOutreach } from "@/lib/whatsapp/outreach";
import { runReminders } from "@/lib/whatsapp/reminders";
import { pruneUsage } from "@/lib/usage";
import { pruneAudit } from "@/lib/audit";
import { pruneTransient } from "@/lib/erasure";
import { berlinMonth, chargeWhatsAppFees, feeChargeDue } from "@/lib/whatsapp/fees";
import { expireBestandCancellations, reconcileSeatBilling } from "@/lib/billing";
import { processDueBudgetFees } from "@/lib/budget";
import { renewOrders } from "@/lib/ppl/orders";
import { redistributeParked } from "@/lib/ppl/engine";
import { runCampaigns } from "@/lib/bestand/campaigns";
import { runEmpfehlungen } from "@/lib/empfehlung/requests";
import { runSequences } from "@/lib/lead-sequences";
import { reportError } from "@/lib/monitoring";
import { runOnboardingCron } from "@/lib/onboarding-cron";
import { beat } from "@/lib/heartbeat";
import { recordStatusSample } from "@/lib/status-server";
import { runGarantien } from "@/lib/garantien-server";
import { enrichPendingContacts } from "@/lib/vertrieb/contact-enrich";
import { runBankSync } from "@/lib/bank/server";
import { retryPendingSelfConnect } from "@/lib/whatsapp/self-connect";
import { syncTemplates } from "@/lib/whatsapp/template-submit";

// Zentraler Cron (z. B. cron-job.org alle 5 Minuten):
//   1. Erstanschreiben neuer Leads ohne Termin
//   2. Termin-Erinnerungen ~24 h vorher
//   3. Onboarding-Automatik (siehe lib/onboarding-cron.ts)
//   4. Nachfass-Abfolgen (siehe lib/lead-sequences.ts)
// Per WHATSAPP_WEBHOOK_SECRET gesichert: Header „Authorization: Bearer …“ oder
// x-cron-token (x-webhook-secret und ?token= nur noch im Übergang, lib/cron-auth.ts).
export const dynamic = "force-dynamic";

const LABEL = "whatsapp-cron";
function authorized(req: Request): boolean {
  return isCronAuthorized(req, process.env.WHATSAPP_WEBHOOK_SECRET, { label: LABEL, legacyHeaders: ["x-webhook-secret"] });
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
  // Budget ändern: Preisstufe ins Abo übernehmen, sobald ein geplantes Budget gilt
  await processDueBudgetFees(now).catch((e: unknown) => reportError(e, "cron-budget-fee"));
  const pruned =
    now.getUTCHours() === 3 && now.getUTCMinutes() < 5
      ? {
          usage: await pruneUsage().catch(() => null),
          audit: await pruneAudit(now).catch(() => null),
          // „Kollegen empfehlen“: Angaben von Empfohlenen ohne Abschluss nach 12 Monaten entfernen
          referrals: await import("@/lib/kollegen").then((m) => m.pruneReferrals(now)).catch(() => null),
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
  // Empfehlungen & Bewertungen: Testphase/Abrechnung, Nachfrage nach Abschluss, Bitte um Empfehlung, Dank
  const empfehlungen = await runEmpfehlungen(now).catch((e: unknown) => {
    reportError(e, "cron-empfehlungen");
    return null;
  });
  // Nachfass-Abfolgen (WhatsApp Mo–Sa 9–19 Uhr, Anruf-Aufgaben jederzeit)
  const sequences = await runSequences(now).catch((e: unknown) => {
    reportError(e, "cron-sequences");
    return { error: e instanceof Error ? e.message : String(e) };
  });
  // Vertrieb: Kontakte anreichern (Website + Google Places) – nach der Antwort,
  // damit der Cron nicht auf langsame Websites wartet (gedrosselt, je Kontakt einmal).
  after(() =>
    enrichPendingContacts(Number(process.env.ADDRESS_ENRICH_PER_RUN ?? 20)).catch((e: unknown) => reportError(e, "cron-addresses")),
  );
  // Instantly: Antworten alle 15 Minuten nachholen (Sicherheitsnetz, falls der Webhook nicht
  // ankommt, z. B. falsche URL). Nur wo INSTANTLY_AUTO_SYNC=1 gesetzt ist (Produktion).
  if (process.env.INSTANTLY_AUTO_SYNC === "1" && process.env.INSTANTLY_API_KEY && now.getUTCMinutes() % 15 < 5) {
    after(async () => {
      try {
        const { ensureInterestTasks, syncReplies } = await import("@/lib/vertrieb/instantly");
        await syncReplies(false);
        await ensureInterestTasks();
      } catch (e) {
        reportError(e, "cron-instantly");
      }
    });
  }
  // Kampagnen-Agenten: liegengebliebene Läufe fortsetzen (z. B. nach Neustart)
  after(async () => {
    try {
      const { resumeCampaignRuns } = await import("@/lib/kampagnen/run");
      await resumeCampaignRuns();
    } catch (e) {
      reportError(e, "cron-kampagnen");
    }
  });
  // Bank & Karten: Kontoumsätze täglich abrufen, an Neuverbindung erinnern (nach der Antwort)
  after(() => runBankSync(now).catch((e: unknown) => reportError(e, "cron-bank")));
  // WhatsApp selbst verbunden: API-Keys für Channels nachholen, die beim Redirect noch eingerichtet wurden
  const whatsappConnect = await retryPendingSelfConnect(now).catch((e: unknown) => {
    reportError(e, "cron-d360-connect");
    return null;
  });
  const failed = Object.entries({ outreach, responses, reminders, onboarding, sequences })
    .filter(([, r]) => r && typeof r === "object" && "error" in r)
    .map(([k]) => k);
  await beat("cron", failed.length === 0, failed.length ? `Fehler in: ${failed.join(", ")}` : null);
  // Statusseite: Messpunkt je Lauf (alle 5 Min.), Aufbewahrung 90 Tage
  const status = await recordStatusSample(now).catch((e: unknown) => {
    reportError(e, "cron-status-sample");
    return null;
  });
  // WhatsApp-Vorlagen: fehlende einreichen, Freigabestatus von Meta nachziehen (gedrosselt).
  const templates = await syncTemplates(now).catch((e: unknown) => {
    reportError(e, "cron-templates");
    return null;
  });
  return Response.json({ ok: true, outreach, responses, reminders, onboarding, pruned, fees, ppl, campaigns, empfehlungen, sequences, whatsappConnect, templates, status });
}

export const GET = handle;
export const POST = handle;
