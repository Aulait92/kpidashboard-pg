// Pay-per-Lead: Eingang → Prüfung (Dublette, ungültig) → Verteilung (d'Hondt
// mit Filtern je Bezug) → Auslieferung. Ersetzt Zapier-Verteil-Zap + Airtable.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import { extract } from "@/lib/lead-intake";
import { isWeak, pickCandidate, rejectReason, type Candidate, type PoolLeadFacts } from "@/lib/ppl/rules";
import { monthRange, weekRange } from "@/lib/ppl/periods";

const DAY = 86_400_000;
export const DUPLICATE_DAYS = 30;

export type PoolInput = {
  externalId?: string | null;
  productKey: string;
  via: string;
  fields: Record<string, string>;
  smsVerified?: boolean;
  score?: number | null;
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

/** Kontingent und Geliefertes des laufenden Zeitraums. null = nicht lieferbar. */
export async function quotaFor(sub: SubRow, now = new Date()): Promise<(Candidate & { orderId: string | null }) | null> {
  if (!sub.active || (sub.startDate && sub.startDate > now)) return null;
  const testInfo = async () => {
    if (sub.status !== "test" || !sub.testQuantity) return null;
    const delivered = await prisma.lead.count({ where: { subscriptionId: sub.id } });
    const started = sub.startDate ?? sub.createdAt;
    return { quantity: sub.testQuantity, delivered, days: sub.testDays, startedDaysAgo: Math.floor((now.getTime() - started.getTime()) / DAY) };
  };
  if (sub.period === "week") {
    const { start } = weekRange(now);
    const order = await prisma.leadOrder.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: sub.id, periodStart: start } } });
    if (!order || !["paid", "processing"].includes(order.status)) return null;
    const delivered = await prisma.lead.count({ where: { orderId: order.id } });
    return { id: sub.id, quota: order.quantity, delivered, orderId: order.id, test: await testInfo() };
  }
  const test = await testInfo();
  const goal = sub.goal ?? (test ? test.quantity : 0);
  const range = sub.period === "month" ? monthRange(now) : { start: sub.startDate ?? new Date(0), end: new Date(8.64e15) };
  const delivered = await prisma.lead.count({ where: { subscriptionId: sub.id, deliveredAt: { gte: range.start, lt: range.end } } });
  return { id: sub.id, quota: goal, delivered, orderId: null, test };
}

export type PoolResult = { status: "delivered" | "duplicate" | "invalid" | "parked"; poolLeadId: string; leadId?: string; reason?: string };

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
  };
  const save = (status: string, reason?: string) => prisma.poolLead.create({ data: { ...base, status, reason } });

  if (!phone && !email) {
    const p = await save("invalid", "keine Telefonnummer und keine E-Mail");
    return { status: "invalid", poolLeadId: p.id, reason: p.reason ?? undefined };
  }
  const since = new Date(now.getTime() - DUPLICATE_DAYS * DAY);
  const dup = await prisma.poolLead.findFirst({
    // Dublette: gleiche Telefonnummer oder E-Mail im selben Produkt innerhalb von 30 Tagen
    where: { productKey: input.productKey, createdAt: { gte: since }, status: { in: ["delivered", "parked"] }, OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] },
    orderBy: { createdAt: "desc" },
    select: { productKey: true, createdAt: true },
  });
  if (dup) {
    const p = await save("duplicate", `schon am ${dup.createdAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}`);
    return { status: "duplicate", poolLeadId: p.id, reason: p.reason ?? undefined };
  }

  const pool = await save("parked", "wird verteilt");
  const res = await distribute(pool.id, now);
  return { ...res, poolLeadId: pool.id };
}

/** Freien Bezug suchen und ausliefern; sonst geparkt lassen (Admin-Hinweis). */
export async function distribute(poolLeadId: string, now = new Date(), notify = true): Promise<Omit<PoolResult, "poolLeadId">> {
  const pl = await prisma.poolLead.findUniqueOrThrow({ where: { id: poolLeadId } });
  const facts: PoolLeadFacts = {
    plz: pl.plz,
    insurer: pl.insurer,
    contribution: pl.contribution,
    civilServant: pl.civilServant,
    smsVerified: pl.smsVerified,
    score: pl.score,
    answers: Object.fromEntries(((pl.answers ?? []) as { label: string; value: string }[]).map((a) => [a.label, a.value])),
  };
  const subs = await prisma.leadSubscription.findMany({ where: { productKey: pl.productKey, active: true } });
  const cands: (Candidate & { orderId: string | null; sub: SubRow })[] = [];
  const reasons: string[] = [];
  for (const sub of subs) {
    const why = rejectReason(sub, facts);
    if (why) {
      reasons.push(why);
      continue;
    }
    const q = await quotaFor(sub, now);
    if (q) cands.push({ ...q, sub });
  }
  const pick = pickCandidate(cands) as (typeof cands)[number] | null;
  if (!pick) {
    const reason = subs.length === 0 ? "kein Bezug für dieses Produkt" : cands.length === 0 && reasons.length ? `kein passender Bezug (${[...new Set(reasons)].join(", ")})` : "alle Kontingente voll";
    await prisma.poolLead.update({ where: { id: pl.id }, data: { status: "parked", reason } });
    if (notify) await sendToAdmins({
      title: `⏸️ Lead geparkt: ${pl.productKey}`,
      body: `${reason}. Unter Leads → Pay-per-Lead zuweisen.`,
      url: "/admin/ppl",
      tag: `ppl-parked:${pl.productKey}`,
    }).catch(() => {});
    return { status: "parked", reason };
  }
  const leadId = await deliver(pl.id, pick.sub, pick.orderId, now);
  return { status: "delivered", leadId };
}

/** Lead beim Käufer anlegen und über den gewählten Weg zustellen. */
export async function deliver(poolLeadId: string, sub: SubRow, orderId: string | null, now = new Date()): Promise<string> {
  const pl = await prisma.poolLead.findUniqueOrThrow({ where: { id: poolLeadId } });
  const price = sub.price;
  const lead = await prisma.lead.create({
    data: {
      customerId: sub.customerId,
      source: pl.productKey,
      name: pl.name,
      phone: pl.phone,
      email: pl.email,
      formData: pl.answers ?? Prisma.DbNull,
      status: "Neuer Lead",
      subscriptionId: sub.id,
      orderId,
      deliveredAt: now,
      createdAt: now,
    },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.revenue.create({ data: { customerId: sub.customerId, leadId: lead.id, amount: price, occurredAt: now } }),
    prisma.poolLead.update({ where: { id: pl.id }, data: { status: "delivered", reason: null, leadId: lead.id, deliveredAt: now } }),
  ]);
  const { sendDelivery } = await import("@/lib/ppl/delivery");
  await sendDelivery(lead.id, sub).catch((err: unknown) => reportError(err, "ppl-delivery", { lead: lead.id, sub: sub.id }));
  return lead.id;
}

/** Geparkte Leads erneut verteilen (z. B. nach neuer Bestellung). */
export async function redistributeParked(productKey?: string, now = new Date()): Promise<number> {
  const parked = await prisma.poolLead.findMany({
    where: { status: "parked", createdAt: { gte: new Date(now.getTime() - 3 * DAY) }, ...(productKey ? { productKey } : {}) },
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
