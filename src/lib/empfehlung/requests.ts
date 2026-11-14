// Modul „Empfehlungen & Bewertungen“: Nachfrage nach dem Abschluss (mit Google-Link
// für alle), Auswertung der Antworten, Bitte um Empfehlung, persönliche
// Empfehlungslinks, Dank an Empfehlende, Auswertung.
// Ablauf und Regeln: siehe lib/empfehlung/shared.ts.

import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { getAppUrl } from "@/lib/email";
import { advisorDisplayName } from "@/lib/whatsapp/template-plan";
import { estimatedProvision } from "@/lib/provision";
import { loadCustomerProvision } from "@/lib/provision-server";
import {
  DAY_MS,
  DEFAULT_DELAYS,
  APPOINTMENT_REFERRAL_GAP_DAYS,
  DEFAULT_FOLLOWUP_HOURS,
  isUnhappyTask,
  parseRefCode,
  whatsappLink,
  whatsappRequestText,
  DEFAULT_TEXTS,
  OCCASIONS,
  UNHAPPY_TASK,
  classifyHeuristic,
  firstName,
  followUpNote,
  funnelHint,
  isSelfReferral,
  REWARD_WAIT_DAYS,
  referralBlocker,
  renderText,
  resolveOffer,
  resolveReward,
  rewardLabel,
  rewardSentence,
  rewardTaskNote,
  sendingWindow,
  statusUpdateLine,
  statusUpdateText,
  type Occasion,
  type OfferKind,
  type ResolvedOffer,
  type ResolvedReward,
  type Sentiment,
  type TextKey,
  type UpdateStage,
} from "@/lib/empfehlung/shared";

const CLOSED = "Abschluss";
/** So lange nach dem Abschluss wird noch nachgefragt (ältere Abschlüsse: nie). */
const MAX_AGE_DAYS = 45;
/** Antworten so lange nach der Nachfrage gelten als Antwort darauf. */
const REPLY_WINDOW_DAYS = 14;
const PER_RUN = 30;
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

export const newToken = () => crypto.randomBytes(18).toString("base64url");

export function appBase(): string {
  try {
    return getAppUrl();
  } catch {
    return process.env.APP_URL?.replace(/\/$/, "") || "https://app.performancegrowth.de";
  }
}
export const googleLinkFor = (token: string) => `${appBase()}/empfehlung/g/${token}`;
export const referralLinkFor = (token: string) => `${appBase()}/empfehlung/${token}`;
export const contactLinkFor = (token: string) => `${appBase()}/empfehlung/${token}/kontakt`;

export type Settings = {
  active: boolean;
  googleReviewUrl: string | null;
  reviewDelayDays: number;
  referralDelayDays: number;
  texts: Record<TextKey, string>;
  custom: Partial<Record<TextKey, string>>;
  offerKind: OfferKind;
  offerHeadline: string | null;
  offerText: string | null;
  referralOnPraise: boolean;
  statusUpdates: boolean;
  followUpHours: number;
  referralAfterAppointment: boolean;
  /** Dankeschön für Empfehlende (null = aus) */
  reward: ResolvedReward | null;
  rewardRaw: { kind: string; amount: number | null; note: string | null; trigger: string; confirmedAt: Date | null };
};

export async function loadSettings(customerId: string): Promise<Settings> {
  const s = await prisma.reviewSettings.findUnique({ where: { customerId } });
  const custom: Partial<Record<TextKey, string>> = {};
  if (s?.reviewText) custom.review = s.reviewText;
  if (s?.thanksText) custom.thanks = s.thanksText;
  if (s?.unhappyText) custom.unhappy = s.unhappyText;
  if (s?.referralText) custom.referral = s.referralText;
  if (s?.referralThanksText) custom.referralThanks = s.referralThanksText;
  if (s?.praiseReferralText) custom.praiseReferral = s.praiseReferralText;
  return {
    active: s?.active ?? true,
    googleReviewUrl: s?.googleReviewUrl ?? null,
    reviewDelayDays: s?.reviewDelayDays ?? DEFAULT_DELAYS.review,
    referralDelayDays: s?.referralDelayDays ?? DEFAULT_DELAYS.referral,
    texts: { ...DEFAULT_TEXTS, ...custom },
    custom,
    offerKind: (s?.offerKind ?? "none") as OfferKind,
    offerHeadline: s?.offerHeadline ?? null,
    offerText: s?.offerText ?? null,
    referralOnPraise: s?.referralOnPraise ?? true,
    statusUpdates: s?.statusUpdates ?? true,
    followUpHours: s?.followUpHours ?? DEFAULT_FOLLOWUP_HOURS,
    referralAfterAppointment: s?.referralAfterAppointment ?? false,
    reward: s?.rewardConfirmedAt ? resolveReward(s) : null,
    rewardRaw: { kind: s?.rewardKind ?? "none", amount: s?.rewardAmount ?? null, note: s?.rewardNote ?? null, trigger: s?.rewardTrigger ?? "termin", confirmedAt: s?.rewardConfirmedAt ?? null },
  };
}

async function advisorOf(customerId: string): Promise<string> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } });
  return advisorDisplayName(c?.name ?? "");
}

// ─── Empfehlungslinks ───────────────────────────────────────────────────────

/** Persönlichen Empfehlungslink holen oder anlegen (Lead mit Abschluss oder Bestandskunde). */
export async function referralLinkOf(owner: { customerId: string; leadId?: string; existingCustomerId?: string }) {
  const where = owner.leadId ? { leadId: owner.leadId } : { existingCustomerId: owner.existingCustomerId };
  if (!owner.leadId && !owner.existingCustomerId) throw new Error("Kein Kontakt");
  const found = await prisma.referralLink.findFirst({ where });
  if (found) return found;
  try {
    return await prisma.referralLink.create({
      data: { customerId: owner.customerId, token: newToken(), leadId: owner.leadId ?? null, existingCustomerId: owner.existingCustomerId ?? null },
    });
  } catch {
    // gleichzeitig angelegt (eindeutig je Kontakt)
    return prisma.referralLink.findFirstOrThrow({ where });
  }
}

/** Allgemeiner Link des Vertreters (Aufsteller, E-Mail-Signatur): keinem Kontakt zugeordnet. */
export async function generalLinkOf(customerId: string) {
  const found = await prisma.referralLink.findFirst({ where: { customerId, kind: "general" }, orderBy: { createdAt: "asc" } });
  if (found) return found;
  return prisma.referralLink.create({ data: { customerId, token: newToken(), kind: "general" } });
}

/**
 * Aufgabe „Empfehlung nachfassen“ in „Heute“ (Wiedervorlage am Lead), nur nach einem Versand
 * durch den Vertreter selbst und nur, wenn am Kontakt keine andere Wiedervorlage steht.
 */
export async function planReferralFollowUp(customerId: string, leadId: string | null | undefined, hours: number, now = new Date()): Promise<boolean> {
  if (!leadId || hours <= 0) return false;
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId, erasedAt: null }, select: { name: true, followUpAt: true } });
  if (!lead || lead.followUpAt) return false;
  const r = await prisma.lead.updateMany({
    where: { id: leadId, followUpAt: null },
    data: { followUpAt: new Date(now.getTime() + hours * 3600_000), followUpNote: followUpNote(firstName(lead.name)) },
  });
  return r.count > 0;
}

/** Ist der Kontakt Empfehlender? (Abschluss oder Bestandskunde) */
export async function canSendReferral(customerId: string, leadId: string): Promise<boolean> {
  const l = await prisma.lead.findFirst({ where: { id: leadId, customerId, erasedAt: null }, select: { status: true, source: true } });
  return !!l && (l.status === CLOSED || l.source === "Bestandskunde");
}

/**
 * „Empfehlungslink senden“ (Vertreter, jederzeit): per WhatsApp im Namen des Vertreters.
 * Ohne WhatsApp-Verbindung gibt die Oberfläche den Text zum Teilen aus (shareText).
 */
export async function sendReferralLinkNow(
  customerId: string,
  target: { leadId?: string; existingCustomerId?: string },
  actor?: AuditActor,
  occasion?: Occasion | null,
): Promise<{ ok: true; mode: "text" | "template"; followUp: boolean } | { ok: false; error: string; link?: string; text?: string }> {
  const settings = await loadSettings(customerId);
  const vertreter = await advisorOf(customerId);
  let phone: string | null = null;
  let name: string | null = null;
  let leadId: string | null = null;
  if (target.leadId) {
    const l = await prisma.lead.findFirst({ where: { id: target.leadId, customerId, erasedAt: null }, select: { id: true, name: true, phone: true, status: true, source: true } });
    if (!l || !(l.status === CLOSED || l.source === "Bestandskunde")) return { ok: false, error: "Empfehlungslinks gibt es für Kontakte mit Abschluss und Bestandskunden." };
    phone = l.phone;
    name = l.name;
    leadId = l.id;
  } else if (target.existingCustomerId) {
    const e = await prisma.existingCustomer.findFirst({ where: { id: target.existingCustomerId, customerId }, select: { firstName: true, lastName: true, phone: true, optOutAt: true } });
    if (!e) return { ok: false, error: "Kontakt nicht gefunden." };
    if (e.optOutAt) return { ok: false, error: "Dieser Kunde möchte keine Nachrichten mehr." };
    phone = e.phone;
    name = [e.firstName, e.lastName].filter(Boolean).join(" ") || null;
  }
  const link = await referralLinkOf({ customerId, ...target });
  const url = referralLinkFor(link.token);
  // Mit Anlass (Schaden geregelt, gespart, Jahresgespräch) passt der Einstieg zum Moment
  const text = renderText(occasion ? OCCASIONS[occasion].text : settings.texts.referral, { vorname: firstName(name), link: url, vertreter });
  if (!phone) return { ok: false, error: "Keine Handynummer hinterlegt – Text zum Teilen:", link: url, text };
  try {
    const { sendWhatsAppNotice } = await import("@/lib/whatsapp/templates");
    const r = await sendWhatsAppNotice({ customerId, to: phone, purpose: "referral_request", params: [firstName(name) || "Hallo", url], text, leadId, contactName: name });
    await prisma.referralLink.update({ where: { id: link.id }, data: { lastSentAt: new Date(), lastOccasion: occasion ?? null } });
    await audit("empfehlung.link_sent", { entity: "ReferralLink", entityId: link.id, customerId, details: { mode: r.mode, occasion: occasion ?? null }, ...(actor ? { actor } : {}) });
    const followUp = await planReferralFollowUp(customerId, leadId, settings.followUpHours).catch(() => false);
    return { ok: true, mode: r.mode, followUp };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: /Vorlage/.test(msg) ? "Die WhatsApp-Vorlage ist noch nicht freigegeben – Text zum Teilen:" : "WhatsApp ist nicht verbunden – Text zum Teilen:", link: url, text };
  }
}

// ─── Planen und Senden ──────────────────────────────────────────────────────

async function activeCustomers() {
  return prisma.customer.findMany({
    where: { empfehlungEnabled: true, plan: { not: "service" }, archived: false },
    select: { id: true, empfehlungSince: true },
  });
}

/** Neue Abschlüsse einplanen (je Lead genau eine Anfrage). */
export async function scheduleReviewRequests(now = new Date()): Promise<number> {
  let created = 0;
  for (const c of await activeCustomers()) {
    const settings = await loadSettings(c.id);
    if (!settings.active) continue;
    const since = new Date(Math.max(c.empfehlungSince?.getTime() ?? now.getTime(), now.getTime() - MAX_AGE_DAYS * DAY_MS));
    const leads = await prisma.lead.findMany({
      where: { customerId: c.id, status: CLOSED, erasedAt: null, phone: { not: null }, closedAt: { gte: since }, reviewRequest: null },
      select: { id: true, closedAt: true },
      take: 200,
    });
    for (const l of leads) {
      const closedAt = l.closedAt ?? now;
      try {
        await prisma.reviewRequest.create({
          data: {
            customerId: c.id,
            leadId: l.id,
            token: newToken(),
            reviewDueAt: new Date(closedAt.getTime() + settings.reviewDelayDays * DAY_MS),
            referralDueAt: new Date(closedAt.getTime() + settings.referralDelayDays * DAY_MS),
          },
        });
        created++;
      } catch {
        // schon vorhanden (eindeutig je Lead)
      }
    }
  }
  return created;
}

/** Fällige Nachfragen senden: an alle dieselbe Nachricht (direkter Draht, dann Google-Link). */
export async function sendDueReviews(now = new Date()): Promise<{ sent: number; waiting: number; skipped: number }> {
  const out = { sent: 0, waiting: 0, skipped: 0 };
  if (!sendingWindow(now)) return out;
  const due = await prisma.reviewRequest.findMany({
    where: { status: "scheduled", reviewDueAt: { lte: now }, customer: { empfehlungEnabled: true } },
    include: { lead: { select: { id: true, name: true, phone: true, status: true, closedAt: true, erasedAt: true } } },
    orderBy: { reviewDueAt: "asc" },
    take: PER_RUN,
  });
  const { sendWhatsAppNotice, NoTemplateError } = await import("@/lib/whatsapp/templates");
  for (const r of due) {
    const settings = await loadSettings(r.customerId);
    if (!settings.active) continue;
    const lead = r.lead;
    if (lead.erasedAt || !lead.phone || lead.status !== CLOSED) {
      await prisma.reviewRequest.update({ where: { id: r.id }, data: { status: "skipped", note: lead.status !== CLOSED ? "Kein Abschluss mehr" : "Keine Handynummer" } });
      out.skipped++;
      continue;
    }
    if (lead.closedAt && now.getTime() - lead.closedAt.getTime() > (MAX_AGE_DAYS + 14) * DAY_MS) {
      await prisma.reviewRequest.update({ where: { id: r.id }, data: { status: "skipped", note: "Abschluss zu lange her" } });
      out.skipped++;
      continue;
    }
    if (!settings.googleReviewUrl) {
      await prisma.reviewRequest.update({ where: { id: r.id }, data: { note: "Google-Bewertungslink fehlt (Einstellungen)", reviewDueAt: new Date(now.getTime() + 6 * 3600_000) } });
      out.waiting++;
      continue;
    }
    // Claim: dieselbe Anfrage nie doppelt senden (parallele Cron-Läufe)
    const claimed = await prisma.reviewRequest.updateMany({ where: { id: r.id, status: "scheduled" }, data: { status: "sending" } });
    if (claimed.count === 0) continue;
    const vertreter = await advisorOf(r.customerId);
    const link = googleLinkFor(r.token);
    const vorname = firstName(lead.name);
    try {
      const res = await sendWhatsAppNotice({
        customerId: r.customerId,
        to: lead.phone,
        purpose: "review_request",
        params: [vorname || "Hallo", link],
        text: renderText(settings.texts.review, { vorname, link, vertreter }),
        leadId: lead.id,
        contactName: lead.name,
      });
      await prisma.reviewRequest.update({
        where: { id: r.id },
        data: { status: "sent", reviewSentAt: now, sendMode: res.mode, conversationId: res.conversationId, note: null },
      });
      out.sent++;
    } catch (err) {
      const waitMsg = err instanceof NoTemplateError ? "Warte auf Freigabe der WhatsApp-Vorlage" : /verbundenes WhatsApp/.test(String(err)) ? "WhatsApp nicht verbunden" : null;
      if (!waitMsg) reportError(err, "empfehlung-review-send", { request: r.id });
      await prisma.reviewRequest.update({
        where: { id: r.id },
        data: { status: "scheduled", note: waitMsg ?? "Senden fehlgeschlagen, neuer Versuch später", reviewDueAt: new Date(now.getTime() + 6 * 3600_000) },
      });
      out.waiting++;
    }
  }
  return out;
}

/** Fällige Bitten um Empfehlung senden (nicht bei Kritik oder offener Aufgabe „unzufrieden“). */
export async function sendDueReferrals(now = new Date()): Promise<{ sent: number; skipped: number }> {
  const out = { sent: 0, skipped: 0 };
  if (!sendingWindow(now)) return out;
  const due = await prisma.reviewRequest.findMany({
    where: { referralStatus: "waiting", referralDueAt: { lte: now }, status: { in: ["sent", "answered", "off", "skipped"] }, customer: { empfehlungEnabled: true } },
    include: { lead: { select: { id: true, name: true, phone: true, status: true, followUpNote: true, erasedAt: true } } },
    orderBy: { referralDueAt: "asc" },
    take: PER_RUN,
  });
  const { sendWhatsAppNotice, NoTemplateError } = await import("@/lib/whatsapp/templates");
  for (const r of due) {
    const settings = await loadSettings(r.customerId);
    if (!settings.active) continue;
    const block = r.status === "skipped" ? { skip: r.note ?? "Nachfrage übersprungen" } : referralBlocker(r, r.lead);
    if (block && "skip" in block) {
      await prisma.reviewRequest.update({ where: { id: r.id }, data: { referralStatus: "skipped", note: block.skip } });
      out.skipped++;
      continue;
    }
    if (block) {
      await prisma.reviewRequest.update({ where: { id: r.id }, data: { referralDueAt: new Date(now.getTime() + DAY_MS) } });
      continue;
    }
    const claimed = await prisma.reviewRequest.updateMany({ where: { id: r.id, referralStatus: "waiting" }, data: { referralStatus: "sending" } });
    if (claimed.count === 0) continue;
    const link = await referralLinkOf({ customerId: r.customerId, leadId: r.leadId });
    const url = referralLinkFor(link.token);
    const vertreter = await advisorOf(r.customerId);
    const vorname = firstName(r.lead.name);
    try {
      await sendWhatsAppNotice({
        customerId: r.customerId,
        to: r.lead.phone!,
        purpose: "referral_request",
        params: [vorname || "Hallo", url],
        text: renderText(settings.texts.referral, { vorname, link: url, vertreter }),
        leadId: r.leadId,
        contactName: r.lead.name,
      });
      await prisma.$transaction([
        prisma.reviewRequest.update({ where: { id: r.id }, data: { referralStatus: "sent", referralSentAt: now } }),
        prisma.referralLink.update({ where: { id: link.id }, data: { lastSentAt: now } }),
      ]);
      out.sent++;
    } catch (err) {
      if (!(err instanceof NoTemplateError)) reportError(err, "empfehlung-referral-send", { request: r.id });
      await prisma.reviewRequest.update({ where: { id: r.id }, data: { referralStatus: "waiting", referralDueAt: new Date(now.getTime() + 6 * 3600_000) } });
    }
  }
  return out;
}

/** Dank an Empfehlende, sobald aus ihrer Empfehlung ein Abschluss wird (genau einmal, ohne Prämie). */
export async function sendReferralThanks(now = new Date()): Promise<number> {
  if (!sendingWindow(now)) return 0;
  const leads = await prisma.lead.findMany({
    where: {
      referralLinkId: { not: null },
      status: CLOSED,
      referralThankedAt: null,
      closedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) },
      customer: { empfehlungEnabled: true },
    },
    select: {
      id: true,
      customerId: true,
      referralLink: {
        select: {
          lead: { select: { id: true, name: true, phone: true, erasedAt: true } },
          existingCustomer: { select: { firstName: true, lastName: true, phone: true, optOutAt: true } },
        },
      },
    },
    take: PER_RUN,
  });
  const { sendWhatsAppNotice, NoTemplateError } = await import("@/lib/whatsapp/templates");
  let sent = 0;
  for (const l of leads) {
    const claimed = await prisma.lead.updateMany({ where: { id: l.id, referralThankedAt: null }, data: { referralThankedAt: now } });
    if (claimed.count === 0) continue;
    const ref = l.referralLink;
    const target = ref?.lead && !ref.lead.erasedAt
      ? { name: ref.lead.name, phone: ref.lead.phone, leadId: ref.lead.id }
      : ref?.existingCustomer && !ref.existingCustomer.optOutAt
        ? { name: [ref.existingCustomer.firstName, ref.existingCustomer.lastName].filter(Boolean).join(" "), phone: ref.existingCustomer.phone, leadId: null }
        : null;
    if (!target?.phone) continue;
    const settings = await loadSettings(l.customerId);
    const vertreter = await advisorOf(l.customerId);
    const vorname = firstName(target.name);
    try {
      await sendWhatsAppNotice({
        customerId: l.customerId,
        to: target.phone,
        purpose: "referral_thanks",
        params: [vorname || "Hallo"],
        text: renderText(settings.texts.referralThanks, { vorname, vertreter }),
        leadId: target.leadId,
        contactName: target.name,
      });
      sent++;
    } catch (err) {
      if (err instanceof NoTemplateError || /verbundenes WhatsApp/.test(String(err))) {
        // Vorlage fehlt: später noch einmal versuchen
        await prisma.lead.update({ where: { id: l.id }, data: { referralThankedAt: null } });
      } else reportError(err, "empfehlung-thanks", { lead: l.id });
    }
  }
  return sent;
}

/**
 * Rückmeldung an Empfehlende: „hat sich gemeldet“ und „Termin vereinbart“. Nur mit Einwilligung
 * der empfohlenen Person, nur bei Links eines Kontakts, je Stufe einmal, ohne Prämie.
 */
export async function sendReferralUpdates(now = new Date()): Promise<number> {
  if (!sendingWindow(now)) return 0;
  const leads = await prisma.lead.findMany({
    where: {
      referralLinkId: { not: null },
      referralStatusConsent: true,
      erasedAt: null,
      createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) },
      OR: [{ referralNotifiedStage: null }, { referralNotifiedStage: "gemeldet", appointments: { some: { status: { in: ["booked", "completed"] } } } }],
      customer: { empfehlungEnabled: true },
      referralLink: { kind: "contact" },
    },
    select: {
      id: true,
      customerId: true,
      name: true,
      referralNotifiedStage: true,
      _count: { select: { appointments: { where: { status: { in: ["booked", "completed"] } } } } },
      referralLink: {
        select: {
          lead: { select: { id: true, name: true, phone: true, erasedAt: true, reviewRequest: { select: { note: true } } } },
          existingCustomer: { select: { firstName: true, lastName: true, phone: true, optOutAt: true } },
        },
      },
    },
    take: PER_RUN,
  });
  const { sendWhatsAppNotice, NoTemplateError } = await import("@/lib/whatsapp/templates");
  let sent = 0;
  for (const l of leads) {
    const stage: UpdateStage = l._count.appointments > 0 ? "termin" : "gemeldet";
    const claimed = await prisma.lead.updateMany({ where: { id: l.id, referralNotifiedStage: l.referralNotifiedStage }, data: { referralNotifiedStage: stage } });
    if (claimed.count === 0) continue;
    const settings = await loadSettings(l.customerId);
    if (!settings.statusUpdates) continue;
    const ref = l.referralLink;
    const optedOut = /keine Nachrichten/i.test(ref?.lead?.reviewRequest?.note ?? "");
    const target = ref?.lead && !ref.lead.erasedAt && !optedOut
      ? { name: ref.lead.name, phone: ref.lead.phone, leadId: ref.lead.id }
      : ref?.existingCustomer && !ref.existingCustomer.optOutAt
        ? { name: [ref.existingCustomer.firstName, ref.existingCustomer.lastName].filter(Boolean).join(" "), phone: ref.existingCustomer.phone, leadId: null }
        : null;
    if (!target?.phone) continue;
    const vertreter = await advisorOf(l.customerId);
    const vorname = firstName(target.name);
    const referred = firstName(l.name);
    try {
      await sendWhatsAppNotice({
        customerId: l.customerId,
        to: target.phone,
        purpose: "referral_update",
        params: [vorname || "Hallo", statusUpdateLine(stage, referred)],
        text: statusUpdateText(stage, { vorname, referred, vertreter }),
        leadId: target.leadId,
        contactName: target.name,
      });
      sent++;
    } catch (err) {
      if (err instanceof NoTemplateError || /verbundenes WhatsApp/.test(String(err))) {
        // Vorlage fehlt noch: später noch einmal versuchen
        await prisma.lead.update({ where: { id: l.id }, data: { referralNotifiedStage: l.referralNotifiedStage } });
      } else reportError(err, "empfehlung-update", { lead: l.id });
    }
  }
  return sent;
}

/**
 * Dankeschön für Empfehlende: sobald der Anlass erreicht ist (Termin stattgefunden bzw. Abschluss),
 * wird es als „offen“ vorgemerkt und der Vertreter bekommt eine Aufgabe. Übergeben wird von Hand.
 * Nie für Selbstempfehlungen, nie über den allgemeinen Link, nie für die empfohlene Person.
 */
export async function planReferralRewards(now = new Date()): Promise<number> {
  const customers = await prisma.reviewSettings.findMany({
    where: { rewardKind: { not: "none" }, rewardConfirmedAt: { not: null }, customer: { empfehlungEnabled: true, archived: false } },
    select: { customerId: true, rewardKind: true, rewardAmount: true, rewardNote: true, rewardTrigger: true, rewardConfirmedAt: true },
  });
  let planned = 0;
  for (const c of customers) {
    const reward = resolveReward(c);
    if (!reward || !c.rewardConfirmedAt) continue;
    const leads = await prisma.lead.findMany({
      where: {
        customerId: c.customerId,
        referralLinkId: { not: null },
        referralLink: { kind: "contact" },
        referralRewardStatus: null,
        erasedAt: null,
        // nur Empfehlungen, die nach dem Einschalten des Dankeschöns kamen
        createdAt: { gte: c.rewardConfirmedAt },
        ...(reward.trigger === "abschluss" ? { status: CLOSED } : { OR: [{ status: CLOSED }, { appointments: { some: { status: "completed" } } }] }),
      },
      select: { id: true, closedAt: true, referralLink: { select: { lead: { select: { id: true, name: true, followUpAt: true, erasedAt: true } }, existingCustomer: { select: { firstName: true, lastName: true } } } } },
      take: PER_RUN,
    });
    for (const l of leads) {
      const dueAt = reward.trigger === "abschluss" ? new Date((l.closedAt ?? now).getTime() + REWARD_WAIT_DAYS * DAY_MS) : now;
      const claimed = await prisma.lead.updateMany({ where: { id: l.id, referralRewardStatus: null }, data: { referralRewardStatus: "offen", referralRewardDueAt: dueAt } });
      if (claimed.count === 0) continue;
      planned++;
      // Aufgabe in „Heute“ am Kontakt des Empfehlenden, wenn dort keine andere Wiedervorlage steht
      const rec = l.referralLink?.lead;
      if (rec && !rec.erasedAt && !rec.followUpAt) {
        await prisma.lead.updateMany({ where: { id: rec.id, followUpAt: null }, data: { followUpAt: dueAt, followUpNote: rewardTaskNote(reward, rec.name) } }).catch(() => {});
      }
    }
  }
  return planned;
}

/** Offene Dankeschöns für die Liste im Modul. */
export async function openRewards(customerId: string) {
  const settings = await loadSettings(customerId);
  const rows = await prisma.lead.findMany({
    where: { customerId, referralRewardStatus: "offen" },
    orderBy: { referralRewardDueAt: "asc" },
    take: 50,
    select: {
      id: true,
      name: true,
      referralRewardDueAt: true,
      referralLink: { select: { lead: { select: { id: true, name: true } }, existingCustomer: { select: { firstName: true, lastName: true } } } },
    },
  });
  return rows.map((r) => ({
    leadId: r.id,
    referred: firstName(r.name) || "Empfehlung",
    recommender: r.referralLink?.lead?.name ?? ([r.referralLink?.existingCustomer?.firstName, r.referralLink?.existingCustomer?.lastName].filter(Boolean).join(" ") || "Kunde"),
    recommenderLeadId: r.referralLink?.lead?.id ?? null,
    dueAt: r.referralRewardDueAt,
    label: settings.reward ? rewardLabel(settings.reward) : "Dankeschön",
  }));
}

/** „Übergeben“ bzw. „Entfällt“ (z. B. Vertrag storniert). */
export async function settleReward(customerId: string, leadId: string, outcome: "erledigt" | "entfaellt", now = new Date()): Promise<boolean> {
  const r = await prisma.lead.updateMany({ where: { id: leadId, customerId, referralRewardStatus: "offen" }, data: { referralRewardStatus: outcome, referralRewardDoneAt: now } });
  return r.count > 0;
}

/**
 * Eingehende WhatsApp-Nachricht mit Empfehlungs-Code (Knopf auf der Empfehlungsseite): Ist der
 * Absender noch kein Kontakt, entsteht ein Lead mit Quelle „Empfehlung“, verknüpft mit dem Chat.
 * Der Assistent bzw. der Vertreter antwortet danach ganz normal (kein Erstanschreiben).
 */
export async function handleReferralInbound(conversationId: string, from: string, body: string | null, contactName: string | null, now = new Date()): Promise<{ leadId: string | null }> {
  const code = parseRefCode(body);
  if (!code) return { leadId: null };
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { customerId: true, leadId: true } });
  if (!conv || conv.leadId) return { leadId: null };
  const link = await prisma.referralLink.findFirst({
    where: { customerId: conv.customerId, token: { startsWith: code }, customer: { empfehlungEnabled: true } },
    select: {
      id: true,
      kind: true,
      lead: { select: { name: true, phone: true, erasedAt: true } },
      existingCustomer: { select: { firstName: true, lastName: true, phone: true } },
    },
  });
  if (!link || link.lead?.erasedAt) return { leadId: null };
  const recName = link.kind === "general" ? null : (link.lead?.name ?? ([link.existingCustomer?.firstName, link.existingCustomer?.lastName].filter(Boolean).join(" ") || "Kunde"));
  const self = isSelfReferral(link.lead?.phone ?? link.existingCustomer?.phone, from);
  const stamp = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }).format(now);
  const rs = await prisma.reviewSettings.findUnique({ where: { customerId: conv.customerId }, select: { offerKind: true, offerHeadline: true, offerText: true } });
  const offer = rs ? resolveOffer(rs, await advisorOf(conv.customerId)) : null;
  const lead = await prisma.lead.create({
    data: {
      customerId: conv.customerId,
      source: "Empfehlung",
      adChannel: "Empfehlung",
      name: contactName,
      phone: from,
      status: "Neuer Lead",
      referralLinkId: link.id,
      referralRewardStatus: self ? "entfaellt" : null,
      // Die Person hat selbst geschrieben: kein automatisches Erstanschreiben
      outreachAt: now,
      outreachStatus: "skipped_contact",
      formData: [
        { label: "Quelle", value: recName ? `Empfehlung von ${recName}` : "Empfehlung (allgemeiner Link: Aufsteller oder E-Mail-Signatur)" },
        ...(offer ? [{ label: "Angebot", value: offer.headline }] : []),
        { label: "Kontakt", value: `Hat selbst per WhatsApp geschrieben (Empfehlungsseite, ${stamp})` },
      ],
    },
    select: { id: true },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { leadId: lead.id } });
  const { processNewLead } = await import("@/lib/lead-intake");
  await processNewLead(lead.id).catch((err) => reportError(err, "empfehlung-lead-whatsapp", { lead: lead.id }));
  return { leadId: lead.id };
}

/**
 * Aufsteller/Signatur: Ein Kunde gibt auf der allgemeinen Seite seine Handynummer an und bekommt
 * seinen persönlichen Link (damit die Empfehlung ihm zugeordnet wird). null = Nummer nicht gefunden.
 */
export async function claimPersonalLink(generalToken: string, phone: string, now = new Date()): Promise<string | null> {
  const general = await prisma.referralLink.findUnique({ where: { token: generalToken }, select: { customerId: true, kind: true, customer: { select: { empfehlungEnabled: true } } } });
  if (!general || general.kind !== "general" || !general.customer.empfehlungEnabled) return null;
  const customerId = general.customerId;
  const lead = await prisma.lead.findFirst({
    where: { customerId, phone, erasedAt: null, OR: [{ status: CLOSED }, { source: "Bestandskunde" }] },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const existing = lead ? null : await prisma.existingCustomer.findFirst({ where: { customerId, phone, optOutAt: null }, select: { id: true } });
  if (!lead && !existing) return null;
  const link = await referralLinkOf({ customerId, leadId: lead?.id, existingCustomerId: existing?.id });
  await prisma.referralLink.update({ where: { id: link.id }, data: { lastSentAt: now, lastOccasion: "aufsteller" } });
  return link.token;
}

/**
 * Nach einem stattgefundenen Termin mit einem Kunden (Abschluss oder Bestandskunde): Empfehlungslink
 * mit dem Text „nach dem Gespräch“. Nur wenn eingeschaltet, höchstens alle 180 Tage je Kontakt,
 * nicht bei Kritik oder offener Aufgabe „unzufrieden“, nicht solange die Nachfrage nach dem Abschluss läuft.
 */
export async function sendAfterAppointmentReferrals(now = new Date()): Promise<{ sent: number; skipped: number }> {
  const out = { sent: 0, skipped: 0 };
  if (!sendingWindow(now)) return out;
  const appts = await prisma.appointment.findMany({
    where: {
      status: "completed",
      referralAskedAt: null,
      leadId: { not: null },
      // „stattgefunden“ wurde vor 2 Stunden bis 3 Tagen gesetzt
      updatedAt: { gte: new Date(now.getTime() - 3 * DAY_MS), lte: new Date(now.getTime() - 2 * 3600_000) },
      customer: { empfehlungEnabled: true, archived: false, reviewSettings: { active: true, referralAfterAppointment: true } },
    },
    select: {
      id: true,
      customerId: true,
      lead: { select: { id: true, name: true, phone: true, status: true, source: true, followUpNote: true, erasedAt: true, reviewRequest: { select: { status: true, sentiment: true, referralStatus: true, note: true } }, ownReferralLink: { select: { lastSentAt: true } } } },
    },
    orderBy: { updatedAt: "asc" },
    take: PER_RUN,
  });
  const { sendWhatsAppNotice, NoTemplateError } = await import("@/lib/whatsapp/templates");
  for (const a of appts) {
    const claimed = await prisma.appointment.updateMany({ where: { id: a.id, referralAskedAt: null }, data: { referralAskedAt: now } });
    if (claimed.count === 0) continue;
    const l = a.lead;
    const rr = l?.reviewRequest;
    const recent = l?.ownReferralLink?.lastSentAt && now.getTime() - l.ownReferralLink.lastSentAt.getTime() < APPOINTMENT_REFERRAL_GAP_DAYS * DAY_MS;
    const blocked =
      !l || l.erasedAt || !l.phone || !(l.status === CLOSED || l.source === "Bestandskunde") || recent || isUnhappyTask(l.followUpNote) ||
      rr?.sentiment === "negative" || rr?.status === "off" || /keine Nachrichten/i.test(rr?.note ?? "") ||
      // Die Nachfrage nach dem Abschluss läuft noch: Die Bitte kommt über diesen Ablauf
      (rr && rr.referralStatus === "waiting" && (rr.status === "scheduled" || rr.status === "sending" || rr.status === "sent"));
    if (blocked || !l) {
      out.skipped++;
      continue;
    }
    const link = await referralLinkOf({ customerId: a.customerId, leadId: l.id });
    const url = referralLinkFor(link.token);
    const vertreter = await advisorOf(a.customerId);
    const vorname = firstName(l.name);
    try {
      await sendWhatsAppNotice({
        customerId: a.customerId,
        to: l.phone!,
        purpose: "referral_request",
        params: [vorname || "Hallo", url],
        text: renderText(OCCASIONS.jahresgespraech.text, { vorname, link: url, vertreter }),
        leadId: l.id,
        contactName: l.name,
      });
      await prisma.referralLink.update({ where: { id: link.id }, data: { lastSentAt: now, lastOccasion: "termin_auto" } });
      out.sent++;
    } catch (err) {
      if (err instanceof NoTemplateError || /verbundenes WhatsApp/.test(String(err))) {
        // Vorlage fehlt noch: beim nächsten Lauf erneut versuchen
        await prisma.appointment.update({ where: { id: a.id }, data: { referralAskedAt: null } }).catch(() => {});
      } else reportError(err, "empfehlung-after-appointment", { appointment: a.id });
    }
  }
  return out;
}

/** Alles, was der Cron fürs Modul erledigt. */
export async function runEmpfehlungen(now = new Date()) {
  const { processEmpfehlungBilling } = await import("@/lib/empfehlung/module");
  const billing = await processEmpfehlungBilling(now);
  const scheduled = await scheduleReviewRequests(now);
  const reviews = await sendDueReviews(now);
  const referrals = await sendDueReferrals(now);
  const thanks = await sendReferralThanks(now);
  const updates = await sendReferralUpdates(now).catch((err) => {
    reportError(err, "empfehlung-updates");
    return 0;
  });
  const afterAppointments = await sendAfterAppointmentReferrals(now).catch((err) => {
    reportError(err, "empfehlung-after-appointment");
    return null;
  });
  const rewards = await planReferralRewards(now).catch((err) => {
    reportError(err, "empfehlung-rewards");
    return 0;
  });
  // Bewertungs-Wächter: neue Google-Bewertungen (je Kunde höchstens alle 45 Min.)
  const { runWaechter } = await import("@/lib/empfehlung/google-business");
  const waechter = await runWaechter(now).catch((err) => {
    reportError(err, "empfehlung-waechter");
    return null;
  });
  return { billing, scheduled, reviews, referrals, thanks, updates, afterAppointments, rewards, waechter };
}

// ─── Antworten auswerten ────────────────────────────────────────────────────

/** KI ordnet die Antwort ein (Kritik/Beschwerde = negativ). Ohne Schlüssel oder bei Fehler: einfache Regeln. */
export async function classifyReply(text: string): Promise<Sentiment> {
  const fallback = classifyHeuristic(text);
  if (!process.env.ANTHROPIC_API_KEY || !text.trim()) return fallback;
  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      system:
        "Ein Versicherungsvertreter hat seinem Kunden einige Tage nach dem Vertragsabschluss geschrieben: ob alles gepasst hat, und wenn ja, um eine Google-Bewertung gebeten. Ordne die Antwort des Kunden ein. negative = Kritik, Beschwerde, Ärger, Enttäuschung, Problem oder Wunsch nach Klärung/Kündigung. positive = Zufriedenheit, Dank, Lob. neutral = alles andere (Fragen, organisatorisches, unklar). Im Zweifel zwischen negativ und neutral: negative.",
      tools: [
        {
          name: "save_sentiment",
          description: "Speichert die Einordnung der Antwort.",
          input_schema: { type: "object", properties: { sentiment: { type: "string", enum: ["positive", "negative", "neutral"] } }, required: ["sentiment"] },
        },
      ],
      tool_choice: { type: "tool", name: "save_sentiment" },
      messages: [{ role: "user", content: `Antwort des Kunden:\n\n${text.slice(0, 2000)}` }],
    });
    const tool = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const s = (tool?.input as { sentiment?: string } | undefined)?.sentiment;
    // Sicherheitsnetz: Erkennen die Regeln Kritik, gilt die Antwort als negativ
    if (fallback === "negative") return "negative";
    return s === "positive" || s === "negative" || s === "neutral" ? s : fallback;
  } catch (err) {
    reportError(err, "empfehlung-classify");
    return fallback;
  }
}

const STOP = /^\s*(stopp?|stop|abmelden|keine (weiteren )?nachrichten( mehr)?|nicht mehr (schreiben|kontaktieren))\b/i;

/**
 * Eingehende WhatsApp-Nachricht: Antwort auf die Nachfrage nach dem Abschluss?
 * handled = true → Assistent antwortet nicht (das übernimmt dieser Ablauf bzw. der Vertreter).
 */
export async function handleReviewReply(conversationId: string, from: string, body: string | null, now = new Date()): Promise<{ handled: boolean; sentiment?: Sentiment }> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { customerId: true, leadId: true } });
  if (!conv) return { handled: false };
  const text = (body ?? "").trim();

  // „Keine Nachrichten mehr“ nach der Bitte um Empfehlung
  if (text && STOP.test(text)) {
    const ref = await prisma.reviewRequest.findFirst({
      where: { customerId: conv.customerId, referralStatus: "sent", referralSentAt: { gte: new Date(now.getTime() - 30 * DAY_MS) }, lead: { phone: from } },
      select: { id: true },
    });
    if (ref) {
      await prisma.reviewRequest.update({ where: { id: ref.id }, data: { note: "Möchte keine Nachrichten mehr" } });
      await prisma.conversation.update({ where: { id: conversationId }, data: { botActive: false } });
      const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
      await sendWhatsAppMessage({ customerId: conv.customerId, to: from, body: "Alles klar, wir schreiben Ihnen hier keine weiteren Nachrichten.", sentBy: "system" }).catch(() => {});
      return { handled: true };
    }
  }

  const r = await prisma.reviewRequest.findFirst({
    where: {
      customerId: conv.customerId,
      status: "sent",
      reviewSentAt: { gte: new Date(now.getTime() - REPLY_WINDOW_DAYS * DAY_MS) },
      OR: [{ conversationId }, { lead: { phone: from } }],
    },
    orderBy: { reviewSentAt: "desc" },
    include: { lead: { select: { id: true, name: true } } },
  });
  if (!r || !text) return { handled: false };

  // Claim: nur die erste Antwort zählt
  const claimed = await prisma.reviewRequest.updateMany({ where: { id: r.id, status: "sent" }, data: { status: "answered", answeredAt: now, comment: text.slice(0, 1000) } });
  if (claimed.count === 0) return { handled: false };
  const sentiment = await classifyReply(text);
  const negative = sentiment === "negative";
  await prisma.reviewRequest.update({
    where: { id: r.id },
    data: { sentiment, ...(negative && r.referralStatus === "waiting" ? { referralStatus: "skipped", note: "Kritik geäußert" } : {}) },
  });
  const settings = await loadSettings(r.customerId);
  const vertreter = await advisorOf(r.customerId);
  const vorname = firstName(r.lead.name);
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
  const quote = text.length > 160 ? `${text.slice(0, 157)}…` : text;

  if (negative) {
    // Aufgabe in „Heute“ (Wiedervorlage am Lead) + dringender Push + „Braucht dich“ im Chat
    await prisma.lead.update({ where: { id: r.leadId }, data: { followUpAt: now, followUpNote: `${UNHAPPY_TASK}: „${quote}“` } });
    const { notifyLeadPush } = await import("@/lib/team");
    await notifyLeadPush(r.leadId, { title: `⚠️ Kunde unzufrieden: ${r.lead.name ?? "Kunde"}`, body: `„${quote}“ – bitte heute anrufen.`, tag: `empfehlung-unhappy:${r.leadId}`, url: `/buyer/leads/${r.leadId}` }).catch(() => {});
    const { flagAttention } = await import("@/lib/whatsapp/attention");
    await flagAttention(conversationId, `Kritik nach dem Abschluss: „${quote}“`).catch(() => {});
    await sendWhatsAppMessage({ customerId: r.customerId, to: from, body: renderText(settings.texts.unhappy, { vorname, vertreter }), sentBy: "system" }).catch((err) => reportError(err, "empfehlung-unhappy-reply"));
  } else if (sentiment === "positive") {
    // Bester Moment für die Empfehlung ist das Lob selbst: Dank mit persönlichem Link (Chat ist offen).
    // Bewusst ohne zweiten Google-Link. Die spätere Bitte um Empfehlung entfällt dann.
    const claimedReferral = settings.referralOnPraise
      ? (await prisma.reviewRequest.updateMany({ where: { id: r.id, referralStatus: "waiting" }, data: { referralStatus: "sending" } })).count > 0
      : false;
    if (claimedReferral) {
      const link = await referralLinkOf({ customerId: r.customerId, leadId: r.leadId });
      try {
        await sendWhatsAppMessage({ customerId: r.customerId, to: from, body: renderText(settings.texts.praiseReferral, { vorname, link: referralLinkFor(link.token), vertreter }), sentBy: "system" });
        await prisma.$transaction([
          prisma.reviewRequest.update({ where: { id: r.id }, data: { referralStatus: "sent", referralSentAt: now } }),
          prisma.referralLink.update({ where: { id: link.id }, data: { lastSentAt: now, lastOccasion: "lob" } }),
        ]);
      } catch (err) {
        reportError(err, "empfehlung-praise-referral");
        // Nicht verschickt → die Bitte um Empfehlung kommt wie geplant später
        await prisma.reviewRequest.update({ where: { id: r.id }, data: { referralStatus: "waiting" } }).catch(() => {});
      }
    } else {
      await sendWhatsAppMessage({ customerId: r.customerId, to: from, body: renderText(settings.texts.thanks, { vorname, vertreter }), sentBy: "system" }).catch((err) => reportError(err, "empfehlung-thanks-reply"));
    }
  } else {
    const { flagAttention } = await import("@/lib/whatsapp/attention");
    await flagAttention(conversationId, `Antwort auf die Nachfrage nach dem Abschluss: „${quote}“`).catch(() => {});
  }
  return { handled: true, sentiment };
}

// ─── Vertreter-Aktionen ─────────────────────────────────────────────────────

/** „Nicht anfragen“ je Kontakt (vom Vertreter, nie automatisch). on = false → wieder anfragen. */
export async function setReviewOptOut(customerId: string, leadId: string, off: boolean, now = new Date()): Promise<{ ok: boolean; error?: string }> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: { id: true, closedAt: true } });
  if (!lead) return { ok: false, error: "Kontakt nicht gefunden." };
  const existing = await prisma.reviewRequest.findUnique({ where: { leadId } });
  if (off) {
    if (existing && existing.status !== "scheduled" && existing.status !== "off") return { ok: false, error: "Die Nachfrage ist schon verschickt." };
    if (existing) await prisma.reviewRequest.update({ where: { id: existing.id }, data: { status: "off", note: "Nicht anfragen (vom Vertreter)" } });
    else {
      const s = await loadSettings(customerId);
      const closedAt = lead.closedAt ?? now;
      await prisma.reviewRequest.create({
        data: {
          customerId,
          leadId,
          token: newToken(),
          status: "off",
          note: "Nicht anfragen (vom Vertreter)",
          reviewDueAt: new Date(closedAt.getTime() + s.reviewDelayDays * DAY_MS),
          referralDueAt: new Date(closedAt.getTime() + s.referralDelayDays * DAY_MS),
        },
      });
    }
    return { ok: true };
  }
  if (existing?.status === "off") {
    const due = existing.reviewDueAt < now ? now : existing.reviewDueAt;
    await prisma.reviewRequest.update({ where: { id: existing.id }, data: { status: "scheduled", note: null, reviewDueAt: due } });
  }
  return { ok: true };
}

export async function markResolved(customerId: string, requestId: string, now = new Date()): Promise<boolean> {
  const r = await prisma.reviewRequest.updateMany({ where: { id: requestId, customerId, sentiment: "negative", resolvedAt: null }, data: { resolvedAt: now } });
  return r.count > 0;
}

// ─── Öffentliche Seiten ─────────────────────────────────────────────────────

/** Google-Link: Klick zählen, weiterleiten. null = unbekannt. */
export async function googleRedirect(token: string, now = new Date()): Promise<string | null> {
  const r = await prisma.reviewRequest.findUnique({ where: { token }, select: { id: true, customerId: true } });
  if (!r) return null;
  const s = await prisma.reviewSettings.findUnique({ where: { customerId: r.customerId }, select: { googleReviewUrl: true } });
  if (!s?.googleReviewUrl) return null;
  await prisma.reviewRequest.update({ where: { id: r.id }, data: { googleClicks: { increment: 1 }, googleClickAt: now } }).catch(() => {});
  return s.googleReviewUrl;
}

/** Empfehlungsseite: Link gültig, Modul aktiv. */
export async function loadReferralPage(token: string, opts: { countView?: boolean } = {}) {
  const link = await prisma.referralLink.findUnique({
    where: { token },
    select: {
      id: true,
      customerId: true,
      kind: true,
      lead: { select: { name: true, erasedAt: true } },
      existingCustomer: { select: { firstName: true } },
      token: true,
      customer: { select: { name: true, empfehlungEnabled: true, onboarding: { select: { websiteInfo: true } }, whatsAppAccount: { select: { status: true, phoneNumber: true } } } },
    },
  });
  if (!link || !link.customer.empfehlungEnabled || link.lead?.erasedAt) return null;
  if (opts.countView) await prisma.referralLink.update({ where: { id: link.id }, data: { views: { increment: 1 } } }).catch(() => {});
  const products = await prisma.leadSource.findMany({ where: { customerId: link.customerId, active: true }, select: { productKey: true }, distinct: ["productKey"] }).catch(() => []);
  const privacy = (link.customer.onboarding?.websiteInfo as { privacyUrl?: string | null } | null)?.privacyUrl;
  const vertreter = advisorDisplayName(link.customer.name);
  const rs = await prisma.reviewSettings.findUnique({
    where: { customerId: link.customerId },
    select: { offerKind: true, offerHeadline: true, offerText: true, statusUpdates: true, rewardKind: true, rewardAmount: true, rewardNote: true, rewardTrigger: true, rewardConfirmedAt: true },
  });
  const reward = rs?.rewardConfirmedAt && link.kind !== "general" ? resolveReward(rs) : null;
  const wa = link.customer.whatsAppAccount;
  const recommenderName = firstName(link.lead?.name ?? link.existingCustomer?.firstName ?? null) || null;
  return {
    customerId: link.customerId,
    linkId: link.id,
    general: link.kind === "general",
    // Nur auf der Seite des Empfehlenden zeigen, nie der empfohlenen Person
    rewardText: reward ? rewardSentence(reward, vertreter) : null,
    // Ein Tipp statt Formular: vorgeschriebene Anfrage an die WhatsApp-Nummer des Vertreters
    whatsappUrl:
      wa?.status === "connected" && wa.phoneNumber
        ? whatsappLink(wa.phoneNumber, whatsappRequestText({ vertreter, recommender: recommenderName, offer: rs ? resolveOffer(rs, vertreter) : null, token: link.token }))
        : null,
    offer: (rs ? resolveOffer(rs, vertreter) : null) as ResolvedOffer | null,
    // Rückmeldung an den Empfehlenden nur bei Links eines Kontakts
    statusUpdates: (rs?.statusUpdates ?? true) && link.kind !== "general",
    vertreter,
    recommender: recommenderName,
    topics: [...new Set(products.map((p) => p.productKey).filter(Boolean))].slice(0, 6) as string[],
    privacyUrl: privacy && /^https?:\/\//.test(privacy) ? privacy : process.env.BOOKING_PRIVACY_URL ?? "https://performancegrowth.de/datenschutz",
  };
}

const BOT_UA = /bot|crawl|spider|preview|whatsapp|facebookexternalhit|slack|telegram|discord|curl|wget|headless|monitor/i;

/**
 * Einzelne Besucher der Kontaktseite zählen (Personen statt Klicks): je Link und Besucher einmal.
 * Gespeichert wird nur ein gekürzter Hash, keine IP. Link-Vorschauen (WhatsApp & Co.) zählen nicht.
 */
export async function countReferralVisit(page: { linkId: string; customerId: string }, visitor: { ip: string; userAgent: string | null }): Promise<void> {
  const ua = visitor.userAgent ?? "";
  if (!ua || BOT_UA.test(ua)) return;
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "pg-empfehlung";
  const visitorHash = crypto.createHash("sha256").update(`${page.linkId}|${visitor.ip}|${ua}|${secret}`).digest("base64url").slice(0, 32);
  await prisma.referralVisit.create({ data: { linkId: page.linkId, customerId: page.customerId, visitorHash } }).catch(() => {
    // schon gezählt (eindeutig je Link und Besucher)
  });
}

export type ReferralSubmit = { name: string; phone: string; email: string | null; topic: string | null; message: string | null; consent: boolean; statusConsent?: boolean };

/** Empfohlene Person trägt sich selbst ein → normaler Lead mit Quelle „Empfehlung“ und Erstkontakt-Automatik. */
export async function submitReferral(token: string, input: ReferralSubmit, now = new Date()): Promise<{ ok: true; leadId: string | null } | { ok: false; error: "invalid" | "consent" | "busy" | "unavailable" }> {
  if (!input.consent) return { ok: false, error: "consent" };
  const page = await loadReferralPage(token);
  if (!page) return { ok: false, error: "unavailable" };
  const recent = await prisma.lead.count({ where: { referralLinkId: page.linkId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } } });
  if (recent >= 5) return { ok: false, error: "busy" };
  // Doppelte Eintragung (gleiche Nummer in 30 Tagen) → kein zweiter Lead
  const dup = await prisma.lead.findFirst({ where: { customerId: page.customerId, phone: input.phone, createdAt: { gt: new Date(now.getTime() - 30 * DAY_MS) } }, select: { id: true } });
  if (dup) return { ok: true, leadId: null };
  const recommender = await prisma.referralLink.findUnique({
    where: { id: page.linkId },
    select: { lead: { select: { name: true, phone: true } }, existingCustomer: { select: { firstName: true, lastName: true, phone: true } } },
  });
  // Selbstempfehlung (gleiche Nummer wie der Empfehlende): Lead ja, Dankeschön nein
  const self = isSelfReferral(recommender?.lead?.phone ?? recommender?.existingCustomer?.phone, input.phone);
  const recName = page.general
    ? null
    : (recommender?.lead?.name ?? ([recommender?.existingCustomer?.firstName, recommender?.existingCustomer?.lastName].filter(Boolean).join(" ") || "Kunde"));
  const statusConsent = !!input.statusConsent && page.statusUpdates;
  const stamp = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }).format(now);
  const lead = await prisma.lead.create({
    data: {
      customerId: page.customerId,
      source: "Empfehlung",
      adChannel: "Empfehlung",
      name: input.name,
      phone: input.phone,
      email: input.email,
      status: "Neuer Lead",
      referralLinkId: page.linkId,
      referralStatusConsent: statusConsent && !self,
      referralRewardStatus: self ? "entfaellt" : null,
      formData: [
        { label: "Quelle", value: recName ? `Empfehlung von ${recName}` : "Empfehlung (allgemeiner Link: Aufsteller oder E-Mail-Signatur)" },
        ...(page.offer ? [{ label: "Angebot", value: page.offer.headline }] : []),
        ...(input.topic ? [{ label: "Thema", value: input.topic }] : []),
        ...(input.message ? [{ label: "Nachricht", value: input.message }] : []),
        { label: "Einwilligung", value: `Kontaktaufnahme per Telefon, WhatsApp und E-Mail erlaubt (Empfehlungsseite, ${stamp})` },
        ...(statusConsent ? [{ label: "Rückmeldung an Empfehlende/n", value: `erlaubt: dass ich mich gemeldet habe und ob ein Termin zustande kam (${stamp})` }] : []),
      ],
    },
    select: { id: true },
  });
  const { processNewLead } = await import("@/lib/lead-intake");
  await processNewLead(lead.id).catch((err) => reportError(err, "empfehlung-lead", { lead: lead.id }));
  return { ok: true, leadId: lead.id };
}

// ─── Auswertung ─────────────────────────────────────────────────────────────

export async function loadEmpfehlungStats(customerId: string, days = 90, now = new Date()) {
  const since = new Date(now.getTime() - days * DAY_MS);
  const requests = await prisma.reviewRequest.findMany({
    where: { customerId, OR: [{ reviewSentAt: { gte: since } }, { referralSentAt: { gte: since } }] },
    select: { reviewSentAt: true, sentiment: true, resolvedAt: true, googleClicks: true, referralSentAt: true },
  });
  const sent = requests.filter((r) => r.reviewSentAt && r.reviewSentAt >= since);
  const referred = await prisma.lead.findMany({
    where: { customerId, referralLinkId: { not: null }, createdAt: { gte: since } },
    select: { id: true, status: true, source: true, closeValue: true, _count: { select: { appointments: true } } },
  });
  const closed = referred.filter((l) => l.status === CLOSED);
  const rates = (await loadCustomerProvision(customerId).catch(() => null))?.rates;
  const provision = closed.reduce((n, l) => n + (estimatedProvision(l.source, l.closeValue, rates) ?? 0), 0);
  const links = await prisma.referralLink.aggregate({ where: { customerId }, _sum: { views: true } });
  // Trichter: Links ausgegeben → vom Kunden geöffnet → einzelne Besucher → Empfehlungen → Neukunden
  const [linksSent, linksOpened, visitors] = await Promise.all([
    prisma.referralLink.count({ where: { customerId, kind: "contact", lastSentAt: { gte: since } } }),
    prisma.referralLink.count({ where: { customerId, kind: "contact", lastSentAt: { gte: since }, views: { gt: 0 } } }),
    prisma.referralVisit.count({ where: { customerId, createdAt: { gte: since } } }),
  ]);
  const funnel = { linksSent, linksOpened, visitors, leads: referred.length, closings: closed.length };
  return {
    funnel,
    hint: funnelHint(funnel),
    days,
    asked: sent.length,
    googleClicks: sent.reduce((n, r) => n + r.googleClicks, 0),
    googleClickers: sent.filter((r) => r.googleClicks > 0).length,
    positive: sent.filter((r) => r.sentiment === "positive").length,
    negative: sent.filter((r) => r.sentiment === "negative").length,
    neutral: sent.filter((r) => r.sentiment === "neutral").length,
    resolved: sent.filter((r) => r.sentiment === "negative" && r.resolvedAt).length,
    referralsAsked: requests.filter((r) => r.referralSentAt && r.referralSentAt >= since).length,
    referralViews: links._sum.views ?? 0,
    referralLeads: referred.length,
    referralMeetings: referred.filter((l) => l._count.appointments > 0).length,
    referralClosings: closed.length,
    referralProvision: Math.round(provision),
  };
}
export type EmpfehlungStats = Awaited<ReturnType<typeof loadEmpfehlungStats>>;

/** Letzte Anfragen für die Liste im Modul. */
export async function recentRequests(customerId: string, take = 30) {
  return prisma.reviewRequest.findMany({
    where: { customerId },
    orderBy: [{ updatedAt: "desc" }],
    take,
    select: {
      id: true,
      status: true,
      reviewDueAt: true,
      reviewSentAt: true,
      sentiment: true,
      comment: true,
      resolvedAt: true,
      googleClicks: true,
      referralStatus: true,
      referralSentAt: true,
      note: true,
      lead: { select: { id: true, name: true } },
    },
  });
}

/** Test an mich: Nachfrage an die eigene Nummer (Google-Link direkt, ohne Zählung). */
export async function sendTestMessage(customerId: string, phone: string): Promise<{ ok: true; mode: string } | { ok: false; error: string }> {
  const settings = await loadSettings(customerId);
  if (!settings.googleReviewUrl) return { ok: false, error: "Bitte zuerst den Google-Bewertungslink speichern." };
  const vertreter = await advisorOf(customerId);
  try {
    const { sendWhatsAppNotice } = await import("@/lib/whatsapp/templates");
    const r = await sendWhatsAppNotice({
      customerId,
      to: phone,
      purpose: "review_request",
      params: ["Test", settings.googleReviewUrl],
      text: renderText(settings.texts.review, { vorname: "Test", link: settings.googleReviewUrl, vertreter }),
      contactName: "Test (Empfehlungen & Bewertungen)",
    });
    return { ok: true, mode: r.mode };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: /Vorlage/.test(msg) ? "Die WhatsApp-Vorlage ist noch nicht von Meta freigegeben. Das dauert meist wenige Stunden bis zwei Tage." : /verbundenes WhatsApp/.test(msg) ? "WhatsApp ist noch nicht verbunden." : "Senden hat nicht geklappt." };
  }
}

export { referralBlocker, sendingWindow };
