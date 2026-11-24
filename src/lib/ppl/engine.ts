// Pay-per-Lead: Eingang → Prüfung (Dublette, ungültig) → Verteilung (d'Hondt
// mit Filtern je Bezug) → Auslieferung. Ersetzt Zapier-Verteil-Zap + Airtable.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import { extract } from "@/lib/lead-intake";
import { effectivePlzRanges, isWeak, openAreasFor, pickWithAreas, rejectReason, type AreaCandidate, type AreaQuota, type Candidate, type PoolLeadFacts } from "@/lib/ppl/rules";
import { monthRange, weekRange } from "@/lib/ppl/periods";
import { pruefeTelefon } from "@/lib/ppl/telefon-pruefung";
import type { DeliveryReport } from "@/lib/ppl/delivery";
import { adData, cleanAd, hasAd, type LeadAd } from "@/lib/anzeige";
import { leadNachweisAus, poolEinwilligung, type PoolEinwilligung } from "@/lib/ppl/einwilligung-nachweis";
import { EXPIRED_STATUS, expiredReason, parkCutoff, parkDeadlineHint, parkExpired } from "@/lib/ppl/parken";
import { DISCARD_STATUSES, discardCutoff, discardDeleteDays } from "@/lib/ppl/loeschfrist";
import { planNachlieferung } from "@/lib/ppl/nachlieferung";
import { offeneErsatzWhere } from "@/lib/ppl/storno";

const DAY = 86_400_000;
export const DUPLICATE_DAYS = 30;
/**
 * Dubletten über alle Produkte prüfen (wie der alte Verteil-Zap): gleiche
 * Telefonnummer oder E-Mail in irgendeinem Produkt innerhalb von
 * DUPLICATE_DAYS ist eine Dublette. false = nur im selben Produkt.
 */
export const DUPLICATE_ACROSS_PRODUCTS = true;

/** Bedingung für die Dubletten-Suche (Telefon oder E-Mail, Zeitraum, ggf. Produkt). */
export function duplicateWhere(
  input: { productKey: string; phone: string | null; email: string | null },
  now: Date,
  acrossProducts = DUPLICATE_ACROSS_PRODUCTS,
): Prisma.PoolLeadWhereInput | null {
  const or = [...(input.phone ? [{ phone: input.phone }] : []), ...(input.email ? [{ email: input.email }] : [])];
  if (!or.length) return null;
  return {
    ...(acrossProducts ? {} : { productKey: input.productKey }),
    createdAt: { gte: new Date(now.getTime() - DUPLICATE_DAYS * DAY) },
    status: { in: ["delivered", "parked"] },
    OR: or,
  };
}

export type PoolInput = {
  externalId?: string | null;
  productKey: string;
  via: string;
  fields: Record<string, string>;
  smsVerified?: boolean;
  score?: number | null;
  /** Anzeige/UTM aus dem Funnel (lib/anzeige.ts), ohne Personendaten */
  ad?: LeadAd | null;
  /** Einwilligungsnachweis (eigener Funnel, lib/ppl/einwilligung-nachweis.ts) */
  consent?: PoolEinwilligung | null;
};

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
function field(fields: Record<string, string>, keys: string[]): string | null {
  const want = new Set(keys.map(norm));
  for (const [k, v] of Object.entries(fields)) if (want.has(norm(k)) && v?.trim()) return v.trim();
  return null;
}

/** Merkmale für die Filter aus den Formularfeldern lesen. */
export function factsFrom(fields: Record<string, string>, extra: { smsVerified?: boolean; score?: number | null } = {}): PoolLeadFacts {
  const plz = field(fields, ["plz", "postleitzahl", "zip", "zip_code", "postal_code", "postcode"]);
  const insurer = field(fields, ["aktuelle_versicherung", "versicherung", "gesellschaft", "aktuelle_gesellschaft", "welche_pkv", "current_insurer", "krankenversicherung"]);
  const rawBeitrag = field(fields, ["beitrag", "monatsbeitrag", "aktueller_beitrag", "monatlicher_beitrag", "beitrag_monatlich"]);
  const digits = rawBeitrag?.match(/\d[\d.]*/)?.[0]?.replace(/\./g, "");
  const situation = field(fields, ["situation", "berufsgruppe", "beruf", "berufsstatus", "taetigkeit", "tätigkeit"]) ?? "";
  const scoreRaw = extra.score ?? (field(fields, ["score"]) ? Number(field(fields, ["score"])) : null);
  return {
    plz: plz?.replace(/\D/g, "").slice(0, 5) ?? null,
    insurer,
    contribution: digits ? Number(digits) : null,
    civilServant: /beamt/i.test(situation),
    smsVerified: !!extra.smsVerified,
    score: scoreRaw != null && Number.isFinite(scoreRaw) ? scoreRaw : null,
    answers: fields,
  };
}

type SubRow = Prisma.LeadSubscriptionGetPayload<object>;

/**
 * Kontingent und Geliefertes des laufenden Zeitraums. null = nicht lieferbar.
 * Bezüge mit Nachlieferung (stornoErsatz, Ole 24.11.2026; lib/ppl/nachlieferung.ts): offene Ersatzleads zuerst
 * (ersatzFuerId, kostenlos, ohne Bestellung), dann Reste bezahlter Bestellungen auch aus Vorwochen (älteste zuerst).
 * Ersatzleads zählen nie gegen Bestellung oder Ziel.
 */
export async function quotaFor(sub: SubRow, now = new Date()): Promise<(Candidate & { orderId: string | null; ersatzFuerId?: string | null }) | null> {
  if (!sub.active || (sub.startDate && sub.startDate > now)) return null;
  const testInfo = async () => {
    if (sub.status !== "test" || !sub.testQuantity) return null;
    const delivered = await prisma.lead.count({ where: { subscriptionId: sub.id, isTest: false, ersatzFuerId: null } });
    const started = sub.startDate ?? sub.createdAt;
    return { quantity: sub.testQuantity, delivered, days: sub.testDays, startedDaysAgo: Math.floor((now.getTime() - started.getTime()) / DAY) };
  };
  const ersatzFuer = sub.stornoErsatz
    ? (await prisma.lead.findMany({ where: offeneErsatzWhere(sub.id), orderBy: { stornoDecidedAt: "asc" }, select: { id: true }, take: 500 })).map((l) => l.id)
    : [];
  if (sub.period === "week" && sub.stornoErsatz) {
    const { start } = weekRange(now);
    const orders = await prisma.leadOrder.findMany({
      where: { subscriptionId: sub.id, status: { in: ["paid", "processing"] }, periodStart: { lte: start } },
      select: { id: true, periodStart: true, quantity: true },
    });
    const counts = orders.length
      ? await prisma.lead.groupBy({ by: ["orderId"], where: { orderId: { in: orders.map((o) => o.id) }, isTest: false }, _count: { _all: true } })
      : [];
    const deliveredOf = (id: string) => counts.find((c) => c.orderId === id)?._count._all ?? 0;
    const stand = orders.map((o) => ({ ...o, delivered: deliveredOf(o.id) }));
    const plan = planNachlieferung(stand, ersatzFuer);
    const current = stand.find((o) => o.periodStart.getTime() === start.getTime());
    if (!plan.offen && !current) return null;
    // quota − delivered = alles Offene; delivered = Geliefertes der laufenden Woche (für die Verteilung nach d'Hondt)
    const delivered = current?.delivered ?? 0;
    return { id: sub.id, quota: delivered + plan.offen, delivered, orderId: plan.orderId ?? current?.id ?? null, ersatzFuerId: plan.ersatzFuerId, test: await testInfo() };
  }
  if (sub.period === "week") {
    const { start } = weekRange(now);
    const order = await prisma.leadOrder.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: sub.id, periodStart: start } } });
    if (!order || !["paid", "processing"].includes(order.status)) return null;
    const delivered = await prisma.lead.count({ where: { orderId: order.id, isTest: false } });
    return { id: sub.id, quota: order.quantity, delivered, orderId: order.id, test: await testInfo() };
  }
  const test = await testInfo();
  const goal = sub.goal ?? (test ? test.quantity : 0);
  const range = sub.period === "month" ? monthRange(now) : { start: sub.startDate ?? new Date(0), end: new Date(8.64e15) };
  const delivered = await prisma.lead.count({ where: { subscriptionId: sub.id, isTest: false, ersatzFuerId: null, deliveredAt: { gte: range.start, lt: range.end } } });
  // Offene Ersatzleads kommen zum Ziel dazu und gehen zuerst raus
  return { id: sub.id, quota: goal + ersatzFuer.length, delivered, orderId: null, ersatzFuerId: ersatzFuer[0] ?? null, test };
}

type AreaRow = Prisma.SubscriptionAreaGetPayload<object>;

/** Zeitraum eines Gebiets: eigener Wert, sonst wie der Bezug (Wochenbestellung → Woche, sonst Monat). */
export function areaPeriodRange(area: Pick<AreaRow, "period">, sub: Pick<SubRow, "period">, now = new Date()) {
  const p = area.period ?? (sub.period === "week" ? "week" : "month");
  return p === "week" ? weekRange(now) : monthRange(now);
}

/** Gebiete eines Bezugs mit Geliefertem im laufenden Zeitraum. */
export async function areaQuotas(sub: SubRow & { areas: AreaRow[] }, now = new Date()): Promise<AreaQuota[]> {
  return Promise.all(
    sub.areas.map(async (a) => {
      const r = areaPeriodRange(a, sub, now);
      const delivered = await prisma.poolLead.count({ where: { areaId: a.id, status: "delivered", deliveredAt: { gte: r.start, lt: r.end } } });
      return { id: a.id, plzRanges: a.plzRanges, quantity: a.quantity, delivered };
    }),
  );
}

export type PoolResult = { status: "delivered" | "duplicate" | "invalid" | "parked" | "expired"; poolLeadId: string; leadId?: string; reason?: string };

export async function ingestPoolLead(input: PoolInput, now = new Date()): Promise<PoolResult> {
  if (input.externalId) {
    const seen = await prisma.poolLead.findUnique({ where: { externalId: input.externalId } });
    if (seen) return { status: seen.status as PoolResult["status"], poolLeadId: seen.id, leadId: seen.leadId ?? undefined };
  }
  const { name, phone, email, answers } = extract({ fields: input.fields }, {});
  const facts = factsFrom(input.fields, { smsVerified: input.smsVerified, score: input.score });
  const base = {
    externalId: input.externalId ?? null,
    productKey: input.productKey,
    via: input.via,
    name,
    phone,
    email,
    plz: facts.plz,
    insurer: facts.insurer,
    contribution: facts.contribution,
    civilServant: facts.civilServant,
    weak: isWeak(facts),
    smsVerified: facts.smsVerified,
    score: facts.score,
    answers: answers.length ? (answers as Prisma.InputJsonValue) : Prisma.DbNull,
    adInfo: hasAd(input.ad) ? (adData(input.ad) as Prisma.InputJsonValue) : Prisma.DbNull,
    consentData: input.consent ? (input.consent as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
  };
  const save = (status: string, reason?: string) => prisma.poolLead.create({ data: { ...base, status, reason } });

  if (!phone && !email) {
    const p = await save("invalid", "keine Telefonnummer und keine E-Mail");
    await slack(p.id);
    return { status: "invalid", poolLeadId: p.id, reason: p.reason ?? undefined };
  }
  // Formatprüfung der Telefonnummer (lib/ppl/telefon-pruefung.ts): falsche Nummern nicht ausliefern
  const rawPhone = field(input.fields, ["whatsapp_number", "phone_number", "phone", "telefonnummer", "telefon", "handynummer", "mobilnummer", "mobil"]);
  if (rawPhone || phone) {
    const tel = pruefeTelefon(rawPhone ?? `+${phone}`);
    if (!tel.ok) {
      const p = await save("invalid", `Telefonnummer: ${tel.grund}`);
      await slack(p.id);
      return { status: "invalid", poolLeadId: p.id, reason: p.reason ?? undefined };
    }
  }
  // Dublette: gleiche Telefonnummer oder E-Mail innerhalb von 30 Tagen (alle Produkte, siehe DUPLICATE_ACROSS_PRODUCTS)
  const dupWhere = duplicateWhere({ productKey: input.productKey, phone, email }, now);
  const dup = dupWhere ? await prisma.poolLead.findFirst({ where: dupWhere, orderBy: { createdAt: "desc" }, select: { productKey: true, createdAt: true } }) : null;
  if (dup) {
    const day = dup.createdAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
    const p = await save("duplicate", `schon am ${day}${dup.productKey !== input.productKey ? ` (${dup.productKey})` : ""}`);
    await slack(p.id);
    return { status: "duplicate", poolLeadId: p.id, reason: p.reason ?? undefined };
  }

  const pool = await save("parked", "wird verteilt");
  const res = await distribute(pool.id, now);
  // Geliefert meldet deliver() selbst (mit Zustellstatus)
  if (res.status !== "delivered") await slack(pool.id);
  return { ...res, poolLeadId: pool.id };
}

/** Slack je Lead (nicht blockierend, ohne SLACK_PPL_WEBHOOK_URL nichts). */
async function slack(poolLeadId: string, extra: { delivery?: DeliveryReport | null; wasParked?: boolean } = {}) {
  try {
    const { notifyPplSlack } = await import("@/lib/ppl/slack");
    await notifyPplSlack(poolLeadId, extra);
  } catch (err) {
    console.warn("[ppl-slack]", err instanceof Error ? err.message : err);
  }
  // Lead-Mail an Ole für die eigenen Funnels (lib/ppl/admin-lead-mail.ts), unabhängig von Slack
  try {
    const { notifyAdminLeadMail } = await import("@/lib/ppl/admin-lead-mail");
    await notifyAdminLeadMail(poolLeadId, extra);
  } catch (err) {
    console.warn("[ppl-admin-mail]", err instanceof Error ? err.message : err);
  }
}

/** Freien Bezug suchen und ausliefern; sonst geparkt lassen (Admin-Hinweis). */
export async function distribute(poolLeadId: string, now = new Date(), notify = true, retried = false): Promise<Omit<PoolResult, "poolLeadId">> {
  const pl = await prisma.poolLead.findUniqueOrThrow({ where: { id: poolLeadId } });
  // Nur geparkte Leads innerhalb der Frist (lib/ppl/parken.ts); verfallene nie wieder ausliefern
  if (pl.status !== "parked") return { status: pl.status as PoolResult["status"], reason: pl.reason ?? undefined };
  if (parkExpired(pl.createdAt, now)) return { status: "parked", reason: "Frist abgelaufen" };
  const facts: PoolLeadFacts = {
    plz: pl.plz,
    insurer: pl.insurer,
    contribution: pl.contribution,
    civilServant: pl.civilServant,
    smsVerified: pl.smsVerified,
    score: pl.score,
    answers: Object.fromEntries(((pl.answers ?? []) as { label: string; value: string }[]).map((a) => [a.label, a.value])),
  };
  // Ruhende Konten (lib/ruhend.ts) bekommen keine Leads
  // Leads mit Einwilligungsnachweis aus dem eigenen Funnel nur an Abnehmer der öffentlichen Partnerliste (L2,
  // lib/funnel/partner.ts): Testkunden stehen dort nicht, also bekommen sie diese Leads auch nicht
  const nurPartner = !!poolEinwilligung(pl.consentData);
  const subs = await prisma.leadSubscription.findMany({
    where: { productKey: pl.productKey, active: true, customer: { dormantSince: null, ...(nurPartner ? { isTest: false } : {}) } },
    include: { areas: true },
  });
  const cands: (AreaCandidate & { orderId: string | null; ersatzFuerId?: string | null; sub: SubRow })[] = [];
  const reasons: string[] = [];
  for (const sub of subs) {
    // Gebietskunden bedienen nur ihre Gebiete (eigener PLZ-Filter hat Vorrang)
    const why = rejectReason({ ...sub, plzRanges: effectivePlzRanges(sub.plzRanges, sub.areas) }, facts);
    if (why) {
      reasons.push(why);
      continue;
    }
    const q = await quotaFor(sub, now);
    if (!q) continue;
    const areas = sub.areas.length ? await areaQuotas(sub, now) : [];
    // Ohne Ziel/Bestellung (Monat/einmalig) gilt die Summe der Gebietsmengen als Kontingent
    const quota = sub.period !== "week" && !sub.goal && areas.length ? areas.reduce((n, a) => n + a.quantity, 0) : q.quota;
    cands.push({ ...q, quota, area: openAreasFor(areas, facts.plz)[0] ?? null, sub });
  }
  const pick = pickWithAreas(cands);
  if (!pick) {
    const reason = subs.length === 0 ? "kein Bezug für dieses Produkt" : cands.length === 0 && reasons.length ? `kein passender Bezug (${[...new Set(reasons)].join(", ")})` : "alle Kontingente voll";
    await prisma.poolLead.update({ where: { id: pl.id }, data: { status: "parked", reason } });
    if (notify) await sendToAdmins({
      title: `⏸️ Lead geparkt: ${pl.productKey}`,
      body: `${reason}. Unter Kunden → Pay-per-Lead zuweisen. Lead ${parkDeadlineHint(pl.createdAt)}.`,
      url: "/admin/neu/leads/ppl",
      tag: `ppl-parked:${pl.productKey}`,
    }).catch(() => {});
    return { status: "parked", reason };
  }
  try {
    const leadId = await deliver(pl.id, pick.sub, pick.orderId, now, pick.area?.id ?? null, pick.ersatzFuerId ?? null);
    return { status: "delivered", leadId };
  } catch (err) {
    // Ersatz für diese Reklamation kam parallel schon raus: einmal neu verteilen
    if (err instanceof ErsatzSchonGeliefertError && !retried) return distribute(poolLeadId, now, notify, true);
    throw err;
  }
}

/**
 * Lead beim Käufer anlegen und über den gewählten Weg zustellen. ersatzFuerId (Nachlieferung, lib/ppl/storno.ts):
 * kostenloser Ersatzlead für diese Reklamation, ohne Bestellung und ohne Umsatz.
 */
export async function deliver(poolLeadId: string, sub: SubRow, orderId: string | null, now = new Date(), areaId: string | null = null, ersatzFuerId: string | null = null): Promise<string> {
  const pl = await prisma.poolLead.findUniqueOrThrow({ where: { id: poolLeadId } });
  // Sperre (auch für Admin-Knöpfe): nur geparkte Leads innerhalb der Frist, verfallene nie wieder verkaufen
  assertDeliverable(pl, now);
  const wasParked = pl.status === "parked" && pl.reason !== "wird verteilt";
  const einw = poolEinwilligung(pl.consentData);
  const price = sub.price;
  const lead = await prisma.lead.create({
    data: {
      ...(ersatzFuerId ? { ersatzFuerId } : {}),
      customerId: sub.customerId,
      source: pl.productKey,
      name: pl.name,
      phone: pl.phone,
      email: pl.email,
      formData: pl.answers ?? Prisma.DbNull,
      status: "Neuer Lead",
      subscriptionId: sub.id,
      orderId: ersatzFuerId ? null : orderId,
      deliveredAt: now,
      createdAt: now,
      // Anzeige/UTM aus dem Funnel (lib/anzeige.ts)
      ...adData(cleanAd(pl.adInfo as Record<string, unknown> | null)),
      // Einwilligung aus dem eigenen Funnel (L3): Nachweis am Lead; der Text nennt Telefon, E-Mail und WhatsApp
      ...(einw ? { consentData: leadNachweisAus(einw) as unknown as Prisma.InputJsonValue, ...(einw.kanaele.includes("WhatsApp") ? { waConsent: "ja" } : {}) } : {}),
    },
    select: { id: true },
  }).catch((err: unknown) => {
    // Eindeutig je Reklamation (Lead.ersatzFuerId): der Ersatz ist schon geliefert
    if (ersatzFuerId && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ErsatzSchonGeliefertError("Ersatzlead ist schon geliefert");
    throw err;
  });
  try {
    await prisma.$transaction(async (tx) => {
      // nur, wenn der Lead noch geparkt ist (kein paralleler Verfall bzw. keine Doppelauslieferung)
      const claimed = await tx.poolLead.updateMany({ where: { id: pl.id, status: "parked" }, data: { status: "delivered", reason: null, leadId: lead.id, deliveredAt: now, areaId } });
      if (claimed.count !== 1) throw new NotDeliverableError("Lead ist nicht mehr geparkt");
      // Ersatzlead (Nachlieferung) ist kostenlos: kein Umsatz
      if (!ersatzFuerId) await tx.revenue.create({ data: { customerId: sub.customerId, leadId: lead.id, amount: price, occurredAt: now } });
    });
  } catch (err) {
    await prisma.lead.delete({ where: { id: lead.id } }).catch(() => {});
    throw err;
  }
  const { sendDelivery } = await import("@/lib/ppl/delivery");
  const report = await sendDelivery(lead.id, sub).catch((err: unknown) => {
    reportError(err, "ppl-delivery", { lead: lead.id, sub: sub.id });
    return null;
  });
  if (report && !report.ok) reportError(new Error(`${report.error ?? "Zustellung fehlgeschlagen"} (Lead ${lead.id})`), "ppl-delivery", { lead: lead.id, sub: sub.id });
  await slack(pl.id, {
    wasParked,
    delivery: report ?? { channel: sub.delivery as DeliveryReport["channel"], label: sub.delivery, targets: [], ok: false, error: "Zustellung abgebrochen" },
  });
  // Kontingent (bzw. Gebiet) mit dieser Zustellung voll: einmal an Admins und Slack melden (wirft nie)
  try {
    const { pruefeKontingentVoll } = await import("@/lib/ppl/kontingent-voll");
    await pruefeKontingentVoll(sub.id, areaId, now);
  } catch (err) {
    reportError(err, "ppl-kontingent-voll", { sub: sub.id });
  }
  return lead.id;
}

export class NotDeliverableError extends Error {}
export class ErsatzSchonGeliefertError extends NotDeliverableError {}

/** Wirft, wenn ein Pool-Lead nicht (mehr) ausgeliefert werden darf: nicht geparkt oder Frist abgelaufen. */
export function assertDeliverable(pl: { status: string; createdAt: Date }, now = new Date()): void {
  if (pl.status !== "parked") throw new NotDeliverableError(pl.status === EXPIRED_STATUS ? "Lead ist verfallen und wird nicht mehr verkauft" : "Lead ist nicht geparkt");
  if (parkExpired(pl.createdAt, now)) throw new NotDeliverableError("Frist abgelaufen: Lead wird verworfen und nicht mehr verkauft");
}

/** Geparkte Leads erneut verteilen (z. B. nach neuer Bestellung), nur innerhalb der Frist ab Eingang. */
export async function redistributeParked(productKey?: string, now = new Date()): Promise<number> {
  const parked = await prisma.poolLead.findMany({
    where: { status: "parked", createdAt: { gt: parkCutoff(now) }, ...(productKey ? { productKey } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  let n = 0;
  for (const p of parked) {
    const r = await distribute(p.id, now, false).catch(() => null);
    if (r?.status === "delivered") n++;
  }
  return n;
}

/**
 * Verfallsjob (WhatsApp-Cron): geparkte Leads ab der Frist (PPL_PARK_MAX_HOURS, 48 h ab Eingang) endgültig verwerfen.
 * Endstatus „expired“, Grund im Verlauf, Name, Telefon, E-Mail und Antworten werden entfernt (Datenschutz: Zweck
 * entfallen, docs/datenschutz.md). Produkt, PLZ, Anzeige und Zeitpunkte bleiben für die Auswertung (Kosten
 * „verworfen (geparkt > 48 h)“). Ein geparkter Lead hat keinen Lead-Datensatz beim Käufer; hängt doch einer daran
 * (Altfall), wird er nicht angefasst und der Pool-Lead nicht verworfen, sondern gemeldet.
 */
/** Kontaktdaten eines Pool-Leads entfernen (Verfall, Löschfrist); Produkt, PLZ, Anzeige, Zeitpunkte, Grund bleiben. */
const ERASE_CONTACT = { name: null, phone: null, email: null, answers: Prisma.DbNull } satisfies Prisma.PoolLeadUpdateManyMutationInput;

export async function expireParked(now = new Date()): Promise<number> {
  const due = await prisma.poolLead.findMany({ where: { status: "parked", createdAt: { lte: parkCutoff(now) } }, select: { id: true, leadId: true, productKey: true, createdAt: true }, take: 500 });
  const withLead = due.filter((p) => p.leadId);
  if (withLead.length) reportError(new Error(`Geparkte Pool-Leads mit Lead-Datensatz: ${withLead.map((p) => p.id).join(", ")}`), "ppl-expire");
  const ids = due.filter((p) => !p.leadId).map((p) => p.id);
  if (!ids.length) return 0;
  const res = await prisma.poolLead.updateMany({
    where: { id: { in: ids }, status: "parked", leadId: null },
    data: { status: EXPIRED_STATUS, reason: expiredReason(), ...ERASE_CONTACT },
  });
  if (res.count) {
    const { audit } = await import("@/lib/audit");
    await audit("ppl.parked_expired", { entity: "PoolLead", actor: { role: "system" }, details: { count: res.count, ids, grund: expiredReason() } });
  }
  return res.count;
}

/**
 * Löschfrist (WhatsApp-Cron, Ole 20.11.2026): verworfene Pool-Leads (ungültig, Dublette, von Hand verworfen, verfallen;
 * lib/ppl/loeschfrist.ts) verlieren PPL_DISCARD_DELETE_DAYS (30) Tage nach Eingang Name, Telefon, E-Mail und Antworten,
 * gleiche Löschlogik wie expireParked. Status und Grund bleiben. Ausgelieferte Leads und solche mit Lead-Datensatz
 * werden nie angefasst. Nur Zeilen, die noch Kontaktdaten haben, damit schon gelöschte den Stapel nicht blockieren.
 */
export async function expireDiscarded(now = new Date()): Promise<number> {
  const base = { status: { in: [...DISCARD_STATUSES] }, leadId: null, createdAt: { lte: discardCutoff(now) } } satisfies Prisma.PoolLeadWhereInput;
  const due = await prisma.poolLead.findMany({
    where: { ...base, OR: [{ name: { not: null } }, { phone: { not: null } }, { email: { not: null } }, { answers: { not: Prisma.DbNull } }] },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const ids = due.map((p) => p.id);
  if (!ids.length) return 0;
  const res = await prisma.poolLead.updateMany({ where: { ...base, id: { in: ids } }, data: ERASE_CONTACT });
  if (res.count) {
    const { audit } = await import("@/lib/audit");
    await audit("ppl.discarded_erased", { entity: "PoolLead", actor: { role: "system" }, details: { count: res.count, ids, tage: discardDeleteDays() } });
  }
  return res.count;
}
