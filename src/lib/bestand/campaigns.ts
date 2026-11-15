// Bestandskunden-Kampagnen: Segmente, Chancen, Versand (gedrosselt, per
// Cron), Antworten → Lead in der Pipeline, „Stopp“ → Sperre.
//
// Seit 14.11.2026 (Ole) zwei Kanäle: WhatsApp und E-Mail (über das verbundene Postfach des Vermittlers).
// Kanal und Rechtsgrundlage je Empfänger: lib/bestand/einwilligung.ts (WhatsApp nur mit Opt-in, E-Mail mit
// Einwilligung oder nach § 7 Abs. 3 UWG nur zum selben Bedarf). Beim Planen gesetzt, vor jedem Versand neu
// geprüft (Abmeldung oder Widerruf wirken sofort). E-Mail: werktags 8 bis 18 Uhr, Zufallsabstände,
// Tageslimit je Anbieter, Drosselung bei Fehlern und Bounces (lib/bestand/mail-drossel.ts).

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import { bestandMailQuota, bestandQuota, consume, MAIL_QUOTA_REACHED, nextFunding, QUOTA_PAUSE, QUOTA_REACHED } from "@/lib/bestand/quota";
import { displayName } from "@/lib/bestand/rows";
import { anredeZeile, type AnredeKontakt } from "@/lib/ansprache";
import { kontaktFromExisting } from "@/lib/lead-anrede";
import { BESTAND_SOURCE } from "@/lib/lead-herkunft";
import { chooseChannel, countAudience, asChannelMode, type AudienceCounts, type Channel, type ChannelMode, type ConsentSettings, type LegalBasis } from "@/lib/bestand/einwilligung";
import { loadConsentSettings, loadSuppression, optOutExisting, subjectOf, SUBJECT_SELECT, type Suppression } from "@/lib/bestand/einwilligung-server";
import { afterSend, bounceCheck, innerGap, isBounceError, mailSlots, providerDailyLimit, type SendOutcome, type ThrottleState } from "@/lib/bestand/mail-drossel";
import { buildCampaignMail, campaignMailFooter, defaultCampaignMail, fillCampaignMail, imprintFromWebsiteInfo, ohneGedankenstriche } from "@/lib/bestand/kampagnen-mail";
import { classifyReply, isAutoReplyText } from "@/lib/vertrieb/sentiment";
import { isExclusiveAgent, mayOffer, offeredLines } from "@/lib/bestand/befugnis";

export type Occasion = "cross_sell" | "review" | "birthday" | "renewal" | "empfehlung";
export type Segment = { has?: string[]; lacks?: string[]; birthdayDays?: number; renewalDays?: number };

export const OCCASIONS: Record<Occasion, { label: string; hint: string; purpose: string }> = {
  cross_sell: { label: "Lücke schließen", hint: "Kunden mit Sparte A, aber ohne Sparte B", purpose: "campaign_cross_sell" },
  review: { label: "Jahresgespräch", hint: "Vertragscheck: Passt noch alles?", purpose: "campaign_review" },
  birthday: { label: "Geburtstag", hint: "Gruß zum Geburtstag mit Gesprächsangebot", purpose: "campaign_birthday" },
  renewal: { label: "Ablauf / Wechsel", hint: "Verträge mit Ablauf oder Wechseltermin in Kürze", purpose: "campaign_renewal" },
  // Nur mit Modul „Empfehlungen & Bewertungen“: persönlicher Empfehlungslink je Kunde ({empfehlungslink})
  empfehlung: { label: "Jährliche Empfehlungsbitte", hint: "Zufriedene Bestandskunden um eine Empfehlung bitten, mit persönlichem Link", purpose: "referral_request" },
};

/** Anlässe, die das Modul „Empfehlungen & Bewertungen“ brauchen. */
export const NEEDS_EMPFEHLUNG: readonly Occasion[] = ["empfehlung"];
/** Empfehlungsbitte höchstens einmal im Jahr je Kunde. */
const REFERRAL_YEAR_DAYS = 365;

/** Vorlagen-Parameter {{1}} (nach „Hallo“) für Kunden ohne Namen. */
export const NAMELESS_PARAM = "und guten Tag";

/** Abstand zwischen zwei Kampagnen an denselben Kunden. */
export const COOLDOWN_DAYS = 30;
const DAY = 86_400_000;

/** Tage bis zum nächsten Geburtstag (0 = heute). */
export function daysUntilBirthday(b: Date, now = new Date()): number {
  const y = now.getUTCFullYear();
  const today = Date.UTC(y, now.getUTCMonth(), now.getUTCDate());
  let next = Date.UTC(y, b.getUTCMonth(), b.getUTCDate());
  if (next < today) next = Date.UTC(y + 1, b.getUTCMonth(), b.getUTCDate());
  return Math.round((next - today) / DAY);
}

// ─── Zielgruppe: Segment, dann Kanal und Rechtsgrundlage je Kunde ─────────

const CANDIDATE_SELECT = {
  id: true,
  lines: true,
  birthday: true,
  nextRenewal: true,
  lastCampaignAt: true,
  premiumTotal: true,
  referralLink: { select: { lastSentAt: true } },
  ...SUBJECT_SELECT,
} as const;
type Candidate = Prisma.ExistingCustomerGetPayload<{ select: typeof CANDIDATE_SELECT }>;

/** Alle Bestandskunden, die nicht kürzlich angeschrieben wurden (Abgemeldete bleiben drin: zählen als „ausgeschlossen“). */
async function loadCandidates(customerId: string, now: Date): Promise<Candidate[]> {
  return prisma.existingCustomer.findMany({
    where: { customerId, OR: [{ lastCampaignAt: null }, { lastCampaignAt: { lt: new Date(now.getTime() - COOLDOWN_DAYS * DAY) } }] },
    select: CANDIDATE_SELECT,
  });
}

/** Gehört der Kunde zum Segment des Anlasses? (rein) */
export function inSegment(
  c: { lines: string[]; birthday: Date | null; nextRenewal: Date | null; referralLink?: { lastSentAt: Date | null } | null },
  occasion: Occasion,
  seg: Segment,
  now: Date,
): boolean {
  if (occasion === "cross_sell") {
    if (seg.has?.length && !seg.has.every((l) => c.lines.includes(l))) return false;
    if (seg.lacks?.length && seg.lacks.some((l) => c.lines.includes(l))) return false;
    return true;
  }
  if (occasion === "renewal") {
    return !!c.nextRenewal && c.nextRenewal >= now && c.nextRenewal <= new Date(now.getTime() + (seg.renewalDays ?? 60) * DAY);
  }
  if (occasion === "birthday") return !!c.birthday && daysUntilBirthday(c.birthday, now) <= (seg.birthdayDays ?? 7);
  if (occasion === "empfehlung") {
    const last = c.referralLink?.lastSentAt ?? null;
    return !last || last < new Date(now.getTime() - REFERRAL_YEAR_DAYS * DAY);
  }
  return true;
}

export type Availability = {
  /** WhatsApp-Nummer verbunden (Vorlage darf noch warten: dann startet WhatsApp nach der Freigabe automatisch) */
  waAvailable: boolean;
  /** Vorlage für den Anlass freigegeben */
  waTemplateApproved: boolean;
  /** Postfach, über das die Mails rausgehen (null = nicht verbunden) */
  mailbox: { userId: string; email: string; provider: string } | null;
};

/** Was steht für den Versand bereit? senderUserId = Login, dessen Postfach genutzt wird. */
export async function channelAvailability(customerId: string, occasion: Occasion, senderUserId: string | null | undefined): Promise<Availability> {
  const [wa, tpl, mailbox, cust] = await Promise.all([
    prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true } }),
    prisma.messageTemplate.count({ where: { customerId, purpose: OCCASIONS[occasion].purpose, status: "approved" } }),
    senderUserId ? prisma.mailConnection.findUnique({ where: { userId: senderUserId }, select: { userId: true, email: true, provider: true, customerId: true } }) : null,
    prisma.customer.findUnique({ where: { id: customerId }, select: { mailFeaturesOff: true } }),
  ]);
  return {
    waAvailable: wa?.status === "connected",
    waTemplateApproved: tpl > 0,
    // E-Mail-Funktionen aus („Meine Gesellschaft erlaubt das nicht“): nur WhatsApp
    mailbox: mailbox && mailbox.customerId === customerId && !cust?.mailFeaturesOff ? { userId: mailbox.userId, email: mailbox.email, provider: mailbox.provider } : null,
  };
}

/** WhatsApp bevorzugt, aber keine Nummer verbunden → alle per E-Mail (Ole: 4.493 Kunden nur mit E-Mail). */
export function effectiveMode(mode: ChannelMode, waAvailable: boolean): ChannelMode {
  return mode === "whatsapp_first" && !waAvailable ? "email" : mode;
}

export type PlannedRecipient = { id: string; channel: Channel; basis: LegalBasis; premiumTotal: number | null };
export type AudiencePlan = { recipients: PlannedRecipient[]; counts: AudienceCounts; segment: number };

/** Zielgruppe planen: Segment, dann je Kunde Kanal und Rechtsgrundlage (bzw. Ausschlussgrund). */
export function planFromCandidates(
  cands: Candidate[],
  occasion: Occasion,
  seg: Segment,
  mode: ChannelMode,
  settings: ConsentSettings,
  sup: Suppression,
  now: Date,
): AudiencePlan {
  const inSeg = cands.filter((c) => inSegment(c, occasion, seg, now));
  const choices = inSeg.map((c) => {
    const subject = subjectOf(c, sup);
    return { c, subject, choice: chooseChannel(mode, subject, occasion, settings) };
  });
  const recipients: PlannedRecipient[] = [];
  for (const { c, choice } of choices) {
    if (choice.channel) recipients.push({ id: c.id, channel: choice.channel, basis: choice.basis, premiumTotal: c.premiumTotal == null ? null : Number(c.premiumTotal) });
  }
  return { recipients, counts: countAudience(choices.map((x) => x.choice), choices.map((x) => x.subject)), segment: inSeg.length };
}

export async function planAudience(
  customerId: string,
  occasion: Occasion,
  seg: Segment,
  opts: { mode?: ChannelMode; now?: Date; waAvailable?: boolean } = {},
): Promise<AudiencePlan> {
  const now = opts.now ?? new Date();
  const [cands, settings, sup] = await Promise.all([loadCandidates(customerId, now), loadConsentSettings(customerId), loadSuppression(customerId)]);
  const mode = effectiveMode(opts.mode ?? "whatsapp_first", opts.waAvailable ?? true);
  return planFromCandidates(cands, occasion, seg, mode, settings, sup, now);
}

/** IDs der rechtlich erreichbaren Bestandskunden im Segment (ohne Gesperrte, ohne kürzlich Angeschriebene). */
export async function segmentIds(customerId: string, occasion: Occasion, seg: Segment, now = new Date(), mode: ChannelMode = "whatsapp_first"): Promise<string[]> {
  return (await planAudience(customerId, occasion, seg, { mode, now })).recipients.map((r) => r.id);
}

// Naheliegende Ergänzungen (Sparte → passende weitere Sparte)
const NEXT_BEST: [string, string][] = [
  ["KFZ", "Haftpflicht"], ["KFZ", "Hausrat"], ["Haftpflicht", "Hausrat"], ["Hausrat", "Haftpflicht"],
  ["Wohngebäude", "Hausrat"], ["Haftpflicht", "Rechtsschutz"], ["KFZ", "Rechtsschutz"], ["Haftpflicht", "Unfall"],
  ["Vorsorge", "BU"], ["Kranken", "Pflege"],
];

/** Sparte → Wort für die Nachricht („beim Thema Berufsunfähigkeit“). */
export const TOPIC_LABEL: Record<string, string> = {
  BU: "Berufsunfähigkeit", KFZ: "Kfz-Versicherung", Haftpflicht: "Privathaftpflicht", Vorsorge: "Altersvorsorge",
  Kranken: "Krankenzusatzversicherung", Wohngebäude: "Wohngebäudeversicherung", Hausrat: "Hausrat", Unfall: "Unfallversicherung",
  Rechtsschutz: "Rechtsschutz", Pflege: "Pflegevorsorge",
};

/**
 * Sparten, in die Cross-Selling vorgeschlagen werden darf (Ausschließlichkeitsvertreter: Profil, sonst Sparten aus dem
 * eigenen Bestand; null = keine Einschränkung). So schlägt die App keine Produkte anderer Versicherer vor.
 */
export async function offeredFor(customerId: string): Promise<Set<string> | null> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { vermittlerTyp: true, bestandSparten: true } });
  if (!c || !isExclusiveAgent(c.vermittlerTyp)) return null;
  const lines = c.bestandSparten.length
    ? []
    : (await prisma.existingContract.findMany({ where: { existingCustomer: { customerId } }, distinct: ["line"], select: { line: true } })).map((x) => x.line);
  return offeredLines(c.vermittlerTyp, c.bestandSparten, lines);
}

export type Opportunity = { occasion: Occasion; segment: Segment; topic: string | null; title: string; count: number; whatsapp: number; email: number; excluded: number };

/** „Chancen“: die größten Lücken und anstehende Anlässe mit der Zahl rechtlich erreichbarer Kunden. */
export async function opportunities(customerId: string, now = new Date()): Promise<Opportunity[]> {
  const [cands, settings, sup, wa, c, offered] = await Promise.all([
    loadCandidates(customerId, now),
    loadConsentSettings(customerId),
    loadSuppression(customerId),
    prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { empfehlungEnabled: true } }),
    offeredFor(customerId),
  ]);
  const mode = effectiveMode("whatsapp_first", wa?.status === "connected");
  const plan = (o: Occasion, s: Segment) => planFromCandidates(cands, o, s, mode, settings, sup, now);
  const opp = (o: Occasion, s: Segment, topic: string | null, title: string): Opportunity => {
    const p = plan(o, s);
    return { occasion: o, segment: s, topic, title, count: p.recipients.length, whatsapp: p.counts.whatsapp, email: p.counts.email, excluded: p.counts.excludedTotal };
  };
  const out: Opportunity[] = [];
  for (const [has, lacks] of NEXT_BEST) {
    // Ausschließlichkeitsvertreter: nur Sparten, die er anbietet
    if (!mayOffer(offered, lacks)) continue;
    const o = opp("cross_sell", { has: [has], lacks: [lacks] }, TOPIC_LABEL[lacks] ?? lacks, `${has} ohne ${lacks}`);
    if (o.count) out.push(o);
  }
  out.sort((a, b) => b.count - a.count);
  const top = out.slice(0, 4);
  const extra = [
    opp("birthday", { birthdayDays: 30 }, null, "Geburtstag in den nächsten 30 Tagen"),
    opp("renewal", { renewalDays: 60 }, null, "Ablauf/Wechsel in den nächsten 60 Tagen"),
    opp("review", {}, null, "Jahresgespräch mit allen erreichbaren Kunden"),
    ...(c?.empfehlungEnabled ? [opp("empfehlung", {}, null, "Jährliche Empfehlungsbitte")] : []),
  ];
  return [...top, ...extra.filter((o) => o.count)];
}

/**
 * Potenzial-Hinweis „312 Kunden ohne Hausrat noch nicht angeschrieben“: größte Lücke unter Kunden, die noch nie
 * angeschrieben wurden, nur ohne Abmeldung und mit Einwilligung (Cross-Selling geht ohnehin nur mit Einwilligung).
 */
export async function potentialHint(customerId: string, now = new Date()): Promise<{ title: string; count: number; segment: Segment; topic: string } | null> {
  const [all, settings, sup, wa, offered] = await Promise.all([
    loadCandidates(customerId, now),
    loadConsentSettings(customerId),
    loadSuppression(customerId),
    prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true } }),
    offeredFor(customerId),
  ]);
  const never = all.filter((c) => !c.lastCampaignAt);
  const mode = effectiveMode("whatsapp_first", wa?.status === "connected");
  let best: { title: string; count: number; segment: Segment; topic: string } | null = null;
  for (const [has, lacks] of NEXT_BEST) {
    if (!mayOffer(offered, lacks)) continue;
    const seg = { has: [has], lacks: [lacks] };
    const n = planFromCandidates(never, "cross_sell", seg, mode, settings, sup, now).recipients.filter((r) => r.basis === "einwilligung").length;
    if (n && (!best || n > best.count)) best = { title: `${n.toLocaleString("de-DE")} Kunden ohne ${TOPIC_LABEL[lacks] ?? lacks} noch nicht angeschrieben`, count: n, segment: seg, topic: TOPIC_LABEL[lacks] ?? lacks };
  }
  return best;
}

/** Rechtlich erreichbar je Anlass (Übersicht „Wer darf wie angeschrieben werden?“). */
export async function reachByOccasion(customerId: string, now = new Date()): Promise<{ occasion: Occasion; counts: AudienceCounts }[]> {
  const [cands, settings, sup, wa] = await Promise.all([
    loadCandidates(customerId, now),
    loadConsentSettings(customerId),
    loadSuppression(customerId),
    prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true } }),
  ]);
  const mode = effectiveMode("whatsapp_first", wa?.status === "connected");
  // Ohne Segment-Grenze (alle Kunden), damit der Vergleich der Anlässe die Rechtslage zeigt
  return (["renewal", "review", "cross_sell", "birthday"] as Occasion[]).map((o) => ({ occasion: o, counts: planFromCandidates(cands, o, segmentAll(o), mode, settings, sup, now).counts }));
}
const segmentAll = (o: Occasion): Segment => (o === "birthday" ? { birthdayDays: 366 } : o === "renewal" ? { renewalDays: 3660 } : {});

export async function createCampaign(opts: {
  customerId: string;
  occasion: Occasion;
  segment: Segment;
  topic: string | null;
  dailyLimit: number;
  name?: string;
  createdById?: string | null;
  channelMode?: ChannelMode;
  mailSubject?: string | null;
  mailBody?: string | null;
  now?: Date;
}) {
  const now = opts.now ?? new Date();
  const senderUserId = opts.createdById ?? null;
  const mode = asChannelMode(opts.channelMode);
  const avail = await channelAvailability(opts.customerId, opts.occasion, senderUserId);
  const plan = await planAudience(opts.customerId, opts.occasion, opts.segment, { mode, now, waAvailable: avail.waAvailable });
  if (!plan.recipients.length) throw new Error("In diesem Segment ist gerade niemand erreichbar.");
  const viaWa = plan.recipients.filter((r) => r.channel === "whatsapp").length;
  const viaMail = plan.recipients.length - viaWa;
  // Kontingent je Kanal vor dem Start prüfen (WhatsApp inkl. Gebühren, E-Mail eigenes Kontingent)
  if (viaWa && (await bestandQuota(opts.customerId, now)).remaining <= 0) throw new Error(QUOTA_REACHED);
  if (viaMail && !viaWa && (await bestandMailQuota(opts.customerId, now)).remaining <= 0) throw new Error(MAIL_QUOTA_REACHED);
  if (viaMail && !avail.mailbox) throw new Error("Für E-Mails bitte zuerst Ihr Postfach verbinden (Einstellungen → E-Mail-Postfach).");
  const name =
    opts.name ??
    (opts.occasion === "cross_sell" ? `${opts.segment.has?.join(", ")} ohne ${opts.segment.lacks?.join(", ")}` : OCCASIONS[opts.occasion].label);
  return prisma.customerCampaign.create({
    data: {
      customerId: opts.customerId,
      name,
      occasion: opts.occasion,
      segment: opts.segment as Prisma.InputJsonValue,
      topic: opts.topic,
      dailyLimit: Math.max(10, Math.min(1000, Math.round(opts.dailyLimit))),
      status: "running",
      startedAt: now,
      createdById: opts.createdById ?? null,
      senderUserId,
      channelMode: mode,
      // Unveränderter Standardtext → null (dann gilt immer der aktuelle Standard)
      mailSubject: ownText(opts.mailSubject, defaultCampaignMail(opts.occasion).subject, 200),
      mailBody: ownText(opts.mailBody, defaultCampaignMail(opts.occasion).body, 5000),
      recipients: { create: plan.recipients.map((r) => ({ existingCustomerId: r.id, channel: r.channel, basis: r.basis })) },
    },
  });
}

const ownText = (v: string | null | undefined, def: string, max: number) => {
  const t = (v ?? "").replace(/\r\n/g, "\n").trim();
  return t && t !== def.trim() ? t.slice(0, max) : null;
};

function berlinClock(now: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { wd: p.weekday as string, hour: Number(p.hour), day: `${p.year}-${p.month}-${p.day}` };
}

type RunOpts = { sleep?: (ms: number) => Promise<void>; rand?: () => number };
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type CampaignRow = Prisma.CustomerCampaignGetPayload<{ include: { customer: { select: { name: true; existingCustomersEnabled: true; empfehlungEnabled: true } } } }>;
type RecipientRow = Prisma.CampaignRecipientGetPayload<{ include: { existingCustomer: true } }>;

/**
 * Versand im Cron (alle 5 Minuten). WhatsApp: Mo–Sa 9–19 Uhr, je Lauf max. 25. E-Mail: werktags 8–18 Uhr,
 * je Postfach höchstens 3 je Lauf mit Zufallsabständen und Tageslimit je Anbieter. Je Kampagne höchstens
 * dailyLimit pro Tag (beide Kanäle zusammen).
 */
export async function runCampaigns(now = new Date(), opts: RunOpts = {}): Promise<{ sent: number; failed: number; mailed: number }> {
  const { wd, hour } = berlinClock(now);
  const waWindow = wd !== "Sun" && hour >= 9 && hour < 19;
  const { inMailWindow } = await import("@/lib/bestand/mail-drossel");
  const mailWindow = inMailWindow(now);
  const res = { sent: 0, failed: 0, mailed: 0 };
  if (!waWindow && !mailWindow) return res;
  const dayStart = new Date(now.getTime() - (hour * 3600_000 + now.getUTCMinutes() * 60_000));
  const { autoTopUp, pauseForQuota, resumeQuotaPausedCampaigns } = await import("@/lib/bestand/packs");
  // Am Kontingent pausierte Kampagnen laufen weiter, sobald wieder etwas frei ist (neuer Monat, Paket, Admin)
  const quotaPaused = await prisma.customerCampaign.findMany({ where: { status: "paused", pausedReason: QUOTA_PAUSE }, select: { customerId: true }, distinct: ["customerId"] });
  for (const p of quotaPaused) {
    if ((await bestandQuota(p.customerId, now)).remaining > 0) await resumeQuotaPausedCampaigns(p.customerId, now);
  }
  const campaigns = await prisma.customerCampaign.findMany({ where: { status: "running" }, include: { customer: { select: { name: true, existingCustomersEnabled: true, empfehlungEnabled: true } } } });
  const ctxCache = new Map<string, { settings: ConsentSettings & Awaited<ReturnType<typeof loadConsentSettings>>; sup: Suppression }>();
  const ctxOf = async (customerId: string) => {
    let v = ctxCache.get(customerId);
    if (!v) {
      v = { settings: await loadConsentSettings(customerId), sup: await loadSuppression(customerId) };
      ctxCache.set(customerId, v);
    }
    return v;
  };
  const mailboxes = new Map<string, MailboxRun>();
  for (const c of campaigns) {
    if (!c.customer.existingCustomersEnabled) continue;
    // Empfehlungsbitte ohne aktives Modul: pausieren (Link-Seite wäre nicht erreichbar)
    if (NEEDS_EMPFEHLUNG.includes(c.occasion as Occasion) && !c.customer.empfehlungEnabled) {
      await prisma.customerCampaign.update({ where: { id: c.id }, data: { status: "paused" } });
      continue;
    }
    if (!(await prisma.campaignRecipient.count({ where: { campaignId: c.id, status: "queued" } }))) {
      await prisma.customerCampaign.update({ where: { id: c.id }, data: { status: "done", finishedAt: now } });
      continue;
    }
    const today = await prisma.campaignRecipient.count({ where: { campaignId: c.id, sentAt: { gte: dayStart } } });
    // Tageslimit: verteilt große Kampagnen über mehrere Tage (schont Nummer und Postfach)
    let budget = c.dailyLimit - today;
    if (budget <= 0) continue;
    const cx = await ctxOf(c.customerId);
    const avail = await channelAvailability(c.customerId, c.occasion as Occasion, c.senderUserId ?? c.createdById);
    const mode = effectiveMode(asChannelMode(c.channelMode), avail.waAvailable);
    if (waWindow) {
      const r = avail.waTemplateApproved
        ? await sendWhatsAppPart(c, cx, mode, Math.min(25, budget), now, { autoTopUp, pauseForQuota })
        : // Vorlage noch bei Meta in Prüfung: WhatsApp-Empfänger warten, die Kampagne startet nach der Freigabe von selbst
          { sent: 0, failed: 0, stop: false };
      res.sent += r.sent;
      res.failed += r.failed;
      budget -= r.sent;
      if (r.stop) continue;
    }
    if (mailWindow && budget > 0 && avail.mailbox) {
      const r = await sendMailPart(c, cx, mode, budget, avail.mailbox, mailboxes, now, opts);
      res.mailed += r.sent;
      res.failed += r.failed;
    }
  }
  // Viele Bounces → Postfach pausiert, Warnung
  for (const mb of mailboxes.values()) await checkBounces(mb, now);
  return res;
}

/** Vor dem Versand neu prüfen: Kanal und Rechtsgrundlage nach aktuellem Stand (Abmeldung, Widerruf). */
async function recheck(r: RecipientRow, c: CampaignRow, cx: { settings: ConsentSettings; sup: Suppression }, mode: ChannelMode): Promise<Channel | null> {
  const choice = chooseChannel(mode, subjectOf(r.existingCustomer, cx.sup), c.occasion as Occasion, cx.settings);
  if (!choice.channel) {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "skipped", reason: choice.reason } });
    return null;
  }
  if (choice.channel !== r.channel || choice.basis !== r.basis) {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { channel: choice.channel, basis: choice.basis } });
  }
  return choice.channel;
}

async function sendWhatsAppPart(
  c: CampaignRow,
  cx: { settings: ConsentSettings; sup: Suppression },
  mode: ChannelMode,
  limit: number,
  now: Date,
  packs: { autoTopUp: (customerId: string, now: Date) => Promise<boolean>; pauseForQuota: (id: string, customerId: string) => Promise<void> },
): Promise<{ sent: number; failed: number; stop: boolean }> {
  const out = { sent: 0, failed: 0, stop: false };
  if (!(await prisma.campaignRecipient.count({ where: { campaignId: c.id, status: "queued", channel: "whatsapp" } }))) return out;
  // Kontingent: Monat + Zusatzpakete. Leer → ggf. automatisch nachbuchen, sonst mit Hinweis pausieren
  let quota = await bestandQuota(c.customerId, now);
  if (quota.remaining <= 0 && (await packs.autoTopUp(c.customerId, now))) quota = await bestandQuota(c.customerId, now);
  if (quota.remaining <= 0) {
    // E-Mails haben ein eigenes Kontingent: mit wartenden E-Mails läuft die Kampagne weiter, nur WhatsApp wartet
    if (await prisma.campaignRecipient.count({ where: { campaignId: c.id, status: "queued", channel: "email" } })) return out;
    await packs.pauseForQuota(c.id, c.customerId);
    out.stop = true;
    return out;
  }
  const batch = await prisma.campaignRecipient.findMany({
    where: { campaignId: c.id, status: "queued", channel: "whatsapp" },
    // Wertvollste Kunden zuerst (höchster Jahresbeitrag), dann in Anlage-Reihenfolge
    orderBy: [{ existingCustomer: { premiumTotal: { sort: "desc", nulls: "last" } } }, { id: "asc" }],
    take: Math.min(limit, quota.remaining),
    include: { existingCustomer: true },
  });
  const { sendWhatsAppNotice, NoTemplateError } = await import("@/lib/whatsapp/templates");
  for (const r of batch) {
    const ec = r.existingCustomer;
    if ((await recheck(r, c, cx, mode)) !== "whatsapp") continue;
    const first = ec.firstName?.split(/\s+/)[0] || "";
    // Anrede aus dem Bestand (Herr/Frau, Nachname): „Guten Tag Frau Schneider,“
    const kontakt = kontaktFromExisting(ec);
    try {
      // {empfehlungslink}: persönlicher Link je Bestandskunde
      const referral = c.occasion === "empfehlung" ? await referralCampaignParts(c.customerId, ec.id, first, kontakt) : null;
      const topic = await recipientTopic(c, ec);
      const sent = await sendWhatsAppNotice({
        customerId: c.customerId,
        to: ec.phone!,
        purpose: OCCASIONS[c.occasion as Occasion].purpose as Parameters<typeof sendWhatsAppNotice>[0]["purpose"],
        params: referral ? [first || "Hallo", referral.url] : [first || "Hallo", topic ?? ""],
        text: referral ? referral.text : campaignText(c.occasion as Occasion, kontakt, topic),
        contactName: displayName(ec),
        anrede: kontakt,
      });
      // Erst Monatskontingent, dann ältestes Paket
      const funding = nextFunding(quota) ?? null;
      consume(quota, funding);
      await prisma.$transaction([
        prisma.campaignRecipient.update({
          where: { id: r.id },
          data: { status: "sent", sentAt: now, conversationId: sent.conversationId, packId: funding, waMessageId: sent.messageId ?? null },
        }),
        prisma.existingCustomer.update({ where: { id: ec.id }, data: { lastCampaignAt: now } }),
        ...(referral ? [prisma.referralLink.update({ where: { id: referral.linkId }, data: { lastSentAt: now } })] : []),
      ]);
      out.sent++;
    } catch (err) {
      if (err instanceof NoTemplateError) {
        // Keine passende freigegebene Fassung: WhatsApp wartet (kein Pausieren, geht nach der Freigabe von selbst weiter)
        await sendToAdmins({
          title: `WhatsApp-Kampagne wartet: ${c.customer.name}`,
          body: `Keine passende freigegebene WhatsApp-Vorlage für „${OCCASIONS[c.occasion as Occasion].label}“.`,
          url: "/admin/whatsapp/settings",
          tag: `kampagne-vorlage:${c.id}`,
        }).catch(() => {});
        break;
      }
      reportError(err, "campaign-send", { campaign: c.id });
      await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "failed", reason: err instanceof Error ? err.message.slice(0, 200) : "Fehler" } });
      out.failed++;
    }
  }
  return out;
}

type MailboxRun = { id: string; userId: string; customerId: string; email: string; provider: string; fromName: string | null; state: ThrottleState; sentToday: number | null };

async function mailboxRun(userId: string, cache: Map<string, MailboxRun>): Promise<MailboxRun | null> {
  const hit = cache.get(userId);
  if (hit) return hit;
  const m = await prisma.mailConnection.findUnique({ where: { userId } });
  if (!m) return null;
  const run: MailboxRun = {
    id: m.id,
    userId,
    customerId: m.customerId,
    email: m.email,
    provider: m.provider,
    fromName: m.fromName,
    state: { backoff: m.campaignBackoff, errors: m.campaignErrors, pausedUntil: m.campaignPausedUntil, nextAt: m.campaignNextAt, issueAt: m.campaignIssueAt },
    sentToday: null,
  };
  cache.set(userId, run);
  return run;
}

async function saveMailbox(mb: MailboxRun) {
  await prisma.mailConnection.update({
    where: { id: mb.id },
    data: { campaignBackoff: mb.state.backoff, campaignErrors: mb.state.errors, campaignPausedUntil: mb.state.pausedUntil, campaignNextAt: mb.state.nextAt, campaignIssueAt: mb.state.issueAt },
  });
}

/** Warnung an Vermittler (Inhaber) und Ole, höchstens einmal je Tag und Postfach (Push-Tag). */
async function warnMailbox(mb: MailboxRun, text: string) {
  const { sendToUser } = await import("@/lib/push");
  const owners = await prisma.user.findMany({ where: { customerId: mb.customerId, role: "BUYER", teamRole: "owner" }, select: { id: true } });
  for (const o of new Set([mb.userId, ...owners.map((x) => x.id)])) {
    await sendToUser(o, { title: "E-Mail-Kampagne gedrosselt", body: text, url: "/buyer/bestand", tag: `bestand-mail-drossel:${mb.id}` }).catch(() => {});
  }
  const c = await prisma.customer.findUnique({ where: { id: mb.customerId }, select: { name: true } });
  await sendToAdmins({ title: `E-Mail-Kampagne gedrosselt: ${c?.name ?? ""}`, body: `${mb.email}: ${text}`, url: `/admin/kunden/${mb.customerId}`, tag: `bestand-mail-drossel:${mb.id}` }).catch(() => {});
}

async function checkBounces(mb: MailboxRun, now: Date) {
  const since = new Date(now.getTime() - 7 * DAY);
  const where = { channel: "email", campaign: { senderUserId: mb.userId } } as const;
  const [sent, bounced] = await Promise.all([
    prisma.campaignRecipient.count({ where: { ...where, sentAt: { gte: since } } }),
    prisma.campaignRecipient.count({ where: { ...where, bouncedAt: { gte: since } } }),
  ]);
  // Sofort abgelehnte Mails haben kein sentAt: zum Versuch dazuzählen
  const bouncedUnsent = await prisma.campaignRecipient.count({ where: { ...where, bouncedAt: { gte: since }, sentAt: null } });
  const u = bounceCheck(mb.state, sent + bouncedUnsent, bounced, now);
  if (u.warn) {
    mb.state = u.state;
    await saveMailbox(mb);
    await warnMailbox(mb, u.warn);
  }
}

/** Fertige Mail für einen Empfänger (auch für die Vorschau). */
export async function campaignMailFor(
  c: { id?: string; customerId: string; occasion: string; topic: string | null; mailSubject: string | null; mailBody: string | null },
  ec: { id: string; firstName: string | null; lastName: string | null; salutation: string | null },
  opts: { recipientId: string; customerName: string; imprint: string | null; meinname: string; empfehlungslink?: string | null },
) {
  const { unsubscribeUrl } = await import("@/lib/bestand/links");
  const { firmDisplayName } = await import("@/lib/lead-anrede");
  const occasion = c.occasion as Occasion;
  const def = defaultCampaignMail(occasion, "sie");
  const tpl = { subject: c.mailSubject ?? def.subject, body: c.mailBody ? ohneGedankenstriche(c.mailBody) : def.body };
  const filled = fillCampaignMail(tpl, { ansprache: "sie", kontakt: kontaktFromExisting(ec), thema: c.topic, empfehlungslink: opts.empfehlungslink, meinname: opts.meinname });
  const url = unsubscribeUrl(opts.recipientId);
  const footer = campaignMailFooter({ firm: firmDisplayName(opts.customerName), unsubscribeUrl: url, imprint: opts.imprint });
  return { subject: ohneGedankenstriche(filled.subject), ...buildCampaignMail(filled.body, footer), unsubscribeUrl: url };
}

async function sendMailPart(
  c: CampaignRow,
  cx: { settings: Awaited<ReturnType<typeof loadConsentSettings>>; sup: Suppression },
  mode: ChannelMode,
  budget: number,
  box: NonNullable<Availability["mailbox"]>,
  cache: Map<string, MailboxRun>,
  now: Date,
  opts: RunOpts,
): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  if (!(await prisma.campaignRecipient.count({ where: { campaignId: c.id, status: "queued", channel: "email" } }))) return out;
  const mb = await mailboxRun(box.userId, cache);
  if (!mb) return out;
  const dayStart = berlinDayStart(now);
  mb.sentToday ??= await prisma.campaignRecipient.count({ where: { channel: "email", sentAt: { gte: dayStart }, campaign: { senderUserId: mb.userId } } });
  const mailQuota = await bestandMailQuota(c.customerId, now);
  const slots = Math.min(mailSlots(mb.state, { sentToday: mb.sentToday, baseLimit: providerDailyLimit(mb.provider, mb.email), now }), budget, mailQuota.remaining);
  if (slots <= 0) return out;
  const batch = await prisma.campaignRecipient.findMany({
    where: { campaignId: c.id, status: "queued", channel: "email" },
    orderBy: [{ existingCustomer: { premiumTotal: { sort: "desc", nulls: "last" } } }, { id: "asc" }],
    take: slots,
    include: { existingCustomer: true },
  });
  const imprint = cx.settings.imprint ?? imprintFromWebsiteInfo(cx.settings.websiteInfo);
  const { advisorPerson } = await import("@/lib/lead-anrede");
  const sender = await prisma.user.findUnique({ where: { id: mb.userId }, select: { displayName: true } });
  const meinname = advisorPerson(c.customer.name, sender?.displayName ?? mb.fromName);
  const { sendViaPostfach } = await import("@/lib/mail/postfach");
  const { unsubscribePostUrl } = await import("@/lib/bestand/links");
  const sleep = opts.sleep ?? realSleep;
  const rand = opts.rand ?? Math.random;
  let first = true;
  for (const r of batch) {
    const ec = r.existingCustomer;
    if ((await recheck(r, c, cx, mode)) !== "email") continue;
    if (!first) await sleep(innerGap(rand()));
    first = false;
    const referral = c.occasion === "empfehlung" ? await referralCampaignParts(c.customerId, ec.id, ec.firstName?.split(/\s+/)[0] || "", kontaktFromExisting(ec)) : null;
    const mail = await campaignMailFor({ ...c, topic: await recipientTopic(c, ec) }, ec, { recipientId: r.id, customerName: c.customer.name, imprint, meinname, empfehlungslink: referral?.url ?? null });
    const messageId = `bk-${r.id}@${(mb.email.split("@")[1] ?? "mail").toLowerCase()}`;
    const result = await sendViaPostfach(mb.userId, {
      to: ec.email!,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      messageId,
      headers: { "List-Unsubscribe": `<${unsubscribePostUrl(r.id)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    let outcome: SendOutcome;
    if (result.ok) {
      outcome = "ok";
      await prisma.$transaction([
        prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "sent", sentAt: now, mailMessageId: messageId } }),
        prisma.existingCustomer.update({ where: { id: ec.id }, data: { lastCampaignAt: now } }),
        ...(referral ? [prisma.referralLink.update({ where: { id: referral.linkId }, data: { lastSentAt: now } })] : []),
      ]);
      out.sent++;
      mb.sentToday++;
    } else if (isBounceError(result.raw ?? result.error)) {
      outcome = "bounce";
      await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "failed", reason: "unzustellbar", bouncedAt: now } });
      out.failed++;
    } else {
      // Postfach-Problem: Empfänger bleibt in der Warteschlange, Drosselung entscheidet über die Pause
      outcome = "error";
      reportError(new Error(result.error), "campaign-mail", { campaign: c.id });
    }
    const u = afterSend(mb.state, outcome, now, rand());
    mb.state = u.state;
    await saveMailbox(mb);
    if (u.warn) await warnMailbox(mb, u.warn);
    // Nach Fehler oder Bounce in diesem Lauf nichts mehr (Abstand laut Drosselung)
    if (outcome !== "ok") break;
  }
  return out;
}

/**
 * Thema je Empfänger. Ablauf/Wechsel: die Sparte des Vertrags, der als Nächstes abläuft (statt eines Themas für
 * alle). So geht es nur um den eigenen Vertrag des Kunden, wie es § 7 Abs. 3 UWG für E-Mails ohne Einwilligung
 * verlangt (derselbe Bedarf). Sonst das Thema der Kampagne.
 */
async function recipientTopic(c: { occasion: string; topic: string | null }, ec: { id: string; nextRenewal: Date | null }): Promise<string | null> {
  if (c.occasion !== "renewal" || !ec.nextRenewal) return c.topic;
  const due = await prisma.existingContract.findFirst({ where: { existingCustomerId: ec.id, renewalDate: ec.nextRenewal }, select: { line: true }, orderBy: { id: "asc" } });
  return renewalTopic(due?.line ?? null, c.topic);
}

/** Thema für Ablauf/Wechsel aus der Sparte des ablaufenden Vertrags (rein). */
export function renewalTopic(line: string | null, fallback: string | null): string | null {
  if (!line || line === "Sonstiges") return fallback;
  return TOPIC_LABEL[line] ?? line;
}

/** Mitternacht Berliner Zeit des heutigen Tages. */
function berlinDayStart(now: Date): Date {
  const { hour } = berlinClock(now);
  return new Date(now.getTime() - (hour * 3600_000 + now.getUTCMinutes() * 60_000 + now.getUTCSeconds() * 1000));
}

/** Empfehlungsbitte: persönlicher Link und Text (eigener Text des Vertreters, {empfehlungslink}). */
async function referralCampaignParts(customerId: string, existingCustomerId: string, first: string, anrede: AnredeKontakt) {
  const { referralLinkOf, referralLinkFor, loadSettings } = await import("@/lib/empfehlung/requests");
  const { renderText } = await import("@/lib/empfehlung/shared");
  const { personFromCustomerName } = await import("@/lib/advisor-name");
  const link = await referralLinkOf({ customerId, existingCustomerId });
  const url = referralLinkFor(link.token);
  const [settings, cust] = await Promise.all([loadSettings(customerId), prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } })]);
  return { linkId: link.id, url, text: renderText(settings.texts.referral, { vorname: first, link: url, vertreter: personFromCustomerName(cust?.name ?? ""), anrede }) };
}

/**
 * Text im offenen 24-h-Fenster (sonst gilt die freigegebene Vorlage). Bestandskunden werden gesiezt:
 * „Guten Tag Frau Schneider,“ bzw. „Guten Tag Erika Schneider,“ / „Guten Tag,“ (lib/ansprache.ts).
 */
export function campaignText(o: Occasion, kontakt: AnredeKontakt | string, topic: string | null): string {
  const hi = anredeZeile("sie", typeof kontakt === "string" ? { firstName: kontakt } : kontakt).replace(/,$/, "");
  switch (o) {
    case "cross_sell":
      return `${hi}, eine kurze Frage: Sind Sie beim Thema ${topic ?? "Absicherung"} schon gut versorgt? Wenn Sie möchten, schaue ich mir das gern einmal mit Ihnen an. Antworten Sie einfach hier.`;
    case "review":
      return `${hi}, es ist Zeit für einen kurzen Check Ihrer Verträge: Passt noch alles zu Ihrer aktuellen Situation? Antworten Sie einfach hier, dann finden wir einen Termin.`;
    case "birthday":
      return `${hi}, herzlichen Glückwunsch zum Geburtstag! Alles Gute für das neue Lebensjahr.`;
    case "empfehlung":
      return `${hi}, kennen Sie jemanden, dem ich genauso weiterhelfen kann? Über Ihren persönlichen Link kann die Person ganz einfach selbst Kontakt mit mir aufnehmen.`;
    case "renewal":
      return `${hi}, bei Ihrem Vertrag ${topic ? `(${topic}) ` : ""}steht bald ein Termin an, zu dem man gut prüfen kann, ob Beitrag und Leistung noch passen. Soll ich mir das kurz für Sie anschauen?`;
  }
}

// ─── Zustellstatus (WhatsApp-Webhook) ────────────────────────────────────

/** Status delivered/read/failed einer WhatsApp-Nachricht am Kampagnen-Empfänger speichern. */
export async function applyCampaignStatus(waMessageId: string, status: string, now = new Date()): Promise<void> {
  if (status === "delivered") {
    await prisma.campaignRecipient.updateMany({ where: { waMessageId, deliveredAt: null }, data: { deliveredAt: now } });
  } else if (status === "read") {
    await prisma.campaignRecipient.updateMany({ where: { waMessageId, deliveredAt: null }, data: { deliveredAt: now } });
    await prisma.campaignRecipient.updateMany({ where: { waMessageId, readAt: null }, data: { readAt: now } });
  } else if (status === "failed") {
    await prisma.campaignRecipient.updateMany({ where: { waMessageId, status: "sent" }, data: { status: "failed", reason: "nicht zugestellt" } });
  }
}

// ─── Antworten ───────────────────────────────────────────────────────────

const STOP = /^\s*(stopp?|stop|abmelden|keine (weiteren )?nachrichten|nicht mehr (schreiben|kontaktieren))\b/i;

type RecipientWithCampaign = Prisma.CampaignRecipientGetPayload<{ include: { campaign: true; existingCustomer: true } }>;

/** Lead aus einer Antwort anlegen (Quelle „Bestandskunde“), zuteilen und melden. */
async function createCampaignLead(customerId: string, recipient: RecipientWithCampaign, extra: { label: string; value: string }[] = []): Promise<string> {
  const ec = recipient.existingCustomer;
  const occasion = OCCASIONS[recipient.campaign.occasion as Occasion]?.label ?? recipient.campaign.occasion;
  const lead = await prisma.lead.create({
    data: {
      customerId,
      source: BESTAND_SOURCE,
      name: [ec.firstName, ec.lastName].filter(Boolean).join(" ") || ec.company || null,
      phone: ec.phone,
      email: ec.email,
      status: "Im Gespräch",
      formData: [
        { label: "Kontext", value: `Bestandskunde des Beraters, angeschrieben wegen: ${occasion}${recipient.campaign.topic ? ` (${recipient.campaign.topic})` : ""}` },
        { label: "Kanal", value: recipient.channel === "email" ? "E-Mail" : "WhatsApp" },
        { label: "Bestehende Verträge (Sparten)", value: ec.lines.join(", ") || "unbekannt" },
        // Anrede für den Assistenten („Guten Tag Frau Schneider“), nur wenn im Bestand hinterlegt
        ...(ec.salutation?.trim() ? [{ label: "Anrede", value: ec.salutation.trim() }] : []),
        ...(ec.externalNo ? [{ label: "Kundennummer", value: ec.externalNo }] : []),
        ...extra,
      ],
    },
    select: { id: true },
  });
  const { assignLead, notifyLeadPush } = await import("@/lib/team");
  await assignLead(lead.id).catch(() => null);
  await notifyLeadPush(lead.id, {
    title: `💬 Bestandskunde antwortet: ${displayName(ec)}`,
    body: recipient.campaign.name,
    tag: `campaign-reply:${lead.id}`,
    url: `/buyer/leads/${lead.id}`,
  }).catch(() => {});
  return lead.id;
}

/**
 * Eingehende WhatsApp-Nachricht: Gehört sie zu einer Kampagne? Dann „Stopp“
 * → Sperre (true = Assistent nicht antworten lassen), sonst Lead anlegen.
 */
export async function handleCampaignReply(conversationId: string, from: string, body: string | null, now = new Date()): Promise<{ stop: boolean }> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { customerId: true, leadId: true } });
  if (!conv) return { stop: false };
  const recipient = await prisma.campaignRecipient.findFirst({
    where: {
      status: { in: ["sent", "replied"] },
      sentAt: { gte: new Date(now.getTime() - 30 * DAY) },
      campaign: { customerId: conv.customerId },
      OR: [{ conversationId }, { existingCustomer: { phone: from } }],
    },
    orderBy: { sentAt: "desc" },
    include: { campaign: true, existingCustomer: true },
  });
  if (!recipient) return { stop: false };
  const ec = recipient.existingCustomer;

  if (body && STOP.test(body)) {
    // „Stopp“ per WhatsApp sperrt alle Kanäle (Sperrliste, Protokoll), sofort und dauerhaft
    await optOutExisting(ec.id, { scope: "all", source: "whatsapp_stopp", recipientId: recipient.id, now });
    await prisma.$transaction([
      prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "replied", repliedAt: now, reason: "Stopp" } }),
      prisma.conversation.update({ where: { id: conversationId }, data: { botActive: false } }),
    ]);
    const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
    await sendWhatsAppMessage({ customerId: conv.customerId, to: from, body: "Alles klar, wir schreiben Ihnen hier keine weiteren Nachrichten.", sentBy: "system" }).catch(() => {});
    return { stop: true };
  }
  if (recipient.status === "replied") return { stop: false };

  let leadId = conv.leadId;
  if (!leadId) {
    leadId = await createCampaignLead(conv.customerId, recipient);
    await prisma.conversation.update({ where: { id: conversationId }, data: { leadId } });
  }
  await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "replied", repliedAt: now, leadId } });
  return { stop: false };
}

// ─── Antworten auf Kampagnen-Mails (Vermittler trägt sie ein) ─────────────
// Wir lesen das Postfach nicht (nur Senderechte gmail.send bzw. Mail.Send). Antworten landen im Postfach des
// Vermittlers; er ordnet sie unter Bestand → Kampagne zu (Absender und Text einfügen). Erkennung wie im Vertrieb.

export type EmailReplyKind = "bounce" | "auto" | "stop" | "negativ" | "interesse";

const BOUNCE_SUBJECT = /(undeliver|unzustellbar|nicht zustellbar|delivery (status notification|has failed|failure)|mail delivery (failed|subsystem)|returned mail|failure notice|zustellung fehlgeschlagen|unzustellbare)/i;
const BOUNCE_BODY = /(mailer-daemon|postmaster@|user unknown|no such user|mailbox (unavailable|not found|does not exist)|address (not found|rejected)|recipient address rejected|5\.1\.1|existiert nicht)/i;
const MAIL_STOP = /(abmelden|austragen|keine (weiteren )?(e-?mails|mails|nachrichten|werbung)|nicht mehr (anschreiben|schreiben|kontaktieren)|unsubscribe|bitte (entfernen|löschen))/i;

/** Antwort auf eine Kampagnen-Mail einordnen (rein). */
export function classifyCampaignReply(subject: string | null | undefined, text: string | null | undefined, at?: Date): EmailReplyKind {
  const s = subject ?? "";
  const t = text ?? "";
  if (BOUNCE_SUBJECT.test(s) || BOUNCE_BODY.test(t)) return "bounce";
  if (isAutoReplyText(s, t)) return "auto";
  if (MAIL_STOP.test(`${s}\n${t}`)) return "stop";
  return classifyReply(t, s, at) === "NEGATIV" ? "negativ" : "interesse";
}

/** Empfänger zu einer Antwort finden: genannter Empfänger, sonst Absender-Adresse (letzte Mail-Kampagne in 30 Tagen). */
export async function findRecipientForReply(customerId: string, q: { recipientId?: string | null; fromEmail?: string | null; inReplyTo?: string | null }, now = new Date()): Promise<RecipientWithCampaign | null> {
  if (q.recipientId) {
    return prisma.campaignRecipient.findFirst({ where: { id: q.recipientId, campaign: { customerId } }, include: { campaign: true, existingCustomer: true } });
  }
  const mid = q.inReplyTo?.replace(/[<>\s]/g, "");
  if (mid) {
    const hit = await prisma.campaignRecipient.findFirst({ where: { mailMessageId: mid, campaign: { customerId } }, include: { campaign: true, existingCustomer: true } });
    if (hit) return hit;
  }
  const email = q.fromEmail?.trim().toLowerCase();
  if (!email) return null;
  return prisma.campaignRecipient.findFirst({
    where: { channel: "email", sentAt: { gte: new Date(now.getTime() - 30 * DAY) }, campaign: { customerId }, existingCustomer: { email } },
    orderBy: { sentAt: "desc" },
    include: { campaign: true, existingCustomer: true },
  });
}

export type EmailReplyResult = { ok: true; kind: EmailReplyKind; leadId: string | null; name: string } | { ok: false; error: string };

/** Antwort eintragen: Bounce, Auto-Antwort, Abmeldung, Absage oder Interesse (→ Lead im Trichter). */
export async function recordEmailReply(
  customerId: string,
  q: { recipientId?: string | null; fromEmail?: string | null; subject?: string | null; text?: string | null; kind?: EmailReplyKind | null },
  now = new Date(),
): Promise<EmailReplyResult> {
  const r = await findRecipientForReply(customerId, q, now);
  if (!r) return { ok: false, error: "Zu dieser Adresse gibt es in den letzten 30 Tagen keine Kampagnen-Mail." };
  const kind = q.kind ?? classifyCampaignReply(q.subject, q.text, now);
  const name = displayName(r.existingCustomer);
  if (kind === "auto") return { ok: true, kind, leadId: null, name };
  if (kind === "bounce") {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { bouncedAt: r.bouncedAt ?? now, status: r.status === "replied" ? r.status : "failed", reason: "unzustellbar" } });
    // Drosselung des Postfachs wie bei einer sofortigen Ablehnung
    const userId = r.campaign.senderUserId ?? r.campaign.createdById;
    const mb = userId ? await mailboxRun(userId, new Map()) : null;
    if (mb) {
      mb.state = afterSend(mb.state, "bounce", now, Math.random()).state;
      await saveMailbox(mb);
      await checkBounces(mb, now);
    }
    return { ok: true, kind, leadId: null, name };
  }
  if (kind === "stop") {
    await optOutExisting(r.existingCustomerId, { scope: "email", source: "antwort", recipientId: r.id, now });
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "replied", repliedAt: r.repliedAt ?? now, reason: "Abmeldung" } });
    return { ok: true, kind, leadId: null, name };
  }
  if (kind === "negativ") {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "replied", repliedAt: r.repliedAt ?? now, reason: "kein Interesse" } });
    return { ok: true, kind, leadId: null, name };
  }
  let leadId = r.leadId;
  if (!leadId) {
    const text = q.text?.trim();
    leadId = await createCampaignLead(customerId, r, text ? [{ label: "Antwort per E-Mail", value: text.slice(0, 1000) }] : []);
  }
  await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "replied", repliedAt: r.repliedAt ?? now, leadId, reason: null } });
  return { ok: true, kind, leadId, name };
}
