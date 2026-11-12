// Modul „Empfehlungen & Bewertungen“: Selbstbuchung mit Testphase, Kündigung,
// Abrechnung nach der Testphase, Hinweise im Produkt und Admin-Übersicht.
//
// Abrechnung (AGB „Selbstbuchung von Zusatzmodulen“): Testphase ohne Abo-Position;
// danach bzw. bei Buchung ohne Testphase kommt die Position tagesgenau anteilig ins
// Stripe-Abo. Geht das nicht automatisch (kein Abo, Startpreis-Phase, Fehler), bleibt
// das Modul trotzdem frei und Ole bekommt die Aufgabe „Preis anpassen“.

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { addEmpfehlungToSubscription, scheduleEmpfehlungCancel, withdrawEmpfehlungCancel } from "@/lib/billing";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { customerGreeting } from "@/lib/offer-links";
import {
  ANNOUNCEMENT_KEY,
  CANDIDATE_MIN_CLOSINGS,
  CANDIDATE_WINDOW_DAYS,
  DAY_MS,
  HINT_KEYS,
  TRIAL_REMINDER_DAYS,
  bookingTerms,
  eurNet,
  fmtDate,
  moduleState,
  trialAvailable,
  trialEndFrom,
  type ModuleState,
} from "@/lib/empfehlung/shared";

const MODULE = "Empfehlungen & Bewertungen";

export const MODULE_SELECT = {
  plan: true,
  paymentOverdueSince: true,
  billingInterval: true,
  empfehlungEnabled: true,
  empfehlungMonthly: true,
  empfehlungTrialEndsAt: true,
  empfehlungFree: true,
  empfehlungCancelAt: true,
  empfehlungSince: true,
} as const;

export async function moduleInfo(customerId: string, now = new Date()) {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { ...MODULE_SELECT, moduleHintsDismissed: true } });
  if (!c) return null;
  const state = moduleState(c, now);
  return {
    state,
    active: state !== "inactive",
    trialAvailable: trialAvailable(c),
    trialEndsAt: c.empfehlungTrialEndsAt,
    cancelAt: c.empfehlungCancelAt,
    monthly: c.empfehlungMonthly == null ? null : Number(c.empfehlungMonthly),
    annual: c.billingInterval === "year",
    service: c.plan === "service",
    dismissed: c.moduleHintsDismissed ?? [],
  };
}

async function contactInfo(customerId: string) {
  const c = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: {
      name: true,
      salesContact: { select: { id: true } },
      onboarding: { select: { offerId: true, salesContactId: true } },
      users: { where: { role: "BUYER", teamRole: "owner" }, select: { email: true } },
    },
  });
  const offer = c.onboarding?.offerId ? await prisma.offer.findUnique({ where: { id: c.onboarding.offerId }, select: { contactName: true } }) : null;
  return {
    name: c.name,
    contactId: c.salesContact?.id ?? c.onboarding?.salesContactId ?? null,
    contactName: offer?.contactName ?? null,
    to: c.users.map((u) => u.email),
  };
}

/** Ole: Push + Eintrag in „Heute“ (Vertriebsaufgabe am Kontakt des Kunden). */
async function informAdmin(customerId: string, title: string, note: string, opts: { task?: boolean } = { task: true }) {
  const info = await contactInfo(customerId).catch(() => null);
  if (opts.task !== false) {
    await prisma.salesTask
      .create({ data: { contactId: info?.contactId ?? null, type: "SONSTIGES", title, note, dueAt: new Date() } })
      .catch((err) => reportError(err, "empfehlung-admin-task"));
  }
  const { sendToAdmins } = await import("@/lib/push");
  await sendToAdmins({ title, body: note.slice(0, 140), url: `/admin/kunden/${customerId}/abrechnung`, tag: `empfehlung:${customerId}` }).catch(() => {});
}

async function mailCustomer(customerId: string, subject: string, paragraphs: string[], list?: string[]) {
  try {
    const info = await contactInfo(customerId);
    if (!info.to.length) return;
    let url: string | null = null;
    try {
      url = `${getAppUrl()}/buyer/empfehlungen`;
    } catch {
      url = null;
    }
    await sendCustomerMail({
      to: info.to,
      subject,
      greeting: await customerGreeting({ salesContactId: info.contactId, contactName: info.contactName }),
      paragraphs,
      ...(list?.length ? { list } : {}),
      ...(url ? { button: { label: "Zum Modul", url } } : {}),
    });
  } catch (err) {
    reportError(err, "empfehlung-mail");
  }
}

export type BookResult = { ok: true; state: ModuleState; trialEndsAt: Date | null; note?: string } | { ok: false; error: string };

/**
 * Selbst buchen. Erste Buchung: Testphase (keine Berechnung). Sonst sofort kostenpflichtig
 * (anteilig). Gekündigt, aber noch aktiv → Kündigung zurücknehmen. Idempotent.
 */
export async function bookEmpfehlung(customerId: string, opts: { actor?: AuditActor; acknowledged: boolean; now?: Date }): Promise<BookResult> {
  const now = opts.now ?? new Date();
  if (!opts.acknowledged) return { ok: false, error: "Bitte bestätigen Sie Preis und Bedingungen." };
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: MODULE_SELECT });
  if (!c) return { ok: false, error: "Konto nicht gefunden." };
  if (c.plan === "service") return { ok: false, error: "Das Modul gibt es nur im Paket mit Software." };
  if (c.paymentOverdueSince) return { ok: false, error: "Es ist noch eine Rechnung offen. Bitte melden Sie sich kurz bei uns." };
  const state = moduleState(c, now);

  if (state === "cancelling") {
    const r = await withdrawEmpfehlungCancel(customerId);
    if (!r.ok) return { ok: false, error: r.error };
    await audit("empfehlung.book", { entity: "Customer", entityId: customerId, customerId, details: { mode: "withdraw_cancel" }, ...(opts.actor ? { actor: opts.actor } : {}) });
    await informAdmin(customerId, `${MODULE}: Kündigung zurückgenommen`, "Der Kunde hat die Kündigung im Kundenbereich zurückgenommen. Nichts weiter zu tun.", { task: false });
    await mailCustomer(customerId, `Ihr Modul „${MODULE}“ läuft weiter`, ["Ihre Kündigung ist zurückgenommen. Das Modul läuft wie bisher weiter."]);
    return { ok: true, state: moduleState({ ...c, empfehlungCancelAt: null }, now), trialEndsAt: c.empfehlungTrialEndsAt };
  }
  if (state !== "inactive") return { ok: true, state, trialEndsAt: c.empfehlungTrialEndsAt };

  const terms = bookingTerms({ trial: trialAvailable(c), annual: c.billingInterval === "year", now });
  if (trialAvailable(c)) {
    const trialEndsAt = trialEndFrom(now);
    // Nur einmal: gleichzeitige Klicks buchen nicht doppelt
    const claimed = await prisma.customer.updateMany({
      where: { id: customerId, empfehlungEnabled: false, empfehlungTrialEndsAt: null, empfehlungSince: null },
      data: { empfehlungEnabled: true, empfehlungTrialEndsAt: trialEndsAt, empfehlungMonthly: null, empfehlungCancelAt: null, empfehlungTrialReminded: null, empfehlungSince: now },
    });
    if (claimed.count === 0) return { ok: true, state: "trial", trialEndsAt };
    await audit("empfehlung.book", { entity: "Customer", entityId: customerId, customerId, details: { mode: "trial", until: trialEndsAt.toISOString() }, ...(opts.actor ? { actor: opts.actor } : {}) });
    const name = (await contactInfo(customerId).catch(() => null))?.name ?? "Kunde";
    await informAdmin(customerId, `${MODULE} gebucht (Testphase): ${name}`, `Testphase bis ${fmtDate(trialEndsAt)}, danach ${eurNet(PRICE_LIST.empfehlungModuleMonthly)}/Monat automatisch. Nichts zu tun.`);
    await mailCustomer(
      customerId,
      `Ihre Testphase „${MODULE}“ läuft`,
      [
        `vielen Dank – das Modul „${MODULE}“ ist ab sofort freigeschaltet.`,
        "Hinterlegen Sie jetzt Ihren Google-Bewertungslink, dann bitten wir nach jedem Abschluss automatisch um eine Bewertung und später um eine Empfehlung.",
      ],
      terms.lines,
    );
    await submitTemplatesSoon(customerId);
    return { ok: true, state: "trial", trialEndsAt };
  }

  // Ohne Testphase: sofort kostenpflichtig (anteilig)
  const price = PRICE_LIST.empfehlungModuleMonthly;
  const claimed = await prisma.customer.updateMany({
    where: { id: customerId, empfehlungEnabled: false },
    data: { empfehlungEnabled: true, empfehlungMonthly: price, empfehlungFree: false, empfehlungCancelAt: null, empfehlungSince: c.empfehlungSince ?? now },
  });
  if (claimed.count === 0) return { ok: true, state: "active", trialEndsAt: c.empfehlungTrialEndsAt };
  const r = await addEmpfehlungToSubscription(customerId, price);
  const name = (await contactInfo(customerId).catch(() => null))?.name ?? "Kunde";
  if (!r.ok || r.note) {
    await informAdmin(customerId, `Preis anpassen ${name}: ${MODULE} ${eurNet(price)}/Monat`, `Selbst gebucht. Automatisch nicht möglich: ${r.ok ? r.note : r.error}`);
  } else {
    await informAdmin(customerId, `${MODULE} gebucht: ${name}`, `${eurNet(price)}/Monat, Stripe-Abo angepasst. Nichts zu tun.`);
  }
  await audit("empfehlung.book", { entity: "Customer", entityId: customerId, customerId, details: { mode: "paid", price, stripe: r.ok ? (r.note ?? "ok") : r.error }, ...(opts.actor ? { actor: opts.actor } : {}) });
  await mailCustomer(customerId, `Ihr Modul „${MODULE}“ ist gebucht`, [`vielen Dank – das Modul „${MODULE}“ ist ab sofort freigeschaltet.`], terms.lines);
  await submitTemplatesSoon(customerId);
  return { ok: true, state: "active", trialEndsAt: c.empfehlungTrialEndsAt, ...(r.ok && r.note ? { note: r.note } : {}) };
}

/** WhatsApp-Vorlagen des Moduls gleich einreichen (sonst übernimmt der Cron). */
async function submitTemplatesSoon(customerId: string) {
  try {
    const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true } });
    if (acc?.status !== "connected") return;
    const { submitTemplatesForCustomer } = await import("@/lib/whatsapp/template-submit");
    await submitTemplatesForCustomer(customerId);
  } catch {
    // Cron reicht nach
  }
}

/** Kündigen: in der Testphase zum Ende der Testphase (ohne Kosten), sonst zum Ende des Abrechnungszeitraums. */
export async function cancelEmpfehlung(customerId: string, opts: { actor?: AuditActor; now?: Date } = {}): Promise<{ ok: true; until: Date } | { ok: false; error: string }> {
  const now = opts.now ?? new Date();
  const res = await scheduleEmpfehlungCancel(customerId, now);
  if (!res.ok) return res;
  await audit("empfehlung.cancel", { entity: "Customer", entityId: customerId, customerId, details: { until: res.until.toISOString() }, ...(opts.actor ? { actor: opts.actor } : {}) });
  const name = (await contactInfo(customerId).catch(() => null))?.name ?? "Kunde";
  await informAdmin(customerId, `${MODULE} gekündigt: ${name}`, `Zum ${fmtDate(res.until)}${res.note ? ` · ${res.note}` : ""}`, { task: !!res.note });
  await mailCustomer(customerId, `Kündigung Ihres Moduls „${MODULE}“`, [
    `wir bestätigen die Kündigung zum ${fmtDate(res.until)}. Bis dahin läuft das Modul wie gewohnt, danach wird es nicht mehr berechnet und es gehen keine neuen Anfragen mehr raus.`,
    "Sie können die Kündigung bis dahin jederzeit unter „Konto & Rechnungen“ zurücknehmen.",
  ]);
  return { ok: true, until: res.until };
}

/**
 * Cron: Erinnerung vor Ende der Testphase, danach kostenpflichtig (genau einmal),
 * Ablauf gekündigter Module.
 */
export async function processEmpfehlungBilling(now = new Date()): Promise<{ reminded: number; billed: number; expired: number }> {
  let reminded = 0;
  let billed = 0;
  let expired = 0;

  // 1. Erinnerung 3 Tage vor Ende der Testphase
  const remind = await prisma.customer.findMany({
    where: {
      empfehlungEnabled: true,
      empfehlungMonthly: null,
      empfehlungFree: false,
      empfehlungCancelAt: null,
      empfehlungTrialReminded: null,
      empfehlungTrialEndsAt: { gt: now, lte: new Date(now.getTime() + TRIAL_REMINDER_DAYS * DAY_MS) },
    },
    select: { id: true, empfehlungTrialEndsAt: true },
  });
  for (const c of remind) {
    const claimed = await prisma.customer.updateMany({ where: { id: c.id, empfehlungTrialReminded: null }, data: { empfehlungTrialReminded: now } });
    if (claimed.count === 0) continue;
    const until = fmtDate(c.empfehlungTrialEndsAt!);
    const { sendToBuyersOfCustomer } = await import("@/lib/push");
    await sendToBuyersOfCustomer(c.id, {
      title: `Testphase „${MODULE}“ endet am ${until}`,
      body: `Danach ${eurNet(PRICE_LIST.empfehlungModuleMonthly)}/Monat. Kündigen geht jederzeit unter Konto & Rechnungen.`,
      url: "/buyer/konto?modul=empfehlung#zusatzmodule",
      tag: `empfehlung-trial:${c.id}`,
    }).catch(() => {});
    await mailCustomer(c.id, `Ihre Testphase „${MODULE}“ endet am ${until}`, [
      `Ihre kostenlose Testphase endet am ${until}. Danach läuft das Modul automatisch weiter für ${eurNet(PRICE_LIST.empfehlungModuleMonthly)} im Monat, tagesgenau anteilig mit Ihrer nächsten Rechnung.`,
      "Wenn Sie das Modul nicht behalten möchten, kündigen Sie einfach vorher unter „Konto & Rechnungen“ – dann entstehen keine Kosten.",
    ]);
    reminded++;
  }

  // 2. Testphase vorbei → kostenpflichtig (Claim: genau einmal)
  const due = await prisma.customer.findMany({
    where: { empfehlungEnabled: true, empfehlungMonthly: null, empfehlungFree: false, empfehlungCancelAt: null, empfehlungTrialEndsAt: { lte: now } },
    select: { id: true, name: true },
  });
  for (const c of due) {
    const price = PRICE_LIST.empfehlungModuleMonthly;
    const claimed = await prisma.customer.updateMany({ where: { id: c.id, empfehlungMonthly: null, empfehlungCancelAt: null }, data: { empfehlungMonthly: price } });
    if (claimed.count === 0) continue;
    const r = await addEmpfehlungToSubscription(c.id, price);
    await audit("empfehlung.trial_end", { entity: "Customer", entityId: c.id, customerId: c.id, details: { price, stripe: r.ok ? (r.note ?? "ok") : r.error }, actor: { role: "system" } });
    if (!r.ok || r.note) {
      await informAdmin(c.id, `Preis anpassen ${c.name}: ${MODULE} ${eurNet(price)}/Monat`, `Testphase beendet. Automatisch nicht möglich: ${r.ok ? r.note : r.error}`);
    }
    billed++;
  }

  // 3. Gekündigte Module zum Stichtag abschalten
  const ending = await prisma.customer.findMany({ where: { empfehlungCancelAt: { lte: now } }, select: { id: true } });
  for (const c of ending) {
    await prisma.customer.update({ where: { id: c.id }, data: { empfehlungEnabled: false, empfehlungMonthly: null, empfehlungFree: false, empfehlungCancelAt: null } });
    // Geplante Anfragen nicht mehr senden
    await prisma.reviewRequest.updateMany({ where: { customerId: c.id, status: "scheduled" }, data: { status: "skipped", note: "Modul beendet" } });
    await prisma.reviewRequest.updateMany({ where: { customerId: c.id, referralStatus: "waiting" }, data: { referralStatus: "skipped", note: "Modul beendet" } });
    await audit("billing.empfehlung", { entity: "Customer", entityId: c.id, customerId: c.id, details: { mode: "expired" }, actor: { role: "system" } });
    expired++;
  }
  return { reminded, billed, expired };
}

// ─── Hinweise im Produkt ────────────────────────────────────────────────────

export async function dismissHint(customerId: string, key: string): Promise<void> {
  if (!HINT_KEYS.includes(key)) return;
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { moduleHintsDismissed: true } });
  if (!c || c.moduleHintsDismissed.includes(key)) return;
  await prisma.customer.update({ where: { id: customerId }, data: { moduleHintsDismissed: [...c.moduleHintsDismissed, key] } });
}

/** Abschlüsse der letzten 60 Tage (für Heute-Hinweis und Admin-Kandidaten). */
export async function recentClosings(customerId: string, now = new Date()): Promise<number> {
  return prisma.lead.count({
    where: { customerId, status: "Abschluss", erasedAt: null, closedAt: { gte: new Date(now.getTime() - CANDIDATE_WINDOW_DAYS * DAY_MS) } },
  });
}

// ─── Admin: Kandidaten, Zähler, Ankündigung ────────────────────────────────

export async function moduleOverview(now = new Date()) {
  const since = new Date(now.getTime() - CANDIDATE_WINDOW_DAYS * DAY_MS);
  const customers = await prisma.customer.findMany({
    where: { archived: false, plan: { not: "service" } },
    select: { id: true, name: true, ...MODULE_SELECT, existingCustomersEnabled: true },
  });
  const counts = { trial: 0, active: 0, free: 0, cancelling: 0, inactive: 0 };
  for (const c of customers) counts[moduleState(c, now)]++;
  const closings = await prisma.lead.groupBy({
    by: ["customerId"],
    where: { status: "Abschluss", erasedAt: null, closedAt: { gte: since }, customerId: { in: customers.map((c) => c.id) } },
    _count: { _all: true },
  });
  const byId = new Map(closings.map((g) => [g.customerId, g._count._all]));
  const candidates = customers
    .filter((c) => moduleState(c, now) === "inactive" && (byId.get(c.id) ?? 0) >= CANDIDATE_MIN_CLOSINGS)
    .map((c) => ({ id: c.id, name: c.name, closings: byId.get(c.id) ?? 0, bestand: c.existingCustomersEnabled }))
    .sort((a, b) => b.closings - a.closings);
  const announcement = await prisma.moduleAnnouncement.findUnique({ where: { key: ANNOUNCEMENT_KEY } });
  const audience = customers.filter((c) => moduleState(c, now) === "inactive").length;
  return { counts, candidates, announcement, audience };
}

export const ANNOUNCEMENT = {
  subject: "Neu: Empfehlungen & Google-Bewertungen automatisch",
  paragraphs: [
    "ab sofort gibt es im Kundenbereich das Zusatzmodul „Empfehlungen & Bewertungen“.",
    "Nach jedem Abschluss fragt die App Ihren Kunden per WhatsApp in Ihrem Namen, ob alles gepasst hat – mit direktem Draht zu Ihnen – und bittet um eine Google-Bewertung. Einige Wochen später kommt die Bitte um eine Empfehlung: Die empfohlene Person trägt sich selbst ein und landet als neuer Lead bei Ihnen.",
    "Kritische Antworten landen sofort als Aufgabe bei Ihnen, damit Sie sie persönlich klären können.",
    `Sie können das Modul ${PRICE_LIST.empfehlungTrialDays} Tage kostenlos testen, danach ${eurNet(PRICE_LIST.empfehlungModuleMonthly)} im Monat, monatlich kündbar.`,
  ],
  inApp: `Neu: Empfehlungen & Bewertungen – nach jedem Abschluss automatisch um eine Google-Bewertung und eine Empfehlung bitten. ${PRICE_LIST.empfehlungTrialDays} Tage kostenlos testen.`,
} as const;

/** Einmalige Ankündigung an alle aktiven Kunden ohne Modul (nur per Knopf, nie automatisch). */
export async function sendAnnouncement(actor: AuditActor, now = new Date()): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const existing = await prisma.moduleAnnouncement.findUnique({ where: { key: ANNOUNCEMENT_KEY } });
  if (existing) return { ok: false, error: `Die Ankündigung wurde schon am ${fmtDate(existing.sentAt)} verschickt.` };
  // Erst eintragen (eindeutiger Schlüssel), dann senden: doppelte Klicks senden nicht doppelt
  try {
    await prisma.moduleAnnouncement.create({ data: { key: ANNOUNCEMENT_KEY, sentAt: now, sentBy: actor.email ?? null } });
  } catch {
    return { ok: false, error: "Die Ankündigung wird gerade schon verschickt." };
  }
  const customers = await prisma.customer.findMany({
    where: { archived: false, plan: { not: "service" }, empfehlungEnabled: false },
    select: { id: true },
  });
  let sent = 0;
  let url: string | null = null;
  try {
    url = `${getAppUrl()}/buyer/konto?modul=empfehlung#zusatzmodule`;
  } catch {
    url = null;
  }
  for (const c of customers) {
    const info = await contactInfo(c.id).catch(() => null);
    if (!info?.to.length) continue;
    const r = await sendCustomerMail({
      to: info.to,
      subject: ANNOUNCEMENT.subject,
      greeting: await customerGreeting({ salesContactId: info.contactId, contactName: info.contactName }),
      paragraphs: [...ANNOUNCEMENT.paragraphs],
      ...(url ? { button: { label: "Jetzt kostenlos testen", url } } : {}),
    }).catch(() => ({ ok: false as const }));
    if (r.ok) sent++;
  }
  await prisma.moduleAnnouncement.update({ where: { key: ANNOUNCEMENT_KEY }, data: { sentCount: sent } });
  await audit("empfehlung.announce", { entity: "ModuleAnnouncement", entityId: ANNOUNCEMENT_KEY, details: { sent, audience: customers.length }, actor });
  return { ok: true, sent };
}
