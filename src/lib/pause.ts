// Pause / Urlaub: vom Kunden selbst (Kundenbereich → Konto) oder vom Admin
// geplant. Am Starttag: Meta-Kampagnen pausieren, Abrechnung auf die
// Software-Gebühr reduzieren, Kunden-Pipeline „Pausiert“. Am Endtag (oder
// per Klick): alles zurück. Die Automatik läuft im zentralen Cron.

import { prisma } from "@/lib/prisma";
import { pauseBilling, resumeBilling, IntroPhaseError, type BillingPauseState } from "@/lib/billing";
import { pauseActiveCampaigns, resumeCampaigns } from "@/lib/meta-ads";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { customerGreeting, logOfferActivity, setContactCustomerStage } from "@/lib/offer-links";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";

const TZ = "Europe/Berlin";
const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/** YYYY-MM-DD → Zeitpunkt 00:05 deutscher Zeit (Start) bzw. Tagesbeginn. */
export function berlinDayStart(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 5);
  const offsetMin = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" })
      .formatToParts(new Date(guess))
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || 0,
  ) * 60;
  return new Date(guess - offsetMin * 60 * 1000);
}

export function todayBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
}

async function context(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      plan: true,
      stripeCustomerId: true,
      metaAdAccountId: true,
      retainerStart: true,
      salesContact: { select: { id: true } },
      onboarding: { select: { offerId: true, salesContactId: true } },
      users: { where: { role: "BUYER" }, select: { email: true } },
    },
  });
  if (!customer) throw new Error("Kunde nicht gefunden.");
  const offer = customer.onboarding?.offerId
    ? await prisma.offer.findUnique({ where: { id: customer.onboarding.offerId }, select: { softwareFee: true, contactName: true } })
    : null;
  const contactId = customer.salesContact?.id ?? customer.onboarding?.salesContactId ?? null;
  return { customer, offer, contactId, softwareFee: Number(offer?.softwareFee ?? (customer.plan === "service" ? 0 : 349)) };
}

export type PauseResult = { ok: true } | { ok: false; error: string };

export async function planPause(
  customerId: string,
  input: { from: string; until: string | null; reason?: string | null },
  by: "customer" | "admin",
): Promise<PauseResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from)) return { ok: false, error: "Bitte ein Startdatum wählen." };
  if (!input.until || !/^\d{4}-\d{2}-\d{2}$/.test(input.until)) return { ok: false, error: "Bitte ein Neustart-Datum wählen." };
  if (input.from < todayBerlin()) return { ok: false, error: "Die Pause kann frühestens heute beginnen." };
  if (input.until && input.until <= input.from) return { ok: false, error: "Das Ende muss nach dem Start liegen." };
  const open = await prisma.customerPause.findFirst({ where: { customerId, status: { in: ["planned", "active"] } } });
  if (open) return { ok: false, error: "Es ist bereits eine Pause geplant oder aktiv." };
  const { customer } = await context(customerId);
  const startsAt = berlinDayStart(input.from);
  // Nach Kalendertag vergleichen: Start „heute“ ist erlaubt, auch wenn das Abo erst heute Mittag begann.
  const startYmd = customer.retainerStart ? new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(customer.retainerStart) : null;
  if (startYmd && input.from < startYmd) {
    return { ok: false, error: `Eine Pause ist erst ab Vertragsstart (${fmt(customer.retainerStart!)}) möglich.` };
  }
  const pause = await prisma.customerPause.create({
    data: {
      customerId,
      startsAt,
      endsAt: input.until ? berlinDayStart(input.until) : null,
      reason: input.reason?.trim().slice(0, 300) || null,
      createdBy: by,
    },
  });
  if (startsAt.getTime() <= Date.now()) {
    await applyPause(pause.id);
  } else {
    await notifyPlanned(pause.id);
  }
  return { ok: true };
}

async function notifyPlanned(pauseId: string) {
  const p = await prisma.customerPause.findUnique({ where: { id: pauseId } });
  if (!p) return;
  const { customer, contactId } = await context(p.customerId);
  await sendToAdmins({
    title: `🏖️ Pause geplant: ${customer.name}`,
    body: `${fmt(p.startsAt)}${p.endsAt ? ` bis ${fmt(p.endsAt)}` : " (offen)"}`,
    url: contactId ? `/admin/vertrieb/kontakte/${contactId}` : "/admin/vertrieb/kunden",
  }).catch(() => {});
  if (contactId) {
    await logOfferActivity({ dealId: null, salesContactId: contactId }, `Pause geplant: ${fmt(p.startsAt)}${p.endsAt ? ` bis ${fmt(p.endsAt)}` : " (offen)"}`, p.reason);
  }
}

/** Pause jetzt umsetzen (Anzeigen + Abrechnung). Fehler landen als Aufgabe beim Admin. */
export async function applyPause(pauseId: string): Promise<void> {
  const claimed = await prisma.customerPause.updateMany({ where: { id: pauseId, status: "planned" }, data: { status: "active", appliedAt: new Date() } });
  if (claimed.count === 0) return;
  const p = (await prisma.customerPause.findUnique({ where: { id: pauseId } }))!;
  const { customer, offer, contactId, softwareFee } = await context(p.customerId);
  const problems: string[] = [];

  // 1) Anzeigen stoppen
  let campaignIds: string[] = [];
  let adsNote = "";
  if (customer.metaAdAccountId) {
    try {
      campaignIds = await pauseActiveCampaigns(customer.metaAdAccountId);
      adsNote = `${campaignIds.length} Kampagne(n) pausiert`;
    } catch (err) {
      reportError(err, "pause-ads", { customer: customer.id });
      adsNote = "Automatisches Pausieren fehlgeschlagen";
      problems.push("Kampagnen im Werbekonto von Hand pausieren");
    }
  } else {
    adsNote = "Kein Werbekonto hinterlegt";
    problems.push("Kampagnen von Hand pausieren (kein Werbekonto hinterlegt)");
  }

  // 2) Abrechnung
  let billing: BillingPauseState = { method: "none", reason: "Kein Stripe-Kunde" };
  if (customer.stripeCustomerId) {
    try {
      billing = await pauseBilling(customer.stripeCustomerId);
      if (billing.method === "none") problems.push(`Abrechnung prüfen: ${billing.reason}`);
    } catch (err) {
      if (err instanceof IntroPhaseError) problems.push("Abo ist in der Startpreis-Phase: Pause in Stripe von Hand anpassen");
      else {
        reportError(err, "pause-billing", { customer: customer.id });
        problems.push("Abrechnung in Stripe von Hand auf die Pause umstellen");
      }
    }
  } else {
    problems.push("Abrechnung von Hand anpassen (keine Online-Zahlung)");
  }

  await prisma.customerPause.update({
    where: { id: p.id },
    data: { pausedCampaignIds: campaignIds, adsNote, billingNote: JSON.stringify(billing) },
  });
  const ref = { dealId: null, salesContactId: contactId };
  if (contactId) {
    await setContactCustomerStage(ref, "PAUSIERT");
    await logOfferActivity(ref, `Pause gestartet${p.endsAt ? ` (bis ${fmt(p.endsAt)})` : ""}`, [adsNote, ...problems].filter(Boolean).join(" · "));
    for (const title of problems) {
      await prisma.salesTask.create({ data: { contactId, type: "SONSTIGES", title: `Pause ${customer.name}: ${title}`, dueAt: new Date() } }).catch(() => {});
    }
  }
  await sendToAdmins({
    title: `⏸️ Pause gestartet: ${customer.name}`,
    body: problems.length ? `Bitte erledigen: ${problems.join("; ")}` : adsNote,
    url: contactId ? `/admin/vertrieb/kontakte/${contactId}` : "/admin/vertrieb/kunden",
  }).catch(() => {});

  const to = customer.users.map((u) => u.email);
  if (to.length) {
    await sendCustomerMail({
      to,
      subject: "Ihre Pause hat begonnen",
      greeting: await customerGreeting({ salesContactId: contactId, contactName: offer?.contactName ?? null }),
      paragraphs: [
        `Ihre Anzeigen sind ab heute pausiert${p.endsAt ? ` und starten am ${fmt(p.endsAt)} automatisch wieder` : ""}.`,
        softwareFee > 0
          ? `In der Pause berechnen wir nur die Software-Gebühr von ${eur(softwareFee)} netto im Monat, tagesgenau anteilig.`
          : "In der Pause fällt keine Vergütung an.",
        "Sie können die Pause jederzeit im Kundenbereich unter „Konto & Rechnungen“ beenden.",
      ],
      button: { label: "Zum Kundenbereich", url: `${getAppUrl()}/buyer/konto` },
    }).catch((err) => reportError(err, "pause-mail"));
  }
}

/** Pause beenden (Ende erreicht oder per Klick): Anzeigen + Abrechnung zurück. */
export async function resumePause(pauseId: string): Promise<void> {
  const claimed = await prisma.customerPause.updateMany({ where: { id: pauseId, status: "active" }, data: { status: "ended", resumedAt: new Date() } });
  if (claimed.count === 0) return;
  const p = (await prisma.customerPause.findUnique({ where: { id: pauseId } }))!;
  const { customer, offer, contactId } = await context(p.customerId);
  const problems: string[] = [];

  const ids = Array.isArray(p.pausedCampaignIds) ? (p.pausedCampaignIds as string[]) : [];
  if (ids.length) {
    const r = await resumeCampaigns(ids).catch((err) => {
      reportError(err, "resume-ads", { customer: customer.id });
      return { resumed: [], failed: ids };
    });
    if (r.failed.length) problems.push(`${r.failed.length} Kampagne(n) von Hand wieder aktivieren`);
  } else {
    problems.push("Kampagnen von Hand wieder aktivieren");
  }

  // Zahlungsverzug-Pause hat die Abrechnung nicht angefasst.
  if (p.kind !== "dunning") {
    try {
      const state = p.billingNote ? (JSON.parse(p.billingNote) as BillingPauseState) : null;
      if (state && state.method !== "none") await resumeBilling(state);
      else problems.push("Abrechnung prüfen (Pause wurde nicht automatisch abgebildet)");
    } catch (err) {
      reportError(err, "resume-billing", { customer: customer.id });
      problems.push("Abrechnung in Stripe von Hand wieder auf den vollen Preis stellen");
    }
  }

  const ref = { dealId: null, salesContactId: contactId };
  if (contactId) {
    await prisma.salesContact.update({ where: { id: contactId }, data: { customerStage: "AKTIV" } }).catch(() => {});
    await logOfferActivity(ref, p.kind === "dunning" ? "Zahlung eingegangen, Kampagnen laufen wieder" : "Pause beendet, Kampagnen laufen wieder", problems.join(" · ") || null);
    for (const title of problems) {
      await prisma.salesTask.create({ data: { contactId, type: "SONSTIGES", title: `Pause-Ende ${customer.name}: ${title}`, dueAt: new Date() } }).catch(() => {});
    }
  }
  await sendToAdmins({
    title: `▶️ Pause beendet: ${customer.name}`,
    body: problems.length ? `Bitte erledigen: ${problems.join("; ")}` : "Kampagnen laufen wieder.",
    url: contactId ? `/admin/vertrieb/kontakte/${contactId}` : "/admin/vertrieb/kunden",
  }).catch(() => {});
  const to = customer.users.map((u) => u.email);
  if (to.length) {
    await sendCustomerMail({
      to,
      subject: p.kind === "dunning" ? "Zahlung erhalten: Ihre Anzeigen laufen wieder" : "Willkommen zurück: Ihre Anzeigen laufen wieder",
      greeting: await customerGreeting({ salesContactId: contactId, contactName: offer?.contactName ?? null }),
      paragraphs: [
        p.kind === "dunning"
          ? "vielen Dank für Ihre Zahlung. Ihre Anzeigen laufen ab sofort wieder. Neue Leads kommen in der Regel innerhalb von 1–2 Tagen."
          : "Ihre Pause ist beendet, die Anzeigen laufen ab heute wieder. Neue Leads kommen in der Regel innerhalb von 1–2 Tagen.",
      ],
      button: { label: "Zum Kundenbereich", url: `${getAppUrl()}/buyer` },
    }).catch((err) => reportError(err, "resume-mail"));
  }
}

export async function cancelPlannedPause(pauseId: string, customerId: string): Promise<PauseResult> {
  const r = await prisma.customerPause.updateMany({ where: { id: pauseId, customerId, status: "planned" }, data: { status: "cancelled" } });
  return r.count ? { ok: true } : { ok: false, error: "Diese Pause kann nicht mehr abgebrochen werden." };
}

/** Laufende Pause jetzt beenden bzw. geplante Pause abbrechen. */
export async function endPauseNow(customerId: string, opts: { admin?: boolean } = {}): Promise<PauseResult> {
  const p = await prisma.customerPause.findFirst({ where: { customerId, status: { in: ["planned", "active"] } }, orderBy: { startsAt: "asc" } });
  if (!p) return { ok: false, error: "Keine Pause gefunden." };
  if (p.kind === "dunning" && !opts.admin) {
    return { ok: false, error: "Die Anzeigen laufen automatisch wieder, sobald die offene Rechnung bezahlt ist." };
  }
  if (p.status === "planned") return cancelPlannedPause(p.id, customerId);
  await resumePause(p.id);
  return { ok: true };
}

export async function currentPause(customerId: string) {
  return prisma.customerPause.findFirst({
    where: { customerId, status: { in: ["planned", "active"] } },
    orderBy: { startsAt: "asc" },
  });
}

/** Cron: geplante Pausen starten, abgelaufene beenden. */
export async function runPauseCron(now = new Date()) {
  const toStart = await prisma.customerPause.findMany({ where: { status: "planned", startsAt: { lte: now } }, select: { id: true } });
  for (const p of toStart) await applyPause(p.id).catch((err) => reportError(err, "pause-cron-apply"));
  const toEnd = await prisma.customerPause.findMany({ where: { status: "active", endsAt: { lte: now } }, select: { id: true } });
  for (const p of toEnd) await resumePause(p.id).catch((err) => reportError(err, "pause-cron-resume"));
  return { started: toStart.length, ended: toEnd.length };
}

// ─── Zahlungsverzug ────────────────────────────────────────────────────
// Stripe meldet eine fehlgeschlagene/überfällige Rechnung → paymentOverdueSince.
// Tag 21: Warnung mit Bezahl-Link. Tag 30: Anzeigen pausieren (Abrechnung
// bleibt unverändert). Zahlung eingegangen → automatisch fortsetzen.

const DAY_MS = 24 * 60 * 60 * 1000;
export const DUNNING_WARN_DAYS = 21;
export const DUNNING_PAUSE_DAYS = 30;

export async function markPaymentOverdue(stripeCustomerId: string, since: Date) {
  await prisma.customer.updateMany({
    where: { stripeCustomerId, paymentOverdueSince: null },
    data: { paymentOverdueSince: since },
  });
}

/** Rechnung bezahlt: Verzug zurücksetzen, Zahlungsverzug-Pause beenden. */
export async function markPaymentReceived(stripeCustomerId: string) {
  const c = await prisma.customer.findFirst({ where: { stripeCustomerId }, select: { id: true, paymentOverdueSince: true } });
  if (!c) return;
  // Weitere offene Rechnungen? Dann bleibt der Verzug bestehen.
  const { listCustomerInvoices } = await import("@/lib/billing");
  const open = (await listCustomerInvoices(stripeCustomerId).catch(() => [])).filter((i) => i.status === "open");
  if (open.length > 0) return;
  if (c.paymentOverdueSince) {
    await prisma.customer.update({ where: { id: c.id }, data: { paymentOverdueSince: null, paymentWarnedAt: null } });
  }
  const dunning = await prisma.customerPause.findFirst({ where: { customerId: c.id, kind: "dunning", status: "active" } });
  if (dunning) await resumePause(dunning.id);
}

async function openInvoiceUrl(stripeCustomerId: string): Promise<string | null> {
  const { listCustomerInvoices } = await import("@/lib/billing");
  const open = (await listCustomerInvoices(stripeCustomerId).catch(() => [])).filter((i) => i.status === "open");
  return open[0]?.hostedUrl ?? null;
}

export async function runDunningCron(now = new Date(), sendMails = true) {
  const overdue = await prisma.customer.findMany({
    where: { paymentOverdueSince: { not: null }, stripeCustomerId: { not: null } },
    select: { id: true, paymentOverdueSince: true, paymentWarnedAt: true, stripeCustomerId: true },
  });
  let warned = 0;
  let paused = 0;
  for (const c of overdue) {
    const days = (now.getTime() - c.paymentOverdueSince!.getTime()) / DAY_MS;
    const { customer, offer, contactId } = await context(c.id);
    const to = customer.users.map((u) => u.email);
    const greeting = await customerGreeting({ salesContactId: contactId, contactName: offer?.contactName ?? null });

    if (days >= DUNNING_WARN_DAYS && !c.paymentWarnedAt && sendMails && to.length) {
      const url = (await openInvoiceUrl(c.stripeCustomerId!)) ?? `${getAppUrl()}/buyer/konto`;
      await sendCustomerMail({
        to,
        subject: "Offene Rechnung: bitte begleichen",
        greeting,
        paragraphs: [
          "bei uns ist noch eine Rechnung offen, die Abbuchung hat leider nicht geklappt.",
          `Bitte begleichen Sie den Betrag in den nächsten ${Math.max(1, Math.ceil(DUNNING_PAUSE_DAYS - days))} Tagen. Andernfalls müssen wir die Anzeigen vorübergehend pausieren; sie laufen nach Zahlungseingang automatisch wieder an.`,
          "Falls sich das mit Ihrer Zahlung überschnitten hat, betrachten Sie diese Nachricht bitte als gegenstandslos.",
        ],
        button: { label: "Rechnung jetzt bezahlen", url },
      }).catch((err) => reportError(err, "dunning-warn-mail"));
      await prisma.customer.update({ where: { id: c.id }, data: { paymentWarnedAt: now } });
      await sendToAdmins({ title: `💶 Zahlungserinnerung: ${customer.name}`, body: `Rechnung seit ${Math.floor(days)} Tagen offen.`, url: contactId ? `/admin/vertrieb/kontakte/${contactId}` : "/admin/leads" }).catch(() => {});
      warned++;
    }

    if (days >= DUNNING_PAUSE_DAYS) {
      const active = await prisma.customerPause.findFirst({ where: { customerId: c.id, status: "active" } });
      if (active) continue; // schon pausiert (Urlaub oder Verzug)
      let campaignIds: string[] = [];
      let adsNote = "Kein Werbekonto hinterlegt";
      if (customer.metaAdAccountId) {
        try {
          campaignIds = await pauseActiveCampaigns(customer.metaAdAccountId);
          adsNote = `${campaignIds.length} Kampagne(n) pausiert`;
        } catch (err) {
          reportError(err, "dunning-pause-ads", { customer: c.id });
          adsNote = "Automatisches Pausieren fehlgeschlagen";
        }
      }
      await prisma.customerPause.create({
        data: {
          customerId: c.id,
          kind: "dunning",
          status: "active",
          startsAt: now,
          reason: "Zahlungsverzug",
          createdBy: "admin",
          appliedAt: now,
          pausedCampaignIds: campaignIds,
          adsNote,
          billingNote: JSON.stringify({ method: "none", reason: "Zahlungsverzug: Abrechnung unverändert" }),
        },
      });
      if (contactId) {
        await logOfferActivity({ dealId: null, salesContactId: contactId }, "Anzeigen pausiert wegen Zahlungsverzug", adsNote);
        if (!campaignIds.length) {
          await prisma.salesTask.create({ data: { contactId, type: "SONSTIGES", title: `Zahlungsverzug ${customer.name}: Kampagnen von Hand pausieren`, dueAt: now } }).catch(() => {});
        }
      }
      await sendToAdmins({ title: `⛔ Anzeigen gestoppt: ${customer.name}`, body: `Zahlungsverzug seit ${Math.floor(days)} Tagen · ${adsNote}`, url: contactId ? `/admin/vertrieb/kontakte/${contactId}` : "/admin/leads" }).catch(() => {});
      if (sendMails && to.length) {
        const url = (await openInvoiceUrl(c.stripeCustomerId!)) ?? `${getAppUrl()}/buyer/konto`;
        await sendCustomerMail({
          to,
          subject: "Ihre Anzeigen sind pausiert",
          greeting,
          paragraphs: [
            "da eine Rechnung seit über 30 Tagen offen ist, haben wir Ihre Anzeigen vorübergehend pausiert.",
            "Sobald die Zahlung eingegangen ist, laufen die Anzeigen automatisch wieder an.",
          ],
          button: { label: "Rechnung jetzt bezahlen", url },
        }).catch((err) => reportError(err, "dunning-pause-mail"));
      }
      paused++;
    }
  }
  return { overdue: overdue.length, warned, paused };
}
