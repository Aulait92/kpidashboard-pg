// Bestandskunden-Kampagnen: Segmente, Chancen, Versand (gedrosselt, per
// Cron), Antworten → Lead in der Pipeline, „Stopp“ → Sperre.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import { bestandQuota, QUOTA_REACHED } from "@/lib/bestand/quota";

export type Occasion = "cross_sell" | "review" | "birthday" | "renewal" | "empfehlung";
export type Segment = { has?: string[]; lacks?: string[]; birthdayDays?: number; renewalDays?: number };

export const OCCASIONS: Record<Occasion, { label: string; hint: string; purpose: string }> = {
  cross_sell: { label: "Lücke schließen", hint: "Kunden mit Sparte A, aber ohne Sparte B", purpose: "campaign_cross_sell" },
  review: { label: "Jahresgespräch", hint: "Vertragscheck: Passt noch alles?", purpose: "campaign_review" },
  birthday: { label: "Geburtstag", hint: "Gruß zum Geburtstag mit Gesprächsangebot", purpose: "campaign_birthday" },
  renewal: { label: "Ablauf / Wechsel", hint: "Verträge mit Ablauf oder Wechseltermin in Kürze", purpose: "campaign_renewal" },
  // Nur mit Modul „Empfehlungen & Bewertungen“: persönlicher Empfehlungslink je Kunde ({empfehlungslink})
  empfehlung: { label: "Jährliche Empfehlungsbitte", hint: "Zufriedene Bestandskunden um eine Empfehlung bitten – mit persönlichem Link", purpose: "referral_request" },
};

/** Anlässe, die das Modul „Empfehlungen & Bewertungen“ brauchen. */
export const NEEDS_EMPFEHLUNG: readonly Occasion[] = ["empfehlung"];
/** Empfehlungsbitte höchstens einmal im Jahr je Kunde. */
const REFERRAL_YEAR_DAYS = 365;

/** Abstand zwischen zwei Kampagnen an denselben Kunden. */
export const COOLDOWN_DAYS = 30;
const DAY = 86_400_000;

function baseWhere(customerId: string, now: Date): Prisma.ExistingCustomerWhereInput {
  return {
    customerId,
    optOutAt: null,
    phone: { not: null },
    OR: [{ lastCampaignAt: null }, { lastCampaignAt: { lt: new Date(now.getTime() - COOLDOWN_DAYS * DAY) } }],
  };
}

/** Tage bis zum nächsten Geburtstag (0 = heute). */
export function daysUntilBirthday(b: Date, now = new Date()): number {
  const y = now.getUTCFullYear();
  const today = Date.UTC(y, now.getUTCMonth(), now.getUTCDate());
  let next = Date.UTC(y, b.getUTCMonth(), b.getUTCDate());
  if (next < today) next = Date.UTC(y + 1, b.getUTCMonth(), b.getUTCDate());
  return Math.round((next - today) / DAY);
}

/** IDs der Bestandskunden im Segment (ohne Gesperrte, ohne Nummer, ohne kürzlich Angeschriebene). */
export async function segmentIds(customerId: string, occasion: Occasion, seg: Segment, now = new Date()): Promise<string[]> {
  const where: Prisma.ExistingCustomerWhereInput = { ...baseWhere(customerId, now) };
  if (occasion === "cross_sell") {
    where.AND = [
      ...(seg.has?.length ? [{ lines: { hasEvery: seg.has } }] : []),
      ...(seg.lacks?.length ? [{ NOT: { lines: { hasSome: seg.lacks } } }] : []),
    ];
  }
  if (occasion === "renewal") {
    where.nextRenewal = { gte: now, lte: new Date(now.getTime() + (seg.renewalDays ?? 60) * DAY) };
  }
  if (occasion === "empfehlung") {
    where.AND = [
      { OR: [{ referralLink: null }, { referralLink: { lastSentAt: null } }, { referralLink: { lastSentAt: { lt: new Date(now.getTime() - REFERRAL_YEAR_DAYS * DAY) } } }] },
    ];
  }
  if (occasion === "birthday") {
    const rows = await prisma.existingCustomer.findMany({ where: { ...where, birthday: { not: null } }, select: { id: true, birthday: true } });
    return rows.filter((r) => daysUntilBirthday(r.birthday!, now) <= (seg.birthdayDays ?? 7)).map((r) => r.id);
  }
  const rows = await prisma.existingCustomer.findMany({ where, select: { id: true } });
  return rows.map((r) => r.id);
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

export type Opportunity = { occasion: Occasion; segment: Segment; topic: string | null; title: string; count: number };

/** „Chancen“: die größten Lücken und anstehende Anlässe mit Anzahl. */
export async function opportunities(customerId: string, now = new Date()): Promise<Opportunity[]> {
  const out: Opportunity[] = [];
  for (const [has, lacks] of NEXT_BEST) {
    const count = (await segmentIds(customerId, "cross_sell", { has: [has], lacks: [lacks] }, now)).length;
    if (count) out.push({ occasion: "cross_sell", segment: { has: [has], lacks: [lacks] }, topic: TOPIC_LABEL[lacks] ?? lacks, title: `${has} ohne ${lacks}`, count });
  }
  out.sort((a, b) => b.count - a.count);
  const top = out.slice(0, 4);
  const bday = (await segmentIds(customerId, "birthday", { birthdayDays: 30 }, now)).length;
  if (bday) top.push({ occasion: "birthday", segment: { birthdayDays: 30 }, topic: null, title: "Geburtstag in den nächsten 30 Tagen", count: bday });
  const renewal = (await segmentIds(customerId, "renewal", { renewalDays: 60 }, now)).length;
  if (renewal) top.push({ occasion: "renewal", segment: { renewalDays: 60 }, topic: null, title: "Ablauf/Wechsel in den nächsten 60 Tagen", count: renewal });
  const review = (await segmentIds(customerId, "review", {}, now)).length;
  if (review) top.push({ occasion: "review", segment: {}, topic: null, title: "Jahresgespräch mit allen erreichbaren Kunden", count: review });
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { empfehlungEnabled: true } });
  if (c?.empfehlungEnabled) {
    const ref = (await segmentIds(customerId, "empfehlung", {}, now)).length;
    if (ref) top.push({ occasion: "empfehlung", segment: {}, topic: null, title: "Jährliche Empfehlungsbitte", count: ref });
  }
  return top;
}

export async function createCampaign(opts: {
  customerId: string;
  occasion: Occasion;
  segment: Segment;
  topic: string | null;
  dailyLimit: number;
  name?: string;
  createdById?: string | null;
  now?: Date;
}) {
  const now = opts.now ?? new Date();
  // Kontingent (inkl. WhatsApp-Gebühren) vor dem Start prüfen
  const quota = await bestandQuota(opts.customerId, now);
  if (quota.remaining <= 0) throw new Error(QUOTA_REACHED);
  const ids = await segmentIds(opts.customerId, opts.occasion, opts.segment, now);
  if (!ids.length) throw new Error("In diesem Segment ist gerade niemand erreichbar.");
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
      recipients: { create: ids.map((existingCustomerId) => ({ existingCustomerId })) },
    },
  });
}

function berlinClock(now: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { wd: p.weekday as string, hour: Number(p.hour), day: `${p.year}-${p.month}-${p.day}` };
}

/** Versand im Cron: Mo–Sa 9–19 Uhr, je Kampagne höchstens dailyLimit pro Tag, je Lauf max. 25. */
export async function runCampaigns(now = new Date()): Promise<{ sent: number; failed: number }> {
  const { wd, hour } = berlinClock(now);
  if (wd === "Sun" || hour < 9 || hour >= 19) return { sent: 0, failed: 0 };
  const dayStart = new Date(now.getTime() - (hour * 3600_000 + now.getUTCMinutes() * 60_000));
  const campaigns = await prisma.customerCampaign.findMany({ where: { status: "running" }, include: { customer: { select: { name: true, existingCustomersEnabled: true, empfehlungEnabled: true } } } });
  const { sendWhatsAppNotice, NoTemplateError } = await import("@/lib/whatsapp/templates");
  let sent = 0;
  let failed = 0;
  for (const c of campaigns) {
    if (!c.customer.existingCustomersEnabled) continue;
    // Empfehlungsbitte ohne aktives Modul: pausieren (Link-Seite wäre nicht erreichbar)
    if (NEEDS_EMPFEHLUNG.includes(c.occasion as Occasion) && !c.customer.empfehlungEnabled) {
      await prisma.customerCampaign.update({ where: { id: c.id }, data: { status: "paused" } });
      continue;
    }
    const today = await prisma.campaignRecipient.count({ where: { campaignId: c.id, sentAt: { gte: dayStart } } });
    // Monatskontingent je Kunde: darüber wartet der Versand bis zum nächsten Monat
    const quota = await bestandQuota(c.customerId, now);
    const budget = Math.min(25, c.dailyLimit - today, quota.remaining);
    if (budget <= 0) continue;
    const batch = await prisma.campaignRecipient.findMany({
      where: { campaignId: c.id, status: "queued" },
      take: budget,
      include: { existingCustomer: true },
    });
    if (!batch.length) {
      await prisma.customerCampaign.update({ where: { id: c.id }, data: { status: "done", finishedAt: now } });
      continue;
    }
    for (const r of batch) {
      const ec = r.existingCustomer;
      if (ec.optOutAt || !ec.phone) {
        await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "skipped", reason: ec.optOutAt ? "gesperrt" : "keine Nummer" } });
        continue;
      }
      const first = ec.firstName?.split(/\s+/)[0] || "";
      try {
        // {empfehlungslink}: persönlicher Link je Bestandskunde
        const referral = c.occasion === "empfehlung" ? await referralCampaignParts(c.customerId, ec.id, first) : null;
        const res = await sendWhatsAppNotice({
          customerId: c.customerId,
          to: ec.phone,
          purpose: OCCASIONS[c.occasion as Occasion].purpose as Parameters<typeof sendWhatsAppNotice>[0]["purpose"],
          params: referral ? [first || "Hallo", referral.url] : [first || "Hallo", c.topic ?? ""],
          text: referral ? referral.text : campaignText(c.occasion as Occasion, first, c.topic),
          contactName: [ec.firstName, ec.lastName].filter(Boolean).join(" ") || null,
        });
        await prisma.$transaction([
          prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "sent", sentAt: now, conversationId: res.conversationId } }),
          prisma.existingCustomer.update({ where: { id: ec.id }, data: { lastCampaignAt: now } }),
          ...(referral ? [prisma.referralLink.update({ where: { id: referral.linkId }, data: { lastSentAt: now } })] : []),
        ]);
        sent++;
      } catch (err) {
        if (err instanceof NoTemplateError) {
          await prisma.customerCampaign.update({ where: { id: c.id }, data: { status: "paused" } });
          await sendToAdmins({ title: `⏸️ Kampagne pausiert: ${c.customer.name}`, body: `Keine freigegebene WhatsApp-Vorlage für „${OCCASIONS[c.occasion as Occasion].label}“.`, url: "/admin/whatsapp/settings" }).catch(() => {});
          break;
        }
        reportError(err, "campaign-send", { campaign: c.id });
        await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "failed", reason: err instanceof Error ? err.message.slice(0, 200) : "Fehler" } });
        failed++;
      }
    }
  }
  return { sent, failed };
}

/** Empfehlungsbitte: persönlicher Link und Text (eigener Text des Vertreters, {empfehlungslink}). */
async function referralCampaignParts(customerId: string, existingCustomerId: string, first: string) {
  const { referralLinkOf, referralLinkFor, loadSettings } = await import("@/lib/empfehlung/requests");
  const { renderText } = await import("@/lib/empfehlung/shared");
  const { advisorDisplayName } = await import("@/lib/whatsapp/template-plan");
  const link = await referralLinkOf({ customerId, existingCustomerId });
  const url = referralLinkFor(link.token);
  const [settings, cust] = await Promise.all([loadSettings(customerId), prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } })]);
  return { linkId: link.id, url, text: renderText(settings.texts.referral, { vorname: first, link: url, vertreter: advisorDisplayName(cust?.name ?? "") }) };
}

/** Text im offenen 24-h-Fenster (sonst gilt die freigegebene Vorlage). */
export function campaignText(o: Occasion, first: string, topic: string | null): string {
  const hi = first ? `Hallo ${first}` : "Hallo";
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

const STOP = /^\s*(stopp?|stop|abmelden|keine (weiteren )?nachrichten|nicht mehr (schreiben|kontaktieren))\b/i;

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
    await prisma.$transaction([
      prisma.existingCustomer.update({ where: { id: ec.id }, data: { optOutAt: now } }),
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
    const occasion = OCCASIONS[recipient.campaign.occasion as Occasion]?.label ?? recipient.campaign.occasion;
    const lead = await prisma.lead.create({
      data: {
        customerId: conv.customerId,
        source: "Bestandskunde",
        name: [ec.firstName, ec.lastName].filter(Boolean).join(" ") || null,
        phone: ec.phone,
        email: ec.email,
        status: "Im Gespräch",
        formData: [
          { label: "Kontext", value: `Bestandskunde des Beraters, angeschrieben wegen: ${occasion}${recipient.campaign.topic ? ` (${recipient.campaign.topic})` : ""}` },
          { label: "Bestehende Verträge (Sparten)", value: ec.lines.join(", ") || "unbekannt" },
          ...(ec.externalNo ? [{ label: "Kundennummer", value: ec.externalNo }] : []),
        ],
      },
      select: { id: true },
    });
    leadId = lead.id;
    await prisma.conversation.update({ where: { id: conversationId }, data: { leadId } });
    const { assignLead, notifyLeadPush } = await import("@/lib/team");
    await assignLead(leadId).catch(() => null);
    await notifyLeadPush(leadId, {
      title: `💬 Bestandskunde antwortet: ${[ec.firstName, ec.lastName].filter(Boolean).join(" ") || "Kunde"}`,
      body: recipient.campaign.name,
      tag: `campaign-reply:${leadId}`,
      url: `/buyer/leads/${leadId}`,
    }).catch(() => {});
  }
  await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "replied", repliedAt: now, leadId } });
  return { stop: false };
}
