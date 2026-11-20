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
import { a, anredeZeile, type AnredeKontakt, type Ansprache } from "@/lib/ansprache";
import { kontaktFromExisting } from "@/lib/lead-anrede";
import { empfehlungsThema } from "@/lib/empfehlung/shared";
import { BESTAND_SOURCE } from "@/lib/lead-herkunft";
import { BLOCKED_REASON, chooseChannel, wantsConsentPs, countAudience, asChannelMode, type AudienceCounts, type Channel, type ChannelMode, type ConsentSettings, type LegalBasis } from "@/lib/bestand/einwilligung";
import { loadBestandAnsprache, loadConsentSettings, loadSuppression, optOutExisting, subjectOf, SUBJECT_SELECT, type Suppression } from "@/lib/bestand/einwilligung-server";
import { afterSend, bounceCheck, innerGap, isBounceError, mailSlots, providerDailyLimit, type SendOutcome, type ThrottleState } from "@/lib/bestand/mail-drossel";
import { consentUrl } from "@/lib/bestand/links";
import { buildCampaignMail, campaignMailFooter, consentPsLine, defaultCampaignMail, fillCampaignMail, hasImprint, imprintFromWebsiteInfo, istPersonenversicherung, ohneGedankenstriche } from "@/lib/bestand/kampagnen-mail";
import { classifyReply, isAutoReplyText } from "@/lib/vertrieb/sentiment";
import { isExclusiveAgent, mayOffer, offeredLines } from "@/lib/bestand/befugnis";
import { crossSellOffenWhere } from "@/lib/cross-sell-offen";
import type { ProvisionOverrides } from "@/lib/provision";
import { FOLLOW_UP_MAX_DAYS, FOLLOW_UP_OCCASIONS, followUpDecision, followUpMail, followUpText } from "@/lib/bestand/nachfassen";
import { erwarteteProvision, nachEuro, provisionForLine, quotenFor, type EigeneZahlen, type Spanne } from "@/lib/bestand/potenzial";

export type Occasion = "cross_sell" | "review" | "birthday" | "renewal" | "empfehlung";
export type Segment = {
  has?: string[];
  lacks?: string[];
  birthdayDays?: number;
  renewalDays?: number;
  /**
   * Weiteres Produkt anbieten (Ole, 18.11.2026, lib/cross-sell-verkauf.ts): nur Bestandskunden aus Kontakten mit
   * Abschluss ohne weiteres Produkt (gleiche Regel wie der Filter der Kontakte-Liste, lib/cross-sell-offen.ts).
   */
  ohneWeiteresProdukt?: boolean;
  /** Intern beim Planen aufgelöst (Leads zu ohneWeiteresProdukt), nie aus der Adresse übernommen. */
  leadIds?: string[];
};

export const OCCASIONS: Record<Occasion, { label: string; hint: string; purpose: string }> = {
  cross_sell: { label: "Weiteres Produkt anbieten", hint: "Kunden mit Sparte A, aber ohne Sparte B", purpose: "campaign_cross_sell" },
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
// Ausnahme (Paket 4, 20.11.2026): genau eine Erinnerung derselben Kampagne nach 5 Werktagen (lib/bestand/nachfassen.ts),
// nur wenn seitdem keine andere Kampagne geschrieben hat. Mit der Erinnerung beginnt der Abstand neu (lastCampaignAt).
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

/**
 * Geburtstagsgruß fällig? Glückwünsche gehen am Geburtstag raus (Berliner Datum), nicht beim Start der Kampagne
 * (Segment „Geburtstag in den nächsten 30 Tagen“). Bis 2 Tage danach noch „due“ (Geburtstag am Sonntag oder
 * außerhalb der Versandzeit), länger her: „missed“ (wird übersprungen). Ohne Geburtsdatum: „due“.
 */
export function birthdayState(b: Date | null | undefined, now = new Date()): "due" | "wait" | "missed" {
  if (!b) return "due";
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
  const today = Date.UTC(y, m - 1, d, 12);
  for (let k = 0; k <= 2; k++) if (daysUntilBirthday(b, new Date(today - k * DAY)) === 0) return "due";
  return daysUntilBirthday(b, new Date(today)) <= 300 ? "wait" : "missed";
}

/** Nur fällige Empfänger (Geburtstag: erst am Tag selbst), höchstens `limit`. */
function dueOnly<T extends { existingCustomer: { birthday: Date | null } }>(occasion: string, rows: T[], limit: number, now: Date): T[] {
  return (occasion === "birthday" ? rows.filter((r) => birthdayState(r.existingCustomer.birthday, now) === "due") : rows).slice(0, Math.max(0, limit));
}

/** Geburtstagskampagne: Empfänger, deren Geburtstag schon länger vorbei ist (z. B. Kampagne war pausiert), überspringen. */
async function skipMissedBirthdays(campaignId: string, now: Date): Promise<void> {
  const queued = await prisma.campaignRecipient.findMany({ where: { campaignId, status: "queued" }, select: { id: true, existingCustomer: { select: { birthday: true } } } });
  const missed = queued.filter((r) => birthdayState(r.existingCustomer.birthday, now) === "missed").map((r) => r.id);
  if (missed.length) await prisma.campaignRecipient.updateMany({ where: { id: { in: missed } }, data: { status: "skipped", reason: "Geburtstag verpasst" } });
}

// ─── Zielgruppe: Segment, dann Kanal und Rechtsgrundlage je Kunde ─────────

const CANDIDATE_SELECT = {
  id: true,
  lines: true,
  birthday: true,
  nextRenewal: true,
  lastCampaignAt: true,
  premiumTotal: true,
  leadId: true,
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
  c: { lines: string[]; birthday: Date | null; nextRenewal: Date | null; leadId?: string | null; referralLink?: { lastSentAt: Date | null } | null },
  occasion: Occasion,
  seg: Segment,
  now: Date,
): boolean {
  if (occasion === "cross_sell") {
    if (seg.ohneWeiteresProdukt && !(c.leadId && seg.leadIds?.includes(c.leadId))) return false;
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
  const [cands, settings, sup, segment] = await Promise.all([loadCandidates(customerId, now), loadConsentSettings(customerId), loadSuppression(customerId), resolveSegment(customerId, seg, now)]);
  const mode = effectiveMode(opts.mode ?? "whatsapp_first", opts.waAvailable ?? true);
  return planFromCandidates(cands, occasion, segment, mode, settings, sup, now);
}

/** „Ohne weiteres Produkt“: Leads wie im Filter der Kontakte-Liste laden (nur dieser Kunde). leadIds nie von außen. */
async function resolveSegment(customerId: string, seg: Segment, now: Date): Promise<Segment> {
  const { leadIds: _ignoriert, ...rest } = seg;
  void _ignoriert;
  if (!rest.ohneWeiteresProdukt) return rest;
  const leads = await prisma.lead.findMany({ where: { customerId, ...crossSellOffenWhere(now) }, select: { id: true }, take: 5000 });
  return { ...rest, leadIds: leads.map((l) => l.id) };
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

/** Name der Kampagne „Weiteres Produkt anbieten“ (Segment ohneWeiteresProdukt). */
export const WEITERES_PRODUKT_NAME = "Weiteres Produkt anbieten";

/**
 * Thema je Kunde, wenn die Kampagne keins vorgibt: erste naheliegende Ergänzung zu seinen Sparten, die er noch nicht
 * hat (Ausschließlichkeitsvertreter: nur angebotene Sparten), sonst „Absicherung“. Rein.
 */
export function naheliegendesThema(lines: string[], offered: Set<string> | null): string {
  const l = nextBestLine(lines, offered);
  return l ? (TOPIC_LABEL[l] ?? l) : "Absicherung";
}

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

/** Sparte für Überschriften („Kfz“ statt „KFZ“). */
export const LINE_LABEL = (line: string) => (line === "KFZ" ? "Kfz" : line);

/** Erste naheliegende Ergänzung (Sparte) zu den Sparten eines Kunden, die er anbieten darf; sonst null. Rein. */
export function nextBestLine(lines: string[], offered: Set<string> | null): string | null {
  for (const [has, lacks] of NEXT_BEST) {
    if (lines.includes(has) && !lines.includes(lacks) && mayOffer(offered, lacks)) return lacks;
  }
  return null;
}

export type Opportunity = {
  /** kampagne = Anlass zum Anschreiben; einwilligung = Kunden, die erst mit Einwilligung erreichbar werden */
  kind: "kampagne" | "einwilligung";
  occasion: Occasion;
  segment: Segment;
  topic: string | null;
  /** Kurzer Titel ohne Zahl („Kfz-Kunden ohne Hausrat“) */
  title: string;
  /** Ein Satz für „Warum?“ */
  why: string;
  count: number;
  whatsapp: number;
  email: number;
  excluded: number;
  /** Erwartete Provision (Schätzung, ungerundet; nur intern für den Vermittler) */
  euro: Spanne;
  /** Quoten aus eigenen Kampagnen statt Standard */
  ownQuotes: boolean;
};

/**
 * „Chancen“ nach erwarteter Provision (lib/bestand/potenzial.ts): größte Lücken, anstehende Anlässe und die Bitte um
 * Einwilligung als eigene Chance. Ausschließlichkeitsvertreter: nur Sparten nach mayOffer. rates = eigene Sätze aus
 * „Meine Provisionen“, own = eigene Zahlen je Anlass (ab EIGENE_MIN angeschriebenen Kunden zählen sie).
 */
export async function opportunities(
  customerId: string,
  now = new Date(),
  opts: { rates?: ProvisionOverrides; own?: Partial<Record<Occasion, EigeneZahlen>>; mailBlocked?: boolean } = {},
): Promise<Opportunity[]> {
  const [cands, settings, sup, wa, c, offered] = await Promise.all([
    loadCandidates(customerId, now),
    loadConsentSettings(customerId),
    loadSuppression(customerId),
    prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { empfehlungEnabled: true } }),
    offeredFor(customerId),
  ]);
  const mode = effectiveMode("whatsapp_first", wa?.status === "connected");
  const linesOf = new Map(cands.map((x) => [x.id, x.lines]));
  const provCache = new Map<string, number>();
  const prov = (line: string | null) => {
    const k = line ?? "";
    if (!provCache.has(k)) provCache.set(k, provisionForLine(line, opts.rates));
    return provCache.get(k)!;
  };
  // Durchschnittliche Provision der naheliegenden Ergänzung je Empfänger (Anlässe ohne feste Sparte)
  const avgProv = (ids: string[]) => (ids.length ? ids.reduce((n, id) => n + prov(nextBestLine(linesOf.get(id) ?? [], offered)), 0) / ids.length : prov(null));
  const opp = (o: Occasion, s: Segment, topic: string | null, title: string, why: string, line?: string): Opportunity => {
    let p = planFromCandidates(cands, o, s, mode, settings, sup, now);
    // Wie im Kampagnen-Bildschirm: E-Mail gerade nicht möglich, WhatsApp schon → nur WhatsApp zählen (gleiche Zahl, gleicher Euro-Wert)
    if (opts.mailBlocked && mode === "whatsapp_first" && p.counts.whatsapp > 0 && p.counts.email > 0) p = planFromCandidates(cands, o, s, "whatsapp", settings, sup, now);
    const ids = p.recipients.map((r) => r.id);
    const q = quotenFor(o, opts.own?.[o]);
    const euro = erwarteteProvision(ids.length, q, line ? prov(line) : avgProv(ids));
    return { kind: "kampagne", occasion: o, segment: s, topic, title, why, count: ids.length, whatsapp: p.counts.whatsapp, email: p.counts.email, excluded: p.counts.excludedTotal, euro, ownQuotes: q.own };
  };
  const gaps: Opportunity[] = [];
  for (const [has, lacks] of NEXT_BEST) {
    // Ausschließlichkeitsvertreter: nur Sparten, die er anbietet
    if (!mayOffer(offered, lacks)) continue;
    const topic = TOPIC_LABEL[lacks] ?? lacks;
    const o = opp("cross_sell", { has: [has], lacks: [lacks] }, topic, `${LINE_LABEL(has)}-Kunden ohne ${topic}`, `Haben ${LINE_LABEL(has)} bei Ihnen, aber keine ${topic}.`, lacks);
    if (o.count) gaps.push(o);
  }
  const extra = [
    opp("renewal", { renewalDays: 60 }, null, "Vertrag läuft in 60 Tagen ab", "Guter Anlass für einen Vergleich, bevor gekündigt wird."),
    opp("birthday", { birthdayDays: 30 }, null, "Geburtstag in den nächsten 30 Tagen", "Ein persönlicher Gruß öffnet das Gespräch."),
    opp("review", {}, null, "Jahresgespräch", "Verträge prüfen: Passt Beitrag und Leistung noch?"),
    ...(c?.empfehlungEnabled ? [opp("empfehlung", {}, null, "Um eine Empfehlung bitten", "Höchstens einmal im Jahr je Kunde.")] : []),
  ].filter((o) => o.count);
  const kampagnen = nachEuro([...nachEuro(gaps).slice(0, 4), ...extra]);
  // Einwilligung als eigene Chance: nicht abgemeldet oder gesperrt, mit Kontaktweg, aber ohne Einwilligung für einen Kanal
  const ohne = cands.filter((x) => {
    const sub = subjectOf(x, sup);
    if (sub.blockedAt || sub.optOutAt || sub.suppressed?.all) return false;
    if (x.emailConsent === "ja" || x.whatsappConsent === "ja") return false;
    const mailOpen = !!x.email && !x.emailOptOutAt && !sub.suppressed?.email && x.emailConsent !== "nein";
    const waOpen = !!x.phone && x.whatsappConsent !== "nein";
    return mailOpen || waOpen;
  });
  const out = [...kampagnen];
  if (ohne.length) {
    const avgGap = avgProv(ohne.map((x) => x.id));
    out.push({
      kind: "einwilligung",
      occasion: "cross_sell",
      segment: {},
      topic: null,
      title: "Erreichbar mit Einwilligung",
      why: "Mit Einwilligung dürfen Sie diesen Kunden auch weitere Produkte anbieten.",
      count: ohne.length,
      whatsapp: 0,
      email: 0,
      excluded: 0,
      euro: erwarteteProvision(ohne.length, quotenFor("einwilligung"), avgGap),
      ownQuotes: false,
    });
  }
  return nachEuro(out);
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
  /** „Nach 5 Werktagen einmal erinnern“ (Paket 4), Standard an */
  followUp?: boolean;
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
  const ansprache = await loadBestandAnsprache(opts.customerId);
  const name =
    opts.name ??
    (opts.occasion === "cross_sell"
      ? opts.segment.ohneWeiteresProdukt
        ? WEITERES_PRODUKT_NAME
        : `${opts.segment.has?.join(", ")} ohne ${opts.segment.lacks?.join(", ")}`
      : OCCASIONS[opts.occasion].label);
  return prisma.customerCampaign.create({
    data: {
      customerId: opts.customerId,
      name,
      occasion: opts.occasion,
      segment: { ...opts.segment, leadIds: undefined } as Prisma.InputJsonValue,
      topic: opts.topic,
      dailyLimit: Math.max(10, Math.min(1000, Math.round(opts.dailyLimit))),
      status: "running",
      startedAt: now,
      createdById: opts.createdById ?? null,
      senderUserId,
      channelMode: mode,
      // Nachfassen nur für Anlässe mit Erinnerung (nicht Geburtstag und Empfehlung)
      followUp: (opts.followUp ?? true) && FOLLOW_UP_OCCASIONS.includes(opts.occasion),
      // Unveränderter Standardtext → null (dann gilt immer der aktuelle Standard)
      mailSubject: ownText(opts.mailSubject, defaultCampaignMail(opts.occasion, ansprache).subject, 200),
      mailBody: ownText(opts.mailBody, defaultCampaignMail(opts.occasion, ansprache).body, 5000),
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
  // Ruhende Konten (lib/ruhend.ts): kein Versand
  const campaigns = await prisma.customerCampaign.findMany({ where: { status: "running", customer: { dormantSince: null } }, include: { customer: { select: { name: true, existingCustomersEnabled: true, empfehlungEnabled: true } } } });
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
    if (c.occasion === "birthday") await skipMissedBirthdays(c.id, now);
    if (!(await prisma.campaignRecipient.count({ where: { campaignId: c.id, status: "queued" } }))) {
      await prisma.customerCampaign.update({ where: { id: c.id }, data: { status: "done", finishedAt: now } });
      continue;
    }
    const today =
      (await prisma.campaignRecipient.count({ where: { campaignId: c.id, sentAt: { gte: dayStart } } })) +
      (await prisma.campaignRecipient.count({ where: { campaignId: c.id, followUpAt: { gte: dayStart } } }));
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
  // Nachfassen (Paket 4): eine Erinnerung nach 5 Werktagen, auch für fertig verschickte Kampagnen
  const f = await runFollowUps(now, { waWindow, mailWindow, dayStart, ctxOf, mailboxes, opts });
  res.sent += f.sent;
  res.mailed += f.mailed;
  res.failed += f.failed;
  // Viele Bounces → Postfach pausiert, Warnung
  for (const mb of mailboxes.values()) await checkBounces(mb, now);
  return res;
}

const FOLLOW_UP_PER_RUN = 25;

/**
 * Erinnerungen versenden (Paket 4). Kandidaten: verschickt, keine Antwort, nicht abgemeldet, nicht unzustellbar, noch
 * nicht erinnert, Kampagne läuft oder ist fertig verschickt und hat den Schalter an. Vor jedem Versand gelten dieselben
 * Prüfungen wie beim ersten Versand (followUpDecision). Der Empfänger wird vor dem Versand per bedingtem Update
 * markiert (followUpAt nur, wenn noch leer): Eine zweite Erinnerung ist damit ausgeschlossen, auch bei parallelen Läufen.
 * Zählt aufs Kontingent (WhatsApp: Monatskontingent, E-Mail: E-Mail-Kontingent) und aufs Tageslimit der Kampagne.
 */
async function runFollowUps(
  now: Date,
  o: {
    waWindow: boolean;
    mailWindow: boolean;
    dayStart: Date;
    ctxOf: (customerId: string) => Promise<{ settings: ConsentSettings & Awaited<ReturnType<typeof loadConsentSettings>>; sup: Suppression }>;
    mailboxes: Map<string, MailboxRun>;
    opts: RunOpts;
  },
): Promise<{ sent: number; mailed: number; failed: number }> {
  const out = { sent: 0, mailed: 0, failed: 0 };
  const since = new Date(now.getTime() - FOLLOW_UP_MAX_DAYS * DAY);
  const campaigns = await prisma.customerCampaign.findMany({
    where: {
      followUp: true,
      status: { in: ["running", "done"] },
      occasion: { in: [...FOLLOW_UP_OCCASIONS] },
      customer: { dormantSince: null, existingCustomersEnabled: true },
      recipients: { some: { status: "sent", followUpAt: null, repliedAt: null, sentAt: { gte: since } } },
    },
    include: { customer: { select: { name: true, existingCustomersEnabled: true, empfehlungEnabled: true } } },
  });
  for (const c of campaigns) {
    const today =
      (await prisma.campaignRecipient.count({ where: { campaignId: c.id, sentAt: { gte: o.dayStart } } })) +
      (await prisma.campaignRecipient.count({ where: { campaignId: c.id, followUpAt: { gte: o.dayStart } } }));
    let budget = Math.min(FOLLOW_UP_PER_RUN, c.dailyLimit - today);
    if (budget <= 0) continue;
    const rows = await prisma.campaignRecipient.findMany({
      where: { campaignId: c.id, status: "sent", followUpAt: null, repliedAt: null, optOutAt: null, bouncedAt: null, sentAt: { gte: since } },
      orderBy: [{ sentAt: "asc" }, { id: "asc" }],
      take: 200,
      include: { existingCustomer: true },
    });
    if (!rows.length) continue;
    const cx = await o.ctxOf(c.customerId);
    const avail = await channelAvailability(c.customerId, c.occasion as Occasion, c.senderUserId ?? c.createdById);
    const mode = effectiveMode(asChannelMode(c.channelMode), avail.waAvailable);
    const slug = await bookingSlugFor(c.customerId);
    let waQuota: Awaited<ReturnType<typeof bestandQuota>> | null = null;
    let mail: { mb: MailboxRun; slots: number; imprint: string; meinname: string } | null | undefined;
    for (const r of rows) {
      if (budget <= 0) break;
      const ec = r.existingCustomer;
      const conv = r.conversationId ? await prisma.conversation.findUnique({ where: { id: r.conversationId }, select: { windowExpiresAt: true } }) : null;
      const d = followUpDecision({
        occasion: c.occasion,
        campaign: { followUp: c.followUp, status: c.status, channelMode: mode },
        recipient: r,
        subject: subjectOf(ec, cx.sup),
        settings: cx.settings,
        lastCampaignAt: ec.lastCampaignAt,
        waWindowOpen: !!conv?.windowExpiresAt && conv.windowExpiresAt > now,
        now,
      });
      if (!d.channel || ec.blockedAt) continue;
      if (d.channel === "whatsapp") {
        if (!o.waWindow) continue;
        waQuota ??= await bestandQuota(c.customerId, now);
        // Erinnerung nur aus dem Monatskontingent (Pakete bleiben für erste Nachrichten)
        if (waQuota.includedRemaining <= 0) continue;
        if (!(await claimFollowUp(r.id, "whatsapp", now))) continue;
        try {
          const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
          const { terminlinkFuer } = await import("@/lib/bestand/terminlink");
          await sendWhatsAppMessage({ customerId: c.customerId, to: ec.phone!, body: ohneGedankenstriche(followUpText(kontaktFromExisting(ec), cx.settings.ansprache, r.sentAt!, terminlinkFuer(slug, r.id))), sentBy: "system" });
          consume(waQuota, null);
          await prisma.existingCustomer.update({ where: { id: ec.id }, data: { lastCampaignAt: now } });
          out.sent++;
          budget--;
        } catch (err) {
          reportError(err, "campaign-followup", { campaign: c.id });
          await releaseFollowUp(r.id);
          out.failed++;
        }
        continue;
      }
      if (!o.mailWindow || !avail.mailbox) continue;
      if (mail === undefined) mail = await followUpMailbox(c, cx, avail.mailbox, o.mailboxes, now);
      if (!mail || mail.slots <= 0) continue;
      if (!(await claimFollowUp(r.id, "email", now))) continue;
      const res = await sendFollowUpMail(c, r, mail, cx, slug, now, o.opts);
      mail.slots--;
      if (res === "ok") {
        out.mailed++;
        budget--;
      } else {
        out.failed += res === "bounce" ? 1 : 0;
        if (res === "error") break;
      }
    }
  }
  return out;
}

/** Erinnerung belegen: nur, wenn noch keine verschickt ist und keine Antwort vorliegt (atomar). */
async function claimFollowUp(id: string, channel: Channel, now: Date): Promise<boolean> {
  const u = await prisma.campaignRecipient.updateMany({ where: { id, status: "sent", followUpAt: null, repliedAt: null, optOutAt: null }, data: { followUpAt: now, followUpChannel: channel } });
  return u.count === 1;
}

/** Versand gescheitert (Postfach- oder Netzfehler): Markierung zurücknehmen, ein späterer Lauf versucht es erneut. */
async function releaseFollowUp(id: string) {
  await prisma.campaignRecipient.update({ where: { id }, data: { followUpAt: null, followUpChannel: null } });
}

async function followUpMailbox(
  c: CampaignRow,
  cx: { settings: Awaited<ReturnType<typeof loadConsentSettings>> },
  box: NonNullable<Availability["mailbox"]>,
  cache: Map<string, MailboxRun>,
  now: Date,
): Promise<{ mb: MailboxRun; slots: number; imprint: string; meinname: string } | null> {
  const imprint = cx.settings.imprint ?? imprintFromWebsiteInfo(cx.settings.websiteInfo);
  // Impressum-Sperre wie beim ersten Versand
  if (!hasImprint(imprint)) return null;
  const mb = await mailboxRun(box.userId, cache);
  if (!mb) return null;
  mb.sentToday ??= await mailsSentToday(mb.userId, berlinDayStart(now));
  const mailQuota = await bestandMailQuota(c.customerId, now);
  const slots = Math.min(mailSlots(mb.state, { sentToday: mb.sentToday, baseLimit: providerDailyLimit(mb.provider, mb.email), now }), mailQuota.remaining);
  const { advisorPerson } = await import("@/lib/lead-anrede");
  const sender = await prisma.user.findUnique({ where: { id: mb.userId }, select: { displayName: true } });
  return { mb, slots, imprint: imprint!, meinname: advisorPerson(c.customer.name, sender?.displayName ?? mb.fromName) };
}

/** Kampagnen-Mails eines Postfachs heute (erste Nachrichten und Erinnerungen). */
async function mailsSentToday(userId: string, dayStart: Date): Promise<number> {
  const [first, follow] = await Promise.all([
    prisma.campaignRecipient.count({ where: { channel: "email", sentAt: { gte: dayStart }, campaign: { senderUserId: userId } } }),
    prisma.campaignRecipient.count({ where: { followUpChannel: "email", followUpAt: { gte: dayStart }, campaign: { senderUserId: userId } } }),
  ]);
  return first + follow;
}

async function sendFollowUpMail(
  c: CampaignRow,
  r: RecipientRow,
  m: { mb: MailboxRun; imprint: string; meinname: string },
  cx: { settings: Awaited<ReturnType<typeof loadConsentSettings>> },
  slug: string | null,
  now: Date,
  opts: RunOpts,
): Promise<SendOutcome> {
  const ec = r.existingCustomer;
  const an = cx.settings.ansprache;
  const { terminlinkFuer } = await import("@/lib/bestand/terminlink");
  const { unsubscribeUrl, unsubscribePostUrl } = await import("@/lib/bestand/links");
  const { firmDisplayName } = await import("@/lib/lead-anrede");
  const { sendViaPostfach } = await import("@/lib/mail/postfach");
  // Betreff der ersten Mail (auch bei WhatsApp als erster Nachricht), bei Personenversicherungen neutral
  const first = await campaignMailFor({ ...c, topic: await recipientTopic(c, ec) }, ec, {
    recipientId: r.id,
    customerName: c.customer.name,
    imprint: m.imprint,
    meinname: m.meinname,
    ansprache: an,
    extras: await recipientExtras(c, ec, r.id, slug),
  });
  const fu = followUpMail({ kontakt: kontaktFromExisting(ec), an, sentAt: r.sentAt!, terminlink: terminlinkFuer(slug, r.id), subject: first.subject, meinname: m.meinname });
  const footer = campaignMailFooter({ firm: firmDisplayName(c.customer.name), unsubscribeUrl: unsubscribeUrl(r.id), imprint: m.imprint, ansprache: an });
  const built = buildCampaignMail(ohneGedankenstriche(fu.body), footer);
  const domain = (m.mb.email.split("@")[1] ?? "mail").toLowerCase();
  const result = await sendViaPostfach(
    m.mb.userId,
    {
      to: ec.email!,
      subject: ohneGedankenstriche(fu.subject),
      text: built.text,
      html: built.html,
      messageId: `bk-${r.id}-2@${domain}`,
      headers: {
        "List-Unsubscribe": `<${unsubscribePostUrl(r.id)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        ...(r.mailMessageId ? { "In-Reply-To": `<${r.mailMessageId}>`, References: `<${r.mailMessageId}>` } : {}),
      },
    },
    { customerId: c.customerId, existingCustomerId: ec.id, art: "bestandskampagne", label: `${c.name} (Erinnerung)` },
  );
  let outcome: SendOutcome;
  if (result.ok) {
    outcome = "ok";
    await prisma.existingCustomer.update({ where: { id: ec.id }, data: { lastCampaignAt: now } });
    m.mb.sentToday = (m.mb.sentToday ?? 0) + 1;
  } else if (isBounceError(result.raw ?? result.error)) {
    // Erinnerung bleibt belegt (keine zweite), Adresse gilt als unzustellbar
    outcome = "bounce";
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { bouncedAt: now } });
  } else {
    outcome = "error";
    await releaseFollowUp(r.id);
    reportError(new Error(result.error), "campaign-followup-mail", { campaign: c.id });
  }
  const u = afterSend(m.mb.state, outcome, now, (opts.rand ?? Math.random)());
  m.mb.state = u.state;
  await saveMailbox(m.mb);
  if (u.warn) await warnMailbox(m.mb, u.warn);
  if (outcome === "ok") await (opts.sleep ?? realSleep)(innerGap((opts.rand ?? Math.random)()));
  return outcome;
}

/** Vor dem Versand neu prüfen: Kanal und Rechtsgrundlage nach aktuellem Stand (Abmeldung, Widerruf). */
async function recheck(r: RecipientRow, c: CampaignRow, cx: { settings: ConsentSettings; sup: Suppression }, mode: ChannelMode, now: Date): Promise<Channel | null> {
  // Inzwischen beendet, gesperrt oder gelöscht (Vermittler hat während des Laufs gehandelt): nicht mehr senden
  const cur = await prisma.campaignRecipient.findUnique({ where: { id: r.id }, select: { status: true, campaign: { select: { status: true } }, existingCustomer: { select: { blockedAt: true } } } });
  if (!cur || cur.status !== "queued" || cur.campaign.status !== "running") return null;
  if (cur.existingCustomer.blockedAt) {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "skipped", reason: BLOCKED_REASON } });
    return null;
  }
  // Abstand zwischen zwei Kampagnen auch beim Versand: Wer gleichzeitig in zwei Kampagnen wartet (z. B. Ablauf und
  // Geburtstag), bekommt nicht zwei Nachrichten kurz hintereinander
  const last = r.existingCustomer.lastCampaignAt;
  if (last && last > new Date(now.getTime() - COOLDOWN_DAYS * DAY)) {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "skipped", reason: `in den letzten ${COOLDOWN_DAYS} Tagen schon angeschrieben` } });
    return null;
  }
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
  cx: { settings: ConsentSettings & { ansprache: Ansprache }; sup: Suppression },
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
  const take = Math.min(limit, quota.remaining);
  const batch = dueOnly(
    c.occasion,
    await prisma.campaignRecipient.findMany({
      where: { campaignId: c.id, status: "queued", channel: "whatsapp" },
      // Wertvollste Kunden zuerst (höchster Jahresbeitrag), dann in Anlage-Reihenfolge
      orderBy: [{ existingCustomer: { premiumTotal: { sort: "desc", nulls: "last" } } }, { id: "asc" }],
      // Geburtstag: alle laden und nach Fälligkeit filtern (sonst blockieren noch nicht fällige die fälligen)
      ...(c.occasion === "birthday" ? {} : { take }),
      include: { existingCustomer: true },
    }),
    take,
    now,
  );
  const { sendWhatsAppNotice, NoTemplateError } = await import("@/lib/whatsapp/templates");
  const slug = await bookingSlugFor(c.customerId);
  for (const r of batch) {
    const ec = r.existingCustomer;
    if ((await recheck(r, c, cx, mode, now)) !== "whatsapp") continue;
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
        // Empfehlung v4: Thema vor dem Link ({{2}}), ältere Fassung nur mit Link
        // {{2}}: bei Personenversicherungen neutral statt der Sparte (vorlagenThema)
        params: referral ? [first || "Hallo", empfehlungsThema(ec.lines[0]), referral.url] : [first || "Hallo", vorlagenThema(c.occasion as Occasion, topic)],
        ...(referral ? { legacyParams: [first || "Hallo", referral.url] } : {}),
        text: referral ? referral.text : campaignText(c.occasion as Occasion, kontakt, topic, cx.settings.ansprache, await recipientExtras(c, ec, r.id, slug)),
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
  opts: {
    recipientId: string;
    customerName: string;
    imprint: string | null;
    meinname: string;
    empfehlungslink?: string | null;
    ansprache?: Ansprache;
    extras?: TextExtras;
    /** Persönlicher Einwilligungslink als P.S. (nur wenn wantsConsentPs gilt, Paket 3) */
    consentLink?: string | null;
  },
) {
  const { unsubscribeUrl } = await import("@/lib/bestand/links");
  const { firmDisplayName } = await import("@/lib/lead-anrede");
  const occasion = c.occasion as Occasion;
  // Ansprache der Bestandskunden (Einstellung des Vermittlers); ohne Angabe aus der Datenbank
  const an = opts.ansprache ?? (await loadBestandAnsprache(c.customerId));
  const def = defaultCampaignMail(occasion, an);
  const tpl = { subject: c.mailSubject ?? def.subject, body: c.mailBody ? ohneGedankenstriche(c.mailBody) : def.body };
  const x = opts.extras ?? {};
  const filled = fillCampaignMail(tpl, { ansprache: an, kontakt: kontaktFromExisting(ec), thema: c.topic, empfehlungslink: opts.empfehlungslink, meinname: opts.meinname, terminlink: x.terminlink, datum: x.datum, anzahl: x.anzahl });
  const url = unsubscribeUrl(opts.recipientId);
  const footer = campaignMailFooter({ firm: firmDisplayName(opts.customerName), unsubscribeUrl: url, imprint: opts.imprint, ansprache: an });
  const body = opts.consentLink ? `${filled.body}\n\n${consentPsLine(opts.consentLink, an)}` : filled.body;
  return { subject: ohneGedankenstriche(filled.subject), ...buildCampaignMail(body, footer), unsubscribeUrl: url };
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
  mb.sentToday ??= await mailsSentToday(mb.userId, dayStart);
  const mailQuota = await bestandMailQuota(c.customerId, now);
  const slots = Math.min(mailSlots(mb.state, { sentToday: mb.sentToday, baseLimit: providerDailyLimit(mb.provider, mb.email), now }), budget, mailQuota.remaining);
  if (slots <= 0) return out;
  const batch = dueOnly(
    c.occasion,
    await prisma.campaignRecipient.findMany({
      where: { campaignId: c.id, status: "queued", channel: "email" },
      orderBy: [{ existingCustomer: { premiumTotal: { sort: "desc", nulls: "last" } } }, { id: "asc" }],
      ...(c.occasion === "birthday" ? {} : { take: slots }),
      include: { existingCustomer: true },
    }),
    slots,
    now,
  );
  const imprint = cx.settings.imprint ?? imprintFromWebsiteInfo(cx.settings.websiteInfo);
  // Impressum-Sperre auch beim Versand (Recht, 19.11.2026): ohne Pflichtangaben geht keine Kampagnen-Mail raus,
  // die Empfänger bleiben in der Warteschlange, bis das Impressum hinterlegt ist (Start ist ohnehin gesperrt).
  if (!hasImprint(imprint)) return out;
  const { advisorPerson } = await import("@/lib/lead-anrede");
  const sender = await prisma.user.findUnique({ where: { id: mb.userId }, select: { displayName: true } });
  const meinname = advisorPerson(c.customer.name, sender?.displayName ?? mb.fromName);
  const { sendViaPostfach } = await import("@/lib/mail/postfach");
  const { unsubscribePostUrl } = await import("@/lib/bestand/links");
  const sleep = opts.sleep ?? realSleep;
  const rand = opts.rand ?? Math.random;
  const slug = await bookingSlugFor(c.customerId);
  let first = true;
  for (const r of batch) {
    const ec = r.existingCustomer;
    if ((await recheck(r, c, cx, mode, now)) !== "email") continue;
    if (!first) await sleep(innerGap(rand()));
    first = false;
    const referral = c.occasion === "empfehlung" ? await referralCampaignParts(c.customerId, ec.id, ec.firstName?.split(/\s+/)[0] || "", kontaktFromExisting(ec)) : null;
    // P.S. mit Einwilligungslink nur bei Werbeerlaubnis per E-Mail und fehlender Einwilligung (Paket 3)
    const consentLink = wantsConsentPs(subjectOf(ec, cx.sup), cx.settings, c.occasion as Occasion) ? consentUrl(ec.id) : null;
    const mail = await campaignMailFor({ ...c, topic: await recipientTopic(c, ec) }, ec, {
      recipientId: r.id,
      customerName: c.customer.name,
      imprint,
      meinname,
      empfehlungslink: referral?.url ?? null,
      ansprache: cx.settings.ansprache,
      extras: await recipientExtras(c, ec, r.id, slug),
      consentLink,
    });
    const messageId = `bk-${r.id}@${(mb.email.split("@")[1] ?? "mail").toLowerCase()}`;
    const result = await sendViaPostfach(mb.userId, {
      to: ec.email!,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      messageId,
      headers: { "List-Unsubscribe": `<${unsubscribePostUrl(r.id)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }, { customerId: c.customerId, existingCustomerId: ec.id, art: "bestandskampagne", label: c.name });
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
async function recipientTopic(c: { occasion: string; topic: string | null; customerId?: string }, ec: { id: string; nextRenewal: Date | null; lines?: string[] }): Promise<string | null> {
  // Lücke schließen ohne Thema (z. B. „Weiteres Produkt anbieten“): naheliegende Ergänzung zum Vertrag des Kunden
  if (c.occasion === "cross_sell" && !c.topic?.trim()) return naheliegendesThema(ec.lines ?? [], c.customerId ? await offeredFor(c.customerId) : null);
  if (c.occasion !== "renewal" || !ec.nextRenewal) return c.topic;
  const due = await prisma.existingContract.findFirst({ where: { existingCustomerId: ec.id, renewalDate: ec.nextRenewal }, select: { line: true }, orderBy: { id: "asc" } });
  return renewalTopic(due?.line ?? null, c.topic);
}

/**
 * Ablauf/Wechsel ohne erkennbare Sparte (z. B. „Sonstiges“): Die WhatsApp-Vorlage braucht trotzdem ein Thema,
 * sonst stünde „Bei Ihrem Vertrag () steht bald …“ in der Nachricht.
 */
export const RENEWAL_TOPIC_FALLBACK = "Versicherung";

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

/** Sparte bzw. Thema → Vertragswort mit Artikel „eine“/„Ihre“ („Hausratversicherung“ statt „Hausrat“), sonst null. */
const VERTRAG_LABEL: Record<string, string> = {
  BU: "Berufsunfähigkeitsversicherung", KFZ: "Kfz-Versicherung", Haftpflicht: "Privathaftpflicht", Vorsorge: "Altersvorsorge",
  Kranken: "Krankenzusatzversicherung", Wohngebäude: "Wohngebäudeversicherung", Hausrat: "Hausratversicherung", Unfall: "Unfallversicherung",
  Rechtsschutz: "Rechtsschutzversicherung", Pflege: "Pflegevorsorge",
};

/** Vertragswort zu Sparte („KFZ“) oder Themenwort („Hausrat“); unbekannt (eigenes Thema) → null. Rein. */
export function vertragWort(topicOrLine: string | null | undefined): string | null {
  const t = topicOrLine?.trim();
  if (!t) return null;
  if (VERTRAG_LABEL[t]) return VERTRAG_LABEL[t];
  const key = Object.keys(TOPIC_LABEL).find((k) => TOPIC_LABEL[k].toLowerCase() === t.toLowerCase());
  if (key) return VERTRAG_LABEL[key] ?? null;
  return Object.values(VERTRAG_LABEL).find((v) => v.toLowerCase() === t.toLowerCase()) ?? null;
}

/** Werte je Empfänger für die neuen Texte (Paket 2). */
export type TextExtras = {
  /** Buchungsseite mit Zuordnung (lib/bestand/terminlink.ts); ohne entfällt der Satz. */
  terminlink?: string | null;
  /** Ablauf/Verlängerung, formatiert („01.03.2027“) */
  datum?: string | null;
  /** Zahl der Verträge beim Vermittler */
  anzahl?: number | null;
  /** Vorhandene Sparte (Cross-Selling: „Ihre Kfz-Versicherung läuft über mich“) */
  vorhanden?: string | null;
};

/** Ablaufdatum für Texte an Kunden („01.03.2027“, Berliner Zeit). */
export function datumText(d: Date | null | undefined): string | null {
  return d ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }) : null;
}

/**
 * Text im offenen 24-h-Fenster (sonst gilt die freigegebene Vorlage). Ansprache wie vom Vermittler eingestellt
 * (Standard Sie): „Guten Tag Frau Schneider,“ bzw. „Hallo Erika,“ (lib/ansprache.ts). Paket 2 (20.11.2026): persönlich,
 * ohne unbelegte Behauptung („Viele meiner Kunden haben … eine Lücke“ ist raus), Ende mit Terminlink oder „einfach
 * mit Ja antworten“. Nie Euro, nie „Garantie“, ohne Gedankenstriche.
 */
export function campaignText(o: Occasion, kontakt: AnredeKontakt | string, topic: string | null, an: Ansprache = "sie", x: TextExtras = {}): string {
  const hi = anredeZeile(an, typeof kontakt === "string" ? { firstName: kontakt } : kontakt).replace(/,$/, "");
  const ja = x.terminlink
    ? a(an, `Termin wählen: ${x.terminlink} oder antworte einfach mit Ja.`, `Termin wählen: ${x.terminlink} oder antworten Sie einfach mit Ja.`)
    : a(an, "Antworte einfach mit Ja.", "Antworten Sie einfach mit Ja.");
  switch (o) {
    case "cross_sell": {
      const neu = vertragWort(topic);
      const hat = vertragWort(x.vorhanden);
      const lead = hat && hat !== neu ? a(an, `deine ${hat} läuft über mich, `, `Ihre ${hat} läuft über mich, `) : "";
      const luecke = neu
        ? a(an, `eine ${neu} habe ich bei dir noch nicht notiert`, `eine ${neu} habe ich bei Ihnen noch nicht notiert`)
        : a(an, `zum Thema ${topic ?? "Absicherung"} habe ich bei dir noch keinen Vertrag notiert`, `zum Thema ${topic ?? "Absicherung"} habe ich bei Ihnen noch keinen Vertrag notiert`);
      return `${hi}, ${lead}${luecke}. ${a(an, "Soll ich kurz prüfen, ob du dort gut versorgt bist?", "Soll ich kurz prüfen, ob Sie dort gut versorgt sind?")} ${ja}`;
    }
    case "review": {
      const n = x.anzahl ?? 0;
      const zahl = n >= 2 ? a(an, `du hast ${n} Verträge bei mir. `, `Sie haben ${n} Verträge bei mir. `) : "";
      return `${hi}, ${zahl}${zahl ? "Einmal" : "einmal"} im Jahr lohnt ein kurzer Blick, ob Beitrag und Leistung noch zu ${a(an, "deiner", "Ihrer")} Situation passen. 15 Minuten am Telefon reichen. ${ja}`;
    }
    case "birthday":
      return `${hi}, herzlichen Glückwunsch zum Geburtstag und alles Gute für das neue Lebensjahr! ${a(an, "Hat sich bei dir etwas verändert, etwa Umzug, Familie oder Job? Dann schauen wir gern kurz gemeinsam drauf.", "Hat sich bei Ihnen etwas verändert, etwa Umzug, Familie oder Job? Dann schauen wir gern kurz gemeinsam drauf.")}`;
    case "empfehlung":
      return `${hi}, ${a(an, "kennst du jemanden, dem ich genauso weiterhelfen kann? Über deinen persönlichen Link", "kennen Sie jemanden, dem ich genauso weiterhelfen kann? Über Ihren persönlichen Link")} kann die Person ganz einfach selbst Kontakt mit mir aufnehmen.`;
    case "renewal": {
      const v = vertragWort(topic);
      const wer = v ? a(an, `deine ${v}`, `Ihre ${v}`) : a(an, "dein Vertrag", "Ihr Vertrag") + (topic ? ` (${topic})` : "");
      return `${hi}, ${wer} verlängert sich ${x.datum ? `am ${x.datum}` : "bald"}. Bis dahin kann man Beitrag und Leistung noch gut vergleichen. ${a(an, "Soll ich das kurz für dich prüfen?", "Soll ich das kurz für Sie prüfen?")} ${ja}`;
    }
  }
}

/** WhatsApp-Vorlagen-Platzhalter {{2}}: bei Personenversicherungen neutral statt der Sparte (Recht, 19.11.2026). Rein. */
export function vorlagenThema(o: Occasion, topic: string | null): string {
  const neutral = o === "renewal" ? RENEWAL_TOPIC_FALLBACK : "Absicherung";
  if (!topic) return o === "renewal" ? RENEWAL_TOPIC_FALLBACK : "";
  return istPersonenversicherung(topic) ? neutral : topic;
}

/** Buchungsseite des Vermittlers (nur mit verbundenem Kalender), sonst null: Dann entfällt der Terminlink. */
export async function bookingSlugFor(customerId: string): Promise<string | null> {
  const cal = await prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true, bookingSlug: true } });
  if (cal?.status !== "connected") return null;
  if (cal.bookingSlug) return cal.bookingSlug;
  const { getOrCreateBookingSlug } = await import("@/lib/calendar");
  return getOrCreateBookingSlug(customerId).catch(() => null);
}

/** Werte je Empfänger: Ablaufdatum, Zahl der Verträge, vorhandene Sparte und Terminlink mit Zuordnung. */
async function recipientExtras(
  c: { occasion: string; segment?: Prisma.JsonValue | null },
  ec: { id: string; nextRenewal: Date | null; lines: string[] },
  recipientId: string,
  slug: string | null,
): Promise<TextExtras> {
  const { terminlinkFuer } = await import("@/lib/bestand/terminlink");
  const has = ((c.segment ?? {}) as Segment).has?.find((l) => ec.lines.includes(l)) ?? ec.lines[0] ?? null;
  return {
    terminlink: c.occasion === "birthday" || c.occasion === "empfehlung" ? null : terminlinkFuer(slug, recipientId),
    datum: c.occasion === "renewal" ? datumText(ec.nextRenewal) : null,
    anzahl: c.occasion === "review" ? await prisma.existingContract.count({ where: { existingCustomerId: ec.id } }).catch(() => ec.lines.length) : null,
    vorhanden: c.occasion === "cross_sell" ? has : null,
  };
}

/**
 * Buchung über den Terminlink einer Kampagne (bk, lib/bestand/terminlink.ts): Empfänger gilt als geantwortet, Lead
 * und Termin zählen für die Kampagne (Ergebnis „Termin“). Ohne Lead wird der Kampagnen-Lead angelegt und mit dem
 * Gespräch verknüpft. Falsche Signatur oder fremder Kunde: nichts. Rückgabe: Lead für den Termin.
 */
export async function bookingFromCampaign(customerId: string, bk: string, conversationId: string, leadId: string | null, now = new Date()): Promise<string | null> {
  const { pruefeTerminToken } = await import("@/lib/bestand/terminlink");
  const rid = pruefeTerminToken(bk);
  if (!rid) return leadId;
  const r = await prisma.campaignRecipient.findFirst({ where: { id: rid, campaign: { customerId } }, include: { campaign: true, existingCustomer: true } });
  if (!r) return leadId;
  let lead = leadId ?? r.leadId;
  if (!lead) lead = await createCampaignLead(customerId, r, [{ label: "Termin", value: "über den Terminlink der Kampagne gebucht" }]);
  if (!leadId) await prisma.conversation.update({ where: { id: conversationId }, data: { leadId: lead } });
  await prisma.campaignRecipient.update({
    where: { id: r.id },
    data: { status: r.status === "queued" ? r.status : "replied", repliedAt: r.repliedAt ?? now, leadId: r.leadId ?? lead },
  });
  return lead;
}

// ─── Zustellstatus (WhatsApp-Webhook) ────────────────────────────────────

/**
 * Status delivered/read/failed einer WhatsApp-Nachricht am Kampagnen-Empfänger speichern. Bei „failed“ mit
 * „kein WhatsApp“ (lib/whatsapp/zustellfehler.ts, z. B. 131026) wird der Bestandskunde markiert: künftige
 * Kampagnen gehen dann nur per E-Mail, soweit die E-Mail-Regeln es erlauben (lib/bestand/einwilligung.ts).
 * Rückgabe: true, wenn ein Kampagnen-Empfänger betroffen war.
 */
export async function applyCampaignStatus(waMessageId: string, status: string, now = new Date(), opts: { code?: number | null } = {}): Promise<boolean> {
  if (status === "delivered") {
    return (await prisma.campaignRecipient.updateMany({ where: { waMessageId, deliveredAt: null }, data: { deliveredAt: now } })).count > 0;
  } else if (status === "read") {
    await prisma.campaignRecipient.updateMany({ where: { waMessageId, deliveredAt: null }, data: { deliveredAt: now } });
    return (await prisma.campaignRecipient.updateMany({ where: { waMessageId, readAt: null }, data: { readAt: now } })).count > 0;
  } else if (status === "failed") {
    const { isNoWhatsAppCode, isWhatsAppOptOutCode } = await import("@/lib/whatsapp/zustellfehler");
    const noWa = isNoWhatsAppCode(opts.code);
    const optOut = isWhatsAppOptOutCode(opts.code);
    const r = await prisma.campaignRecipient.updateMany({
      where: { waMessageId, status: "sent" },
      data: {
        status: "failed",
        reason: noWa ? "nicht zugestellt: kein WhatsApp" : optOut ? "nicht zugestellt: WhatsApp abbestellt" : opts.code ? `nicht zugestellt (${opts.code})` : "nicht zugestellt",
      },
    });
    // 131050 (Ole, 15.11.2026): zählt als Abmeldung von WhatsApp, künftige Kampagnen nur noch per E-Mail (falls erlaubt)
    if (optOut) {
      const rows = await prisma.campaignRecipient.findMany({ where: { waMessageId }, select: { existingCustomerId: true } });
      if (rows.length)
        await prisma.existingCustomer.updateMany({
          where: { id: { in: rows.map((x) => x.existingCustomerId) } },
          data: { whatsappConsent: "nein", whatsappConsentAt: now, whatsappConsentSource: "lead" },
        });
      return rows.length > 0;
    }
    if (noWa) {
      const rows = await prisma.campaignRecipient.findMany({ where: { waMessageId }, select: { existingCustomerId: true } });
      if (rows.length) await prisma.existingCustomer.updateMany({ where: { id: { in: rows.map((x) => x.existingCustomerId) }, waUnavailableAt: null }, data: { waUnavailableAt: now } });
      return rows.length > 0;
    }
    return r.count > 0;
  }
  return false;
}

// ─── Antworten ───────────────────────────────────────────────────────────

const STOP = /^\s*(stopp?|stop|abmelden|keine (weiteren )?nachrichten|nicht mehr (schreiben|kontaktieren))\b/i;

type RecipientWithCampaign = Prisma.CampaignRecipientGetPayload<{ include: { campaign: true; existingCustomer: true } }>;

/** Lead aus einer Antwort anlegen (Quelle „Bestandskunde“), zuteilen und melden. */
async function createCampaignLead(customerId: string, recipient: RecipientWithCampaign, extra: { label: string; value: string }[] = []): Promise<string> {
  const ec = recipient.existingCustomer;
  const occasion = OCCASIONS[recipient.campaign.occasion as Occasion]?.label ?? recipient.campaign.occasion;
  const { inboundLeadIsTest } = await import("@/lib/testlead");
  const lead = await prisma.lead.create({
    data: {
      customerId,
      // Testkunde bzw. interner Kunde (z. B. Sandbox-Nummer): Testlead, zählt nirgends
      isTest: await inboundLeadIsTest(customerId),
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
export async function handleCampaignReply(conversationId: string, from: string, body: string | null, now = new Date()): Promise<{ stop: boolean; handled?: boolean }> {
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
    const an = await loadBestandAnsprache(conv.customerId);
    await sendWhatsAppMessage({ customerId: conv.customerId, to: from, body: a(an, "Alles klar, wir schreiben dir hier keine weiteren Nachrichten.", "Alles klar, wir schreiben Ihnen hier keine weiteren Nachrichten."), sentBy: "system" }).catch(() => {});
    return { stop: true };
  }
  if (recipient.status === "replied") return { stop: false };

  // Knopf „Kein Bedarf“ (Cross-Selling, Jahresgespräch, Ablauf): ehrlich beantwortet, kein Lead, kurzer Dank,
  // keine Sperre (weitere Kampagnen bleiben möglich; abmelden geht über „Keine Nachrichten mehr“).
  if (body && /^\s*kein bedarf\s*[.!]?\s*$/i.test(body)) {
    await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "replied", repliedAt: now, reason: "Kein Bedarf" } });
    const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
    const an = await loadBestandAnsprache(conv.customerId);
    await sendWhatsAppMessage({
      customerId: conv.customerId,
      to: from,
      body: a(an, "Alles klar, vielen Dank für deine Rückmeldung! Wenn sich etwas ändert, schreib mir einfach hier.", "Alles klar, vielen Dank für Ihre Rückmeldung! Wenn sich etwas ändert, schreiben Sie mir einfach hier."),
      sentBy: "system",
    }).catch(() => {});
    return { stop: false, handled: true };
  }

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
    // Status im Kontaktverlauf (lib/mail/kontakt-mail.ts)
    if (r.mailMessageId) {
      const { setzeMailStatus } = await import("@/lib/mail/kontakt-mail");
      await setzeMailStatus(r.mailMessageId, "nicht_zustellbar", { reason: "Unzustellbar-Meldung zugeordnet", now }).catch(() => 0);
    }
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

// ─── Kampagne beenden und Empfängerliste (Ole, 18.11.2026) ──────────────

/** Grund für Empfänger, die beim Beenden noch warteten. */
export const ENDED_REASON = "Kampagne beendet";

/**
 * Kampagne endgültig beenden: Status „fertig“, wartende Empfänger werden übersprungen (Grund „Kampagne beendet“).
 * Danach geht keine Nachricht mehr raus; Fortsetzen ist nicht möglich. Schon gesendete bleiben (Antworten zählen weiter).
 */
export async function endCampaign(customerId: string, campaignId: string, now = new Date()): Promise<{ ok: true; skipped: number } | { ok: false; error: string }> {
  const c = await prisma.customerCampaign.findFirst({ where: { id: campaignId, customerId }, select: { id: true, status: true, followUp: true } });
  if (!c) return { ok: false, error: "Kampagne nicht gefunden." };
  // Fertig verschickt, aber Erinnerungen stehen noch aus: Beenden schaltet sie ab (Kampagnenende beendet das Nachfassen)
  if (c.status === "done") {
    if (!c.followUp) return { ok: false, error: "Die Kampagne ist schon beendet." };
    await prisma.customerCampaign.update({ where: { id: c.id }, data: { followUp: false } });
    return { ok: true, skipped: 0 };
  }
  const [, skipped] = await prisma.$transaction([
    prisma.customerCampaign.update({ where: { id: c.id }, data: { status: "done", pausedReason: null, finishedAt: now, followUp: false } }),
    prisma.campaignRecipient.updateMany({ where: { campaignId: c.id, status: "queued" }, data: { status: "skipped", reason: ENDED_REASON } }),
  ]);
  return { ok: true, skipped: skipped.count };
}

export type RecipientTone = "success" | "warning" | "neutral" | "danger";
export type RecipientRowView = { id: string; existingCustomerId: string; name: string; channel: Channel; status: string; label: string; tone: RecipientTone };

const dayDe = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });

/** Status eines Empfängers in Worten (rein): „gesendet am 16.11.2026“, „wartet“, „übersprungen: abgemeldet“. */
export function recipientStatusLabel(r: { status: string; reason: string | null; sentAt: Date | null; repliedAt: Date | null; readAt?: Date | null; followUpAt?: Date | null }): { label: string; tone: RecipientTone } {
  switch (r.status) {
    case "sent":
      if (r.followUpAt) return { label: `erinnert am ${dayDe(r.followUpAt)}`, tone: "success" };
      return { label: r.sentAt ? `gesendet am ${dayDe(r.sentAt)}${r.readAt ? ", gelesen" : ""}` : "gesendet", tone: "success" };
    case "replied":
      return { label: `${r.repliedAt ? `geantwortet am ${dayDe(r.repliedAt)}` : "geantwortet"}${r.followUpAt && r.repliedAt && r.repliedAt >= r.followUpAt ? " nach Erinnerung" : ""}${r.reason ? `: ${r.reason}` : ""}`, tone: "success" };
    case "queued":
      return { label: "wartet", tone: "neutral" };
    case "skipped":
      return { label: `übersprungen${r.reason ? `: ${r.reason}` : ""}`, tone: "warning" };
    case "failed":
      return { label: r.reason?.startsWith("nicht zugestellt") ? r.reason : `nicht zugestellt${r.reason ? `: ${r.reason}` : ""}`, tone: "danger" };
    default:
      return { label: r.status, tone: "neutral" };
  }
}

/** Empfängerliste einer Kampagne (nur eigene Kampagnen): zuletzt gesendete zuerst, dann wartende, dann übersprungene. */
export async function campaignRecipientList(customerId: string, campaignId: string, opts: { take?: number } = {}): Promise<{ total: number; rows: RecipientRowView[] } | null> {
  const c = await prisma.customerCampaign.findFirst({ where: { id: campaignId, customerId }, select: { id: true } });
  if (!c) return null;
  const take = opts.take ?? 500;
  const [total, list] = await Promise.all([
    prisma.campaignRecipient.count({ where: { campaignId: c.id } }),
    prisma.campaignRecipient.findMany({
      where: { campaignId: c.id },
      orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { status: "asc" }, { id: "asc" }],
      take,
      select: {
        id: true,
        status: true,
        reason: true,
        sentAt: true,
        repliedAt: true,
        readAt: true,
        followUpAt: true,
        channel: true,
        existingCustomerId: true,
        existingCustomer: { select: { firstName: true, lastName: true, company: true, email: true, phone: true, externalNo: true } },
      },
    }),
  ]);
  return {
    total,
    rows: list.map((r) => ({
      id: r.id,
      existingCustomerId: r.existingCustomerId,
      name: displayName(r.existingCustomer),
      channel: r.channel === "email" ? "email" : "whatsapp",
      status: r.status,
      ...recipientStatusLabel(r),
    })),
  };
}

export type FollowUpStats = {
  /** Schalter an */
  on: boolean;
  /** Anlass mit Erinnerung */
  supported: boolean;
  /** verschickte Erinnerungen */
  sent: number;
  /** Antworten nach der Erinnerung */
  repliesAfter: number;
  /** noch ohne Antwort und ohne Erinnerung (im Zeitraum) */
  pending: number;
  /** frühester Termin der nächsten Erinnerung */
  nextAt: Date | null;
};

/**
 * Stand des Nachfassens einer Kampagne für das Detail (Paket 4). „Folgen“ zählt nur Empfänger, die nach den Regeln eine
 * Erinnerung bekommen können (followUpDecision, Zeit ausgenommen); rechtlich Ausgeschlossene zählen nicht mit.
 */
export async function campaignFollowUpStats(campaignId: string, now = new Date()): Promise<FollowUpStats | null> {
  const c = await prisma.customerCampaign.findUnique({ where: { id: campaignId }, select: { customerId: true, followUp: true, occasion: true, status: true, channelMode: true } });
  if (!c) return null;
  const { followUpDueAt, replyAfterFollowUp } = await import("@/lib/bestand/nachfassen");
  const supported = FOLLOW_UP_OCCASIONS.includes(c.occasion as Occasion);
  const [sent, answered, pendingRows] = await Promise.all([
    prisma.campaignRecipient.count({ where: { campaignId, followUpAt: { not: null } } }),
    prisma.campaignRecipient.findMany({ where: { campaignId, followUpAt: { not: null }, repliedAt: { not: null } }, select: { followUpAt: true, repliedAt: true } }),
    supported && c.followUp
      ? prisma.campaignRecipient.findMany({
          where: { campaignId, status: "sent", followUpAt: null, repliedAt: null, optOutAt: null, bouncedAt: null, sentAt: { gte: new Date(now.getTime() - FOLLOW_UP_MAX_DAYS * DAY) } },
          include: { existingCustomer: true },
        })
      : Promise.resolve([]),
  ]);
  let pending = 0;
  let nextAt: Date | null = null;
  if (pendingRows.length) {
    const [settings, sup] = await Promise.all([loadConsentSettings(c.customerId), loadSuppression(c.customerId)]);
    for (const r of pendingRows) {
      const due = followUpDueAt(r.sentAt!);
      const d = followUpDecision({
        occasion: c.occasion,
        // Pause hält nur an, zählt aber als „folgt“
        campaign: { followUp: true, status: "running", channelMode: asChannelMode(c.channelMode) },
        recipient: r,
        subject: subjectOf(r.existingCustomer, sup),
        settings,
        lastCampaignAt: r.existingCustomer.lastCampaignAt,
        waWindowOpen: false,
        now: due > now ? due : now,
      });
      if (!d.channel) continue;
      pending++;
      if (!nextAt || due < nextAt) nextAt = due;
    }
  }
  return { on: c.followUp, supported, sent, repliesAfter: answered.filter(replyAfterFollowUp).length, pending, nextAt };
}
