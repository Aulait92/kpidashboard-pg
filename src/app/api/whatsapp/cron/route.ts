import { isCronAuthorized } from "@/lib/cron-auth";
import { after as nextAfter } from "next/server";
import { checkAppointmentResponses } from "@/lib/calendar";
import { runOutreach } from "@/lib/whatsapp/outreach";
import { runReminders, runSoonReminders, runStartReminders } from "@/lib/whatsapp/reminders";
import { pruneUsage } from "@/lib/usage";
import { pruneAudit } from "@/lib/audit";
import { pruneTransient } from "@/lib/erasure";
import { berlinMonth, chargeWhatsAppFees, feeChargeDue } from "@/lib/whatsapp/fees";
import { expireBestandCancellations, reconcileSeatBilling } from "@/lib/billing";
import { processDueBudgetFees } from "@/lib/budget";
import { renewOrders } from "@/lib/ppl/orders";
import { redistributeParked } from "@/lib/ppl/engine";
import { hvkCronDue } from "@/lib/ppl/hvk-abrechnung";
import { runCampaigns } from "@/lib/bestand/campaigns";
import { runEmpfehlungen } from "@/lib/empfehlung/requests";
import { runSequences } from "@/lib/lead-sequences";
import { reportError } from "@/lib/monitoring";
import { runOnboardingCron } from "@/lib/onboarding-cron";
import { beat } from "@/lib/heartbeat";
import { recordStatusSample } from "@/lib/status-server";
import { runGarantien } from "@/lib/garantien-server";
import { enrichPendingContacts } from "@/lib/vertrieb/contact-enrich";
import { createMeetingReviews } from "@/lib/vertrieb/termin-review";
import { runBankSync } from "@/lib/bank/server";
import { retryPendingSelfConnect } from "@/lib/whatsapp/self-connect";
import { syncTemplates } from "@/lib/whatsapp/template-submit";

// Zentraler Cron (z. B. cron-job.org alle 5 Minuten):
//   1. Erstanschreiben neuer Leads ohne Termin
//   2. Termin-Erinnerungen: Vortag, 1 Std. und 15 Min. vorher (lib/showup.ts)
//   3. Onboarding-Automatik (siehe lib/onboarding-cron.ts)
//   4. Nachfass-Abfolgen (siehe lib/lead-sequences.ts)
//   5. Erinnerung „Leads ohne nächsten Schritt“ um 8 Uhr (siehe lib/next-step-reminder.ts)
//   6. Rückmeldung an Meta (Conversions API für CRM) alle 15 Minuten (siehe lib/capi/server.ts)
//   7. Zahlungserinnerung für angenommene, unbezahlte Angebote (siehe lib/angebot-zahlungserinnerung.ts)
//   8. Mahnwesen für offene Rechnungen (nur mit MAHNWESEN=on, lib/mahnwesen-server.ts)
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
  // Hintergrundaufgaben sammeln und als EINE after()-Aufgabe ausführen (Ole, 17.11.2026): Jedes after() hängt einen
  // „close“-Listener an die Antwort; ab 11 meldete Node bei jedem Lauf „MaxListenersExceededWarning“ (Logs).
  const nachher: (() => unknown)[] = [];
  const after = (fn: () => unknown) => {
    nachher.push(fn);
  };
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
  // Etwa 1 Std. vor dem Termin: „Gleich ist es so weit, passt alles?“
  const soonReminders = await runSoonReminders().catch((e: unknown) => {
    reportError(e, "cron-soon-reminders");
    return { error: e instanceof Error ? e.message : String(e) };
  });
  // 15 Min. vor einem Videotermin: Link zum Videoraum (Show-up-Paket, lib/showup.ts)
  const startReminders = await runStartReminders().catch((e: unknown) => {
    reportError(e, "cron-start-reminders");
    return { error: e instanceof Error ? e.message : String(e) };
  });
  // Terminbeginn: Push „Ist … da?“ an den Vermittler, nach „Fehlt noch“ die Rückfrage nach dem Termin (lib/showup-server.ts)
  const terminBeginn = await import("@/lib/showup-server").then((m) => m.runTerminBeginn()).catch((e: unknown) => {
    reportError(e, "cron-termin-beginn");
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
  // Budget ändern: neues Tagesbudget am Stichtag bei Meta umstellen (sonst Aufgabe)
  await import("@/lib/kampagnen/budget-sync").then((m) => m.processDueMetaBudgets(now)).catch((e: unknown) => reportError(e, "cron-budget-meta"));
  // Öffentliche App-Demo: Beispieldaten nachts neu (nur eigene Demo-Datenbank, lib/app-demo/seed.ts)
  if (now.getUTCHours() === 2 && now.getUTCMinutes() < 5 && process.env.APP_DEMO_DATABASE_URL) {
    after(() => import("@/lib/app-demo/seed").then((m) => m.appDemoNeuAnlegenEinmal(now)).catch((e: unknown) => reportError(e, "cron-app-demo")));
  }
  const pruned =
    now.getUTCHours() === 3 && now.getUTCMinutes() < 5
      ? {
          usage: await pruneUsage().catch(() => null),
          audit: await pruneAudit(now).catch(() => null),
          // „Kollegen empfehlen“: Angaben von Empfohlenen ohne Abschluss nach 12 Monaten entfernen
          referrals: await import("@/lib/kollegen").then((m) => m.pruneReferrals(now)).catch(() => null),
          // Empfehlungsprämie „Bestandskunden-Modul gratis“: Hinweis 7 Tage vor Ende (AGB)
          bestandFree: await import("@/lib/kollegen").then((m) => m.remindBestandFreeEnd(now)).catch((e: unknown) => {
            reportError(e, "cron-bestand-free");
            return null;
          }),
          transient: await pruneTransient(now).catch(() => null),
          // Policen per WhatsApp: 30 Tage nach dem Termin ohne Abschluss löschen, offene Einwilligungen nach 24 h (lib/policen)
          policen: await import("@/lib/policen/server").then((m) => m.prunePolicen(now)).catch((e: unknown) => {
            reportError(e, "cron-policen");
            return null;
          }),
          // Vertragsende: Konto ruht, Erinnerungen 30/7 Tage vor der Löschung, endgültige Löschung (lib/ruhend.ts)
          retention: await import("@/lib/ruhend").then((m) => m.runRetentionCron(now)).catch((e: unknown) => {
            reportError(e, "cron-retention");
            return null;
          }),
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
  // HvK-Abrechnung: Mail „Neue Gutschrift“ (PDF) Mo–Mi stündlich 7–20 Uhr abrufen, nur lesen, je Rechnung einmal
  // (nach der Antwort, lib/ppl/hvk-abrechnung-server.ts)
  if (hvkCronDue(now)) {
    after(() => import("@/lib/ppl/hvk-abrechnung-server").then((m) => m.runHvkCron(now)).catch((e: unknown) => reportError(e, "cron-hvk-abrechnung")));
  }
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
  // Lead antwortet 30 Min. nach dem Erstanschreiben nicht: Anrufplan starten, Push an den Vermittler (lib/anruf-ausloeser.ts)
  const anrufAusloeser = await import("@/lib/anruf-ausloeser-server").then((m) => m.runAntwortAusloeser(now)).catch((e: unknown) => {
    reportError(e, "cron-anruf-ausloeser");
    return null;
  });
  // Termin-Strecke nach der Buchung: Komplettcheck bzw. Vertragsfrage ohne Antwort → nach 1 Std. trotzdem abschließen
  const strecke = await import("@/lib/whatsapp/termin-strecke")
    .then((m) => m.runStreckeAbschliessen(now))
    .catch((e: unknown) => {
      reportError(e, "cron-strecke");
      return { error: e instanceof Error ? e.message : String(e) };
    });
  // Einladung an den Lead ohne Antwort: 15 Min. (kurzfristig 5 Min.), spätestens 60 Min. vor Beginn (lib/calendar/einladung.ts)
  const einladungen = await import("@/lib/calendar/einladung")
    .then((m) => m.runEinladungNachholen(now))
    .catch((e: unknown) => {
      reportError(e, "cron-einladung");
      return { error: e instanceof Error ? e.message : String(e) };
    });
  // Policen-Erinnerung 24 Std. nach der Buchung (nur bei mehr als 2 Tagen bis zum Termin)
  const policenErinnerung = await import("@/lib/whatsapp/termin-strecke")
    .then((m) => m.runPolicenErinnerung(now))
    .catch((e: unknown) => {
      reportError(e, "cron-policen-erinnerung");
      return { error: e instanceof Error ? e.message : String(e) };
    });
  // A/B-Tests der Vorlagen: einmal je Stunde prüfen, ob eine Fassung genug Vorsprung hat (lib/whatsapp/ab-test.ts)
  const abTests =
    now.getUTCMinutes() < 5
      ? await import("@/lib/whatsapp/ab-test").then((m) => m.promoteAbWinners(now)).catch((e: unknown) => {
          reportError(e, "cron-ab-test");
          return null;
        })
      : undefined;
  // Nächster Schritt: tägliche Erinnerung ab 8 Uhr Berlin an den zuständigen Berater (Sperre je Tag und Login)
  const naechsterSchritt = await import("@/lib/next-step-reminder").then((m) => m.runNextStepReminders(now)).catch((e: unknown) => {
    reportError(e, "cron-next-step-reminder");
    return null;
  });
  // Telefonate (lib/telefonat-server.ts): Push „Was ist bei … rausgekommen?“ 15 Min. nach „Anrufen“ ohne Ergebnis;
  // nach dem Telefonat fragt der Assistent die offenen Punkte ab (mit Termin, im 24h-Fenster)
  const telefonate = {
    erinnerungen: await import("@/lib/telefonat-server").then((m) => m.runAnrufErinnerungen(now)).catch((e: unknown) => {
      reportError(e, "cron-anruf-erinnerung");
      return null;
    }),
    offeneFragen: await import("@/lib/telefonat-server").then((m) => m.runOffeneFragen(now)).catch((e: unknown) => {
      reportError(e, "cron-offene-fragen");
      return null;
    }),
  };
  // Cross-Selling: „Weiteres Produkt anbieten?“ 3 Wochen nach dem Abschluss, Abschlüsse in den Bestand,
  // vorher die Kontrolle „Police da?“ nach 2 Wochen
  const vertraege = {
    // „Police da und erste Zahlung erfolgt?“ 2 Wochen nach dem Abschluss (abschaltbar, einmal je Lead)
    police: await import("@/lib/vertraege").then((m) => m.runPoliceReminders(now)).catch((e: unknown) => {
      reportError(e, "cron-police");
      return null;
    }),
    crossSell: await import("@/lib/vertraege").then((m) => m.runCrossSellReminders(now)).catch((e: unknown) => {
      reportError(e, "cron-cross-sell");
      return null;
    }),
    bestand: await import("@/lib/vertraege").then((m) => m.syncPendingBestand(100)).catch((e: unknown) => {
      reportError(e, "cron-vertraege-bestand");
      return null;
    }),
  };
  // Vertrieb: nach jedem Termin Aufgabe „Wie lief der Termin?“ + Push
  const terminNachfragen = await createMeetingReviews(now).catch((e: unknown) => {
    reportError(e, "cron-termin-review");
    return null;
  });
  // Vertrieb: Zahlungserinnerung für angenommene, unbezahlte Angebote (E-Mail + WhatsApp Support-Nummer, 9 bis 19 Uhr),
  // Aufgabe „Zahlung offen“, Push nach 7 Tagen (lib/angebot-zahlungserinnerung-server.ts)
  const zahlungserinnerung = await import("@/lib/angebot-zahlungserinnerung-server")
    .then((m) => m.runZahlungserinnerungen(now))
    .catch((e: unknown) => {
      reportError(e, "cron-zahlungserinnerung");
      return null;
    });
  // Mahnwesen (nur mit MAHNWESEN=on): stündlich Stripe- und Bankabgleich, dann Erinnerung, Mahnungen, Anruf-Aufgabe
  // (9 bis 19 Uhr, lib/mahnwesen-server.ts)
  const mahnwesen = await import("@/lib/mahnwesen-server")
    .then((m) => m.runMahnlauf(now))
    .catch((e: unknown) => {
      reportError(e, "cron-mahnwesen");
      return null;
    });
  // Vertrieb: Kontakte anreichern (Website + Google Places) – nach der Antwort,
  // damit der Cron nicht auf langsame Websites wartet (gedrosselt, je Kontakt einmal).
  after(() =>
    enrichPendingContacts(Number(process.env.ADDRESS_ENRICH_PER_RUN ?? 20)).catch((e: unknown) => reportError(e, "cron-addresses")),
  );
  // Vertrieb: eigene Buchungsseite /termin, Erinnerungen 24 h und 1 h vorher (E-Mail und WhatsApp)
  const vertriebErinnerungen = await import("@/lib/vertrieb/buchung")
    .then((m) => m.runSalesBookingReminders(now))
    .catch((e: unknown) => {
      reportError(e, "cron-vertrieb-erinnerungen");
      return null;
    });
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
  // Calendly: stündlich die Termine abgleichen (Sicherheitsnetz, falls ein Webhook nicht ankommt; Ole 16.11.2026:
  // Termin von Christoph Patzwald fehlte im CRM). Nur Abgleich, keine WhatsApp-Bestätigung für nachgeholte Termine.
  if (process.env.CALENDLY_TOKEN && now.getUTCMinutes() < 5) {
    after(() =>
      import("@/lib/vertrieb/calendly").then((m) =>
        // Drei Tage zurück reichen als Sicherheitsnetz (Webhooks kommen live); gedrosselt → nächste Stunde
        m.syncCalendly({ sinceDays: 3 }).catch((e: unknown) =>
          e instanceof m.CalendlyRateLimitError ? console.warn(`[cron-calendly] ${e.message}, nächster Versuch in einer Stunde`) : reportError(e, "cron-calendly"),
        ),
      ).catch((e: unknown) => reportError(e, "cron-calendly")),
    );
  }
  // Vertrieb: Später-Follow-ups (Antwort im Instantly-Thread, werktags 8–17 Uhr, je Postfach begrenzt;
  // gesendet wird nur mit INSTANTLY_AUTO_SYNC=1, siehe docs/vertrieb-spaeter-followup.md)
  after(() => import("@/lib/vertrieb/followup").then((m) => m.runFollowups(now)).catch((e: unknown) => reportError(e, "cron-followups")));
  // Kampagnen-Agenten: liegengebliebene Läufe fortsetzen (z. B. nach Neustart)
  after(async () => {
    try {
      const { resumeCampaignRuns } = await import("@/lib/kampagnen/run");
      await resumeCampaignRuns();
      // Automatik: gewünschte Läufe starten (Produkt gebucht), Kampagnen auf müde Anzeigen prüfen
      const { processCampaignWishes } = await import("@/lib/kampagnen/launch");
      await processCampaignWishes(now);
      const { runCreativeRefresh } = await import("@/lib/kampagnen/refresh");
      await runCreativeRefresh(now);
    } catch (e) {
      reportError(e, "cron-kampagnen");
    }
  });
  // Optimierung je Werbekonto: Freigegebenes ausführen, wöchentlich planen (wenige Konten je Lauf),
  // Meta-Änderungsprotokoll holen, ab dem 20. Frühwarnung (nach der Antwort, lib/optimierung)
  after(() => import("@/lib/optimierung/server").then((m) => m.runOptimizationCron(now)).catch((e: unknown) => reportError(e, "cron-optimierung")));
  // Rückmeldung an Meta (Conversions API für CRM): alle 15 Minuten neue Stufen der Meta-Leads erkennen und
  // senden (nach der Antwort, lib/capi/server.ts)
  if (now.getUTCMinutes() % 15 < 5) {
    after(() => import("@/lib/capi/server").then((m) => m.runCapi(now)).catch((e: unknown) => reportError(e, "cron-capi")));
  }
  // Monatsberichte: ab dem 2. (bis 5., falls ein Lauf ausfällt) ab 7 Uhr, je Lauf wenige Kunden
  // (Claude-Aufrufe), idempotent je Kunde und Monat. Nur „gut“ kann automatisch raus.
  {
    const berlin = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", day: "numeric", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
    const day = Number(berlin.find((p) => p.type === "day")?.value);
    const hour = Number(berlin.find((p) => p.type === "hour")?.value);
    if (day >= 2 && day <= 5 && hour >= 7 && process.env.ANTHROPIC_API_KEY) {
      after(() => import("@/lib/monatsbericht/server").then((m) => m.runMonthlyReports(now, { limit: 3 })).catch((e: unknown) => reportError(e, "cron-monatsbericht")));
    }
  }
  // Meta-Kosten je Anzeige und Tag (lib/anzeige-kosten.ts): einmal täglich gegen 5/6 Uhr Berlin die letzten 7 Tage,
  // beim ersten Lauf je Werbekonto bis 90 Tage zurück, nie vor dem Startdatum des Kunden (nach der Antwort)
  if (now.getUTCHours() === 4 && now.getUTCMinutes() < 5) {
    after(() =>
      import("@/lib/anzeige-kosten")
        .then((m) => m.syncAnzeigeKosten({ now }))
        .then((r) => console.log(`[anzeige-kosten] ${r.übersprungen ?? `${r.gespeichert} Zeilen, ${r.konten.length} Konten, ${r.fehler} Fehler`}`))
        .catch((e: unknown) => reportError(e, "cron-anzeige-kosten")),
    );
  }
  // LinkedIn: geplante Posts veröffentlichen, Zahlen holen, abends Entwürfe schreiben (nach der Antwort)
  after(() => import("@/lib/linkedin/cron").then((m) => m.runLinkedIn(now)).catch((e: unknown) => reportError(e, "cron-linkedin")));
  // Bank & Karten: Kontoumsätze täglich abrufen, an Neuverbindung erinnern (nach der Antwort)
  after(() => runBankSync(now).catch((e: unknown) => reportError(e, "cron-bank")));
  // WhatsApp selbst verbunden: API-Keys für Channels nachholen, die beim Redirect noch eingerichtet wurden
  // 360dialog: Nummern ohne Rücksprung über die Kunden-ID finden (alle 15 Minuten, lib/whatsapp/dialog360-match.ts)
  if (now.getUTCMinutes() % 15 < 5) {
    await import("@/lib/whatsapp/dialog360-match").then((m) => m.autoMatchChannels()).catch((e: unknown) => reportError(e, "cron-d360-auto-match"));
  }
  const whatsappConnect = await retryPendingSelfConnect(now).catch((e: unknown) => {
    reportError(e, "cron-d360-connect");
    return null;
  });
  const failed = Object.entries({ outreach, responses, reminders, soonReminders, startReminders, onboarding, sequences })
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
  // Support-Nummer: Vorlage für die Terminbestätigung im Vertrieb einreichen bzw. Freigabe nachziehen
  const supportTemplates = await import("@/lib/vertrieb/termin-whatsapp")
    .then((m) => m.syncSupportTemplates(now))
    .catch((e: unknown) => {
      reportError(e, "cron-support-templates");
      return null;
    });
  if (nachher.length) nextAfter(() => Promise.allSettled(nachher.map(async (fn) => fn())));
  return Response.json({ ok: true, outreach, responses, reminders, soonReminders, startReminders, terminBeginn, onboarding, pruned, fees, ppl, campaigns, empfehlungen, sequences, anrufAusloeser, strecke, einladungen, policenErinnerung, abTests, naechsterSchritt, telefonate, vertraege, terminNachfragen, vertriebErinnerungen, zahlungserinnerung, mahnwesen, whatsappConnect, templates, supportTemplates, status });
}

export const GET = handle;
export const POST = handle;
