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
import { expireDiscarded, expireParked, redistributeParked } from "@/lib/ppl/engine";
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
//   7a. Erinnerung vor Ablauf des Abschlussbonus (siehe lib/vertrieb/bonus-erinnerung.ts)
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
  // Mail-Strecke für Leads ohne WhatsApp (lib/mail-strecke): eigener Minuten-Cron /api/mail-strecke/cron; hier als
  // Rückfall, falls dieser noch nicht eingerichtet ist (Ablauf ist idempotent)
  after(() => import("@/lib/mail-strecke/server").then((m) => m.runMailStrecke()).catch((e: unknown) => reportError(e, "cron-mail-strecke")));
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
  // Virenprüfung nachholen (lib/sicherheit/virenpruefung.ts): ungeprüfte Policen und Uploads, sobald ClamAV erreichbar
  // ist (höchstens 20 je Art und Lauf; ohne CLAMAV_HOST nichts)
  if (process.env.CLAMAV_HOST) {
    after(() =>
      Promise.all([
        import("@/lib/policen/server").then((m) => m.pruefeUngepruefteNach()),
        import("@/lib/lead-files").then((m) => m.pruefeUngepruefteLeadFilesNach()),
      ]).catch((e: unknown) => reportError(e, "cron-viren-nachpruefen")),
    );
  }
  // Einmal täglich (03:00–03:05 UTC): Löschfristen (siehe docs/datenschutz.md), Logins, Garantien.
  const now = new Date();
  // Einmalige Bereinigung des Nachfassens nach Status (Ole, 28.11.2026: „Ja“ nach Probelauf 5 Kontakte). Läuft genau
  // einmal, Merker im SystemHeartbeat; sendet nichts, idempotent (lib/lead-phase-server.ts bereinigeNachfassen).
  await import("@/lib/lead-phase-server").then((m) => m.einmalNachfassenBereinigen(now)).catch((e: unknown) => reportError(e, "cron-nachfassen-bereinigen"));
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
          // Nutzungsmessung im Admin (AdminUsageEvent): 180 Tage
          adminNutzung: await import("@/lib/admin-nutzung-server").then((m) => m.pruneAdminNutzung(now)).catch(() => null),
          audit: await pruneAudit(now).catch(() => null),
          // „Kollegen empfehlen“: Angaben von Empfohlenen ohne Abschluss nach 12 Monaten entfernen
          referrals: await import("@/lib/kollegen").then((m) => m.pruneReferrals(now)).catch(() => null),
          // Empfehlungsprämie „Bestandskunden-Modul gratis“: Hinweis 7 Tage vor Ende (AGB)
          bestandFree: await import("@/lib/kollegen").then((m) => m.remindBestandFreeEnd(now)).catch((e: unknown) => {
            reportError(e, "cron-bestand-free");
            return null;
          }),
          transient: await pruneTransient(now).catch(() => null),
          // Leads ohne Abschluss: 24 Monate nach dem letzten Kontakt anonymisieren (lib/lead-loeschfrist.ts)
          leadLoeschfrist: await import("@/lib/lead-loeschfrist").then((m) => m.leadLoeschfrist(now)).catch((e: unknown) => {
            reportError(e, "cron-lead-loeschfrist");
            return null;
          }),
          // Policen per WhatsApp: 30 Tage nach dem Termin ohne Abschluss löschen, offene Einwilligungen nach 24 h (lib/policen)
          policen: await import("@/lib/policen/server").then((m) => m.prunePolicen(now)).catch((e: unknown) => {
            reportError(e, "cron-policen");
            return null;
          }),
          // Policen auslesen: Hinweis vor Ablauf des Schlüssels, „Schlüssel ungültig“ täglich (lib/policen/auslesen)
          policenAuslesen: await import("@/lib/policen/auslesen/server").then((m) => m.auslesenTaeglich(now)).catch((e: unknown) => {
            reportError(e, "cron-policen-auslesen");
            return null;
          }),
          // Löschprotokoll: Löschungen nach einer Wiederherstellung erneut anwenden, Einträge nach 13 Monaten löschen
          loeschprotokoll: await import("@/lib/loeschprotokoll")
            .then(async (m) => ({ ...(await m.wendeLoeschprotokollAn()), offen: undefined, alt: await m.pruneLoeschprotokoll(now) }))
            .catch((e: unknown) => {
              reportError(e, "cron-loeschprotokoll");
              return null;
            }),
          // Vertragsende: Konto ruht, Erinnerungen 30/7 Tage vor der Löschung, endgültige Löschung (lib/ruhend.ts)
          retention: await import("@/lib/ruhend").then((m) => m.runRetentionCron(now)).catch((e: unknown) => {
            reportError(e, "cron-retention");
            return null;
          }),
          // Vorauszahlung (6 oder 12 Monate): Erinnerung 30 Tage vor Ende des Zahlungszeitraums, einmal je Zeitraum
          vorauszahlung: await import("@/lib/vorauszahlung-erinnerung").then((m) => m.remindPrepayEnd(now)).catch((e: unknown) => {
            reportError(e, "cron-vorauszahlung-erinnerung");
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
    // Donnerstags ab 10 Uhr: Erinnerung, wenn für nächste Woche noch nichts bestellt ist (lib/ppl/bestell-erinnerung.ts)
    erinnert: await import("@/lib/ppl/bestell-erinnerung")
      .then((m) => m.bestellErinnerungen(now))
      .catch((e: unknown) => {
        reportError(e, "cron-ppl-bestellerinnerung");
        return null;
      }),
    // Erste Woche zum Starttermin: wartende Bestellungen abbuchen, sobald ihre Startwoche begonnen hat (lib/ppl/erste-woche.ts)
    // einmal je Stunde (nicht bei jedem 5-Minuten-Lauf, wegen der Zahlungsart-Abfrage bei Stripe)
    ersteWoche: now.getUTCMinutes() >= 5 ? null : await import("@/lib/ppl/erste-woche")
      .then((m) => m.faelligeErsteWochenFreigeben(now))
      .catch((e: unknown) => {
        reportError(e, "cron-ppl-erste-woche");
        return null;
      }),
    redistributed: await redistributeParked(undefined, now).catch(() => null),
    // geparkte Leads ab 48 h (PPL_PARK_MAX_HOURS) endgültig verwerfen, Kontaktdaten entfernen (Ole, 20.11.2026)
    expired: await expireParked(now).catch((e: unknown) => {
      reportError(e, "cron-ppl-expire");
      return null;
    }),
    // verworfene Leads (ungültig, Dublette, von Hand verworfen): Kontaktdaten 30 Tage nach Eingang löschen
    // (PPL_DISCARD_DELETE_DAYS, Ole, 20.11.2026)
    discardedErased: await expireDiscarded(now).catch((e: unknown) => {
      reportError(e, "cron-ppl-discard-erase");
      return null;
    }),
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
  // Bestand, Sammelanfrage Einwilligung (Paket 3): gedrosselt werktags 8 bis 18 Uhr, jede Antwort mit Double-Opt-in
  const consentAsks = await import("@/lib/bestand/einwilligung-server").then((m) => m.runConsentRequests(now)).catch((e: unknown) => {
    reportError(e, "cron-bestand-consent-asks");
    return null;
  });
  // Empfehlungen & Bewertungen: Testphase/Abrechnung, Nachfrage nach Abschluss, Bitte um Empfehlung, Dank
  const empfehlungen = await runEmpfehlungen(now).catch((e: unknown) => {
    reportError(e, "cron-empfehlungen");
    return null;
  });
  // „Später melden“ am Kontakt: Tag erreicht → automatische Nachrichten laufen wieder (lib/nachrichtenplan-aktionen.ts)
  const spaeterFortgesetzt = await import("@/lib/nachrichtenplan-aktionen").then((m) => m.pausenBeenden(now)).catch((e: unknown) => {
    reportError(e, "cron-spaeter-melden");
    return null;
  });
  // Nachfass-Abfolgen (WhatsApp Mo–Sa 9–19 Uhr, Anruf-Aufgaben jederzeit)
  const sequences = await runSequences(now).catch((e: unknown) => {
    reportError(e, "cron-sequences");
    return { error: e instanceof Error ? e.message : String(e) };
  });
  // Angebot (Paket P3): Vorab-Check-Push am Vorabend jedes automatischen Nachfassens (lib/angebot-senden-server.ts)
  const angebotVorab = await import("@/lib/angebot-senden-server").then((m) => m.runAngebotVorabCheck(now)).catch((e: unknown) => {
    reportError(e, "cron-angebot-vorab");
    return null;
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
  // „Entscheidet noch jemand mit?“ vor dem Terminvorschlag ohne Antwort: nach 30 Min. trotzdem die Zeiten (Ole, 21.11.2026)
  const partnerVorTermin = await import("@/lib/whatsapp/termin-strecke")
    .then((m) => m.runPartnerVorTerminNachholen(now))
    .catch((e: unknown) => {
      reportError(e, "cron-partner-vor-termin");
      return { error: e instanceof Error ? e.message : String(e) };
    });
  // Buchung über die Buchungsseite mit Chat, Strecke nach 15 Min. nicht begonnen: erste Frage im Chat (Ole, 20.11.2026)
  const buchungsseite = await import("@/lib/whatsapp/termin-strecke")
    .then((m) => m.runBuchungsseiteNachholen(now))
    .catch((e: unknown) => {
      reportError(e, "cron-strecke-buchungsseite");
      return { error: e instanceof Error ? e.message : String(e) };
    });
  // Bestätigung mit Frage nach der Vorbereitung ohne Antwort: einmal nach etwa 3 Std. nachfragen (Ole, 26.11.2026)
  const vorbereitungNachfrage = await import("@/lib/whatsapp/termin-strecke")
    .then((m) => m.runVorbereitungNachfassen(now))
    .catch((e: unknown) => {
      reportError(e, "cron-vorbereitung-nachfrage");
      return { error: e instanceof Error ? e.message : String(e) };
    });
  // Einladung an den Lead ohne Antwort: 30 Min. (kurzfristig 5 Min.), spätestens 60 Min. vor Beginn; ohne Adresse ein
  // Link zum Eintragen per WhatsApp (lib/whatsapp/einladung-rueckfall.ts). Bei 5-Min.-Takt geht „5 Min.“ nach 5 bis 10 Min.
  const einladungen = await import("@/lib/calendar/einladung")
    .then((m) => m.runEinladungNachholen(now))
    .catch((e: unknown) => {
      reportError(e, "cron-einladung");
      return { error: e instanceof Error ? e.message : String(e) };
    });
  // „Konnten Sie den Termin eintragen?“ frühestens 10 Min. nach dem Versand der Einladung (nicht in derselben Minute)
  const kalenderFrage = await import("@/lib/whatsapp/einladung-rueckfall")
    .then((m) => m.runKalenderFrage(now))
    .catch((e: unknown) => {
      reportError(e, "cron-kalender-frage");
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
  // Eigener PKV-Funnel (lib/funnel/server.ts): Ergebnis der Funnel-Leads beim Abnehmer 14 Tage nach Eingang (erreicht,
  // Termin, Abschluss, verkauft und nicht storniert) als Ziele der Funnel-Tests, einmal je Stunde vor der Entscheidung
  const funnelReife =
    now.getUTCMinutes() < 5
      ? await import("@/lib/funnel/server").then((m) => m.funnelReifePruefen(now)).catch((e: unknown) => {
          reportError(e, "cron-funnel-reife");
          return null;
        })
      : undefined;
  // A/B-Tests der Vertriebs-Nachrichten (lib/vertrieb/ab-tests.ts): Ziele (Zahlung, erschienen, Antwort) aus der
  // Datenbank nachtragen, einmal je Stunde vor der Entscheidung
  const vertriebAbZiele =
    now.getUTCMinutes() < 5
      ? await import("@/lib/vertrieb/ab-tests-server").then((m) => m.vertriebZieleNachtragen(now)).catch((e: unknown) => {
          reportError(e, "cron-vertrieb-ab-ziele");
          return null;
        })
      : undefined;
  // Splittests der Lead-Reise (lib/experimente.ts): gleiche Regel, einmal je Stunde
  const experimente =
    now.getUTCMinutes() < 5
      ? await import("@/lib/experimente").then((m) => m.promoteExperimentWinners(now)).catch((e: unknown) => {
          reportError(e, "cron-experimente");
          return null;
        })
      : undefined;
  // Termin ohne Ergebnis: am nächsten Werktag ab 8 Uhr je Termin ein Push „Wie lief der Termin mit …?“ (lib/termin-ergebnis-push.ts);
  // vor der Sammel-Erinnerung, damit angekommene Pushes dort nicht doppelt zählen
  const terminErgebnisPush = await import("@/lib/termin-ergebnis-push").then((m) => m.runTerminErgebnisPush(now)).catch((e: unknown) => {
    reportError(e, "cron-termin-ergebnis-push");
    return null;
  });
  // Lead wartet im Chat seit 30 Min. ohne menschliche Antwort: ein Push an den Inhaber je Wartephase, Mo bis Sa 8 bis
  // 20 Uhr, sonst ab 8 Uhr nachgeholt (lib/antwort-eskalation.ts)
  const antwortEskalation = await import("@/lib/antwort-eskalation").then((m) => m.runAntwortEskalation(now)).catch((e: unknown) => {
    reportError(e, "cron-antwort-eskalation");
    return null;
  });
  // Nächster Schritt: tägliche Erinnerung ab 8 Uhr Berlin an den zuständigen Berater (Sperre je Tag und Login)
  const naechsterSchritt = await import("@/lib/next-step-reminder").then((m) => m.runNextStepReminders(now)).catch((e: unknown) => {
    reportError(e, "cron-next-step-reminder");
    return null;
  });
  // Abschluss erkennen (P4): am Vorabend „Hat Frau Becker abgeschlossen?“ an den zuständigen Berater (18 bis 21 Uhr)
  const abschlussFrage = await import("@/lib/abschluss-server").then((m) => m.runVorabendAbschluss(now)).catch((e: unknown) => {
    reportError(e, "cron-abschluss-vorabend");
    return null;
  });
  // Maklervollmacht per WhatsApp: genau eine Erinnerung 2 Tage nach dem Senden, solange nicht unterschrieben (9 bis 19 Uhr)
  const vollmachtErinnerung = await import("@/lib/maklervollmacht/whatsapp").then((m) => m.runVollmachtErinnerungen(now)).catch((e: unknown) => {
    reportError(e, "cron-vollmacht-erinnerung");
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
    // Wartende Aufgaben nach dem Abschluss rücken nach, sobald die Wiedervorlage frei ist (P7, lib/lead-aufgaben.ts)
    aufgaben: await import("@/lib/lead-aufgaben").then((m) => m.aktiviereAufgaben(now)).catch((e: unknown) => {
      reportError(e, "cron-lead-aufgaben");
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
  // Vertrieb: Erinnerung vor Ablauf des Abschlussbonus für verschickte Angebote (Mail Tag vor Ablauf und letzter Tag,
  // Push an Ole ab 9 Uhr, WhatsApp ab 13 Uhr nur mit „WhatsApp erlaubt“, lib/vertrieb/bonus-erinnerung-server.ts)
  const bonusErinnerung = await import("@/lib/vertrieb/bonus-erinnerung-server")
    .then((m) => m.runBonusErinnerungen(now))
    .catch((e: unknown) => {
      reportError(e, "cron-bonus-erinnerung");
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
        // Eigene Antwort in der Unibox: Aufgabe auf „Nachfassen: Video angesehen?“ in 2 Werktagen umstellen (24.11.2026)
        await (await import("@/lib/vertrieb/instantly-eigene-antwort")).eigeneAntwortenAbgleichen();
        // Früher gekürzt gespeicherte Mails (nur Vorschau) nach und nach vervollständigen (27.11.2026)
        await (await import("@/lib/vertrieb/instantly")).gekuerzteMailsNachladen(15);
      } catch (e) {
        // 429 (gedrosselt) höchstens einmal je Lauf nach Sentry (lib/vertrieb/instantly-drossel.ts)
        (await import("@/lib/vertrieb/instantly-drossel")).meldeInstantlyFehler(e, "cron-instantly");
      }
      // „Nie kontaktieren“: offene bzw. fehlgeschlagene Sperren in Instantly (Blocklist, Kampagnen) wiederholen
      await import("@/lib/vertrieb/nie-kontaktieren-server")
        .then((m) => m.instantlySperrenNachholen())
        .catch(async (e: unknown) => (await import("@/lib/vertrieb/instantly-drossel")).meldeInstantlyFehler(e, "cron-nie-kontaktieren"));
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
  // Buchungsseiten ohne freie Zeiten erkennen (tagsüber, je Kunde höchstens alle 30 Min.; Admin „Heute“ liest nur das
  // gespeicherte „leer seit“, lib/buchungsseite-leer-server.ts)
  after(() => import("@/lib/buchungsseite-leer-server").then((m) => m.pruefeBuchungsseiten(now)).catch((e: unknown) => reportError(e, "cron-buchungsseite-leer")));
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
  // Wochen-Mail „Ihr Team diese Woche“ an Inhaber mit Team (lib/team-woche.ts): montags ab 7 Uhr, je Kunde einmal
  after(() => import("@/lib/team-woche").then((m) => m.runTeamWochenMail(now)).catch((e: unknown) => reportError(e, "cron-team-woche")));
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
  // Mails an die Beleg-Adresse bei Resend abholen (alle 15 Minuten, lib/belege/eingang.ts), auch ohne aktives Webhook-Ereignis
  if (now.getUTCMinutes() % 15 < 5 && process.env.RESEND_API_KEY) {
    after(() => import("@/lib/belege/eingang").then((m) => m.belegePostfachAbholen()).catch((e: unknown) => reportError(e, "cron-belege-postfach")));
    // Hochgeladene, noch nicht ausgelesene Belege (große ZIP-Pakete) nachholen
    after(async () => {
      const { belegeAuslesenOffen } = await import("@/lib/belege/ablage");
      const r = await belegeAuslesenOffen(100);
      if (r.ausgelesen) await (await import("@/lib/belege/server")).belegeAbgleichen();
    });
  }
  // Ausgangsrechnungen aus Stripe als Belege (nachts gegen 3/4 Uhr Berlin, lib/belege/stripe.ts)
  if (now.getUTCHours() === 2 && now.getUTCMinutes() >= 5 && now.getUTCMinutes() < 10 && process.env.STRIPE_SECRET_KEY) {
    after(() => import("@/lib/belege/stripe").then((m) => m.syncStripeBelege()).catch((e: unknown) => reportError(e, "cron-belege-stripe")));
  }
  // Buchhaltung Anfang des Monats (Ole, 23.11.2026: „oft erinnern“): am 1. Meta-Belege holen; am 4. und 6. erneut,
  // solange das Monatspaket des Vormonats nicht gesendet ist. Jeweils 9 Uhr Berlin.
  if ([1, 4, 6].includes(now.getUTCDate()) && now.getUTCHours() === 8 && now.getUTCMinutes() < 5) {
    after(async () => {
      try {
        const m = await import("@/lib/belege/monatspaket");
        const monat = m.vormonat(now);
        const { prisma } = await import("@/lib/prisma");
        const p = await prisma.monatsPaket.findUnique({ where: { monat } });
        if (p?.gesendetAm) return;
        const { sendToAdmins } = await import("@/lib/push");
        const body =
          now.getUTCDate() === 1
            ? `Neuer Monat: bitte die Meta-Belege für ${m.monatName(monat)} holen und hochladen (Links auf der Belege-Seite).`
            : `Monatspaket ${m.monatName(monat)} ist noch nicht beim Steuerbüro. Kurz prüfen und senden.`;
        await sendToAdmins({ title: "Buchhaltung", body, url: "/admin/neu/zahlen/kosten/belege" });
      } catch (e) {
        reportError(e, "cron-buchhaltung-erinnerung");
      }
    });
  }
  // Monatspaket für das Steuerbüro: am 2. um 9 Uhr Berlin Push an die Admins (lib/belege/monatspaket.ts), gesendet wird nur per Klick
  if (now.getUTCDate() === 2 && now.getUTCHours() === 8 && now.getUTCMinutes() < 5) {
    after(async () => {
      try {
        const m = await import("@/lib/belege/monatspaket");
        const monat = m.vormonat(now);
        const { prisma } = await import("@/lib/prisma");
        const p = await prisma.monatsPaket.findUnique({ where: { monat } });
        if (p?.gesendetAm || p?.erinnertAm) return;
        const liste = await m.paketBelege(monat);
        await prisma.monatsPaket.upsert({ where: { monat }, create: { monat, erinnertAm: now, anzahl: liste.length }, update: { erinnertAm: now, anzahl: liste.length } });
        const { sendToAdmins } = await import("@/lib/push");
        await sendToAdmins({ title: `Monatspaket ${m.monatName(monat)} bereit`, body: `${liste.length} Belege. Kurz prüfen und an das Steuerbüro senden.`, url: "/admin/neu/zahlen/kosten/belege" });
      } catch (e) {
        reportError(e, "cron-monatspaket");
      }
    });
  }
  // Belege aus GetMyInvoices holen und Kontoumsätzen zuordnen: einmal nachts gegen 3/4 Uhr Berlin (lib/belege/server.ts)
  if (now.getUTCHours() === 2 && now.getUTCMinutes() < 5 && process.env.GETMYINVOICES_API_KEY) {
    after(() =>
      import("@/lib/belege/server")
        .then((m) => m.syncBelege())
        .then((r) => console.log(`[belege] ${r.geholt} geholt, ${r.neu} neu, ${r.zugeordnet} zugeordnet`))
        .catch((e: unknown) => reportError(e, "cron-belege")),
    );
  }
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
  // Unternehmensverifizierung bei Meta je Nummer nachziehen (lib/whatsapp/meta-verifizierung.ts, gedrosselt), vor dem
  // Flow-Abgleich: neu verifiziert hebt die Sperre des Policen-Flows sofort auf
  const metaVerifizierung = await import("@/lib/whatsapp/meta-verifizierung")
    .then((m) => m.syncMetaVerifizierung(now))
    .catch((e: unknown) => {
      reportError(e, "cron-meta-verifizierung");
      return null;
    });
  // Policen-Strecke v2 (nur mit POLICEN_FLOW=1): Flow „Policen senden“ je Kunde anlegen/veröffentlichen, Vorlagen mit
  // Flow-Knopf einreichen und Status nachziehen (lib/policen/flow/server.ts, gedrosselt; ohne Schalter nichts)
  const policenFlows = await import("@/lib/policen/flow/server")
    .then((m) => m.syncPolicenFlows(now))
    .catch((e: unknown) => {
      reportError(e, "cron-policen-flow");
      return null;
    });
  // Sicherheitsnetz „Assistent stumm“ (lib/whatsapp/bot-stumm.ts): Rückfall zum Minuten-Cron der Mail-Strecke
  const botStumm = await import("@/lib/whatsapp/bot-stumm")
    .then((m) => m.runBotStumm(now))
    .catch((e: unknown) => {
      reportError(e, "cron-bot-stumm");
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
  return Response.json({ ok: true, outreach, responses, reminders, soonReminders, startReminders, terminBeginn, onboarding, pruned, fees, ppl, campaigns, consentAsks, empfehlungen, spaeterFortgesetzt, sequences, angebotVorab, anrufAusloeser, strecke, partnerVorTermin, buchungsseite, vorbereitungNachfrage, einladungen, kalenderFrage, policenErinnerung, abTests, funnelReife, vertriebAbZiele, experimente, naechsterSchritt, terminErgebnisPush, antwortEskalation, abschlussFrage, vollmachtErinnerung, telefonate, vertraege, terminNachfragen, vertriebErinnerungen, zahlungserinnerung, bonusErinnerung, mahnwesen, whatsappConnect, templates, metaVerifizierung, policenFlows, botStumm, supportTemplates, status });
}

export const GET = handle;
export const POST = handle;
