// Rückmeldung an Meta (Conversions API für CRM, „Conversion Leads“; Ole, 15.11.2026): Postausgang, Lauf,
// Dataset je Kunde, Status für Kundenbereich, Admin und Diagnose. Regeln: lib/capi/shared.ts.
//
// Lauf (zentraler Cron, alle 15 Minuten): je Kunde mit Rückmeldung an (nicht Testkunde, nicht archiviert,
// Werbekonto oder Dataset gesetzt) 1. Dataset ermitteln (act_<Werbekonto>/adspixels, erstes; höchstens alle
// 6 Stunden ein Versuch), 2. neue Stufen der Meta-Leads der letzten 90 Tage in den Postausgang (CapiEvent,
// je Lead und Stufe einmal), 3. Fälliges in Paketen senden. Fehler werden gekürzt und ohne Tokens gespeichert,
// Wiederholung mit wachsendem Abstand, höchstens 5 Versuche. Älter als 7 Tage: nicht senden („zu alt“).
// Stornos nehmen nichts zurück. Kampagnen werden hier nie umgestellt (nur Vorschlag in der Optimierung).

import { prisma } from "@/lib/prisma";
import { cleanToken, redactTokens } from "@/lib/meta-leads";
import { reportError } from "@/lib/monitoring";
import { sparteKind } from "@/lib/provision";
import type { PlannedMeasure } from "@/lib/optimierung/regeln";
import type { MetaCheck, MetaDatasetCheck } from "@/lib/selbst-einrichtung";
import {
  annualPremium,
  buildEventsData,
  CAPI_STATUSES,
  DAY_MS,
  detectStages,
  isCapiStage,
  isMetaLeadId,
  isTooOld,
  MAX_EVENT_AGE_MS,
  recommendStage,
  shortError,
  STAGE_EVENT_NAME,
  stageStats,
  TOO_OLD,
  type CapiOutgoing,
  type CapiStage,
  type CapiStatus,
  type Recommendation,
  type StageStats,
} from "@/lib/capi/shared";

/** Graph-Version wie im übrigen Code (lib/meta-leads.ts, lib/selbst-einrichtung.ts). */
const GRAPH = "https://graph.facebook.com/v22.0";
const BATCH = 200;
export const MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 30 * 60 * 1000;
const LOOKUP_EVERY_MS = 6 * 60 * 60 * 1000;
/** Leads, deren Stufen erkannt werden (Eingang innerhalb dieser Tage) */
const DETECT_DAYS = 90;
/** Postausgang aufräumen (enthält nur Lead-Bezug, Stufe, Zeit, Wert) */
const KEEP_DAYS = 395;

function token(): string | null {
  return cleanToken(process.env.META_ACCESS_TOKEN) || null;
}

const errText = (e: unknown) => redactTokens(e instanceof Error ? e.message : String(e)).slice(0, 500);

async function graphGet<T>(path: string, params: Record<string, string>, accessToken: string): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(redactTokens(`Meta GET ${path} ${res.status}: ${String(json.error?.message ?? "").slice(0, 300)}`));
  return json;
}

/** Ein Paket an das Dataset senden. Wirft mit geschwärzter Meta-Meldung. */
export async function postEvents(datasetId: string, events: CapiOutgoing[], accessToken: string): Promise<{ received: number }> {
  if (!/^\d{5,20}$/.test(datasetId)) throw new Error("Ungültige Dataset-ID");
  const body = new URLSearchParams({ data: buildEventsData(events), access_token: accessToken });
  const res = await fetch(`${GRAPH}/${datasetId}/events`, { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(20000) });
  const json = (await res.json().catch(() => ({}))) as { events_received?: number; error?: { message?: string; code?: number } };
  if (!res.ok || json.error) throw new Error(redactTokens(`Meta ${res.status}: ${String(json.error?.message ?? "keine Antwort").slice(0, 300)}`));
  return { received: Number(json.events_received ?? events.length) };
}

// ─── Dataset je Kunde ───────────────────────────────────────────────────

type DatasetCustomer = { id: string; metaAdAccountId: string | null; metaDatasetId: string | null; metaDatasetCheckedAt: Date | null };

/** Dataset (Pixel) des Werbekontos ermitteln und merken (erstes aus act_…/adspixels). Gibt die ID oder null. */
export async function resolveDataset(c: DatasetCustomer, now = new Date(), opts: { force?: boolean } = {}): Promise<string | null> {
  if (c.metaDatasetId) return c.metaDatasetId;
  if (!c.metaAdAccountId) return null;
  if (!opts.force && c.metaDatasetCheckedAt && now.getTime() - c.metaDatasetCheckedAt.getTime() < LOOKUP_EVERY_MS) return null;
  const t = token();
  if (!t) return null;
  try {
    const r = await graphGet<{ data?: { id: string; name?: string }[] }>(`act_${c.metaAdAccountId}/adspixels`, { fields: "id,name", limit: "25" }, t);
    const id = r.data?.find((p) => /^\d+$/.test(String(p.id)))?.id ?? null;
    await prisma.customer.update({
      where: { id: c.id },
      data: id
        ? { metaDatasetId: String(id), metaDatasetSource: "auto", metaDatasetCheckedAt: now, metaDatasetError: null }
        : { metaDatasetCheckedAt: now, metaDatasetError: "Kein Dataset (Pixel) im Werbekonto gefunden" },
    });
    return id ? String(id) : null;
  } catch (e) {
    await prisma.customer.update({ where: { id: c.id }, data: { metaDatasetCheckedAt: now, metaDatasetError: errText(e) } });
    return null;
  }
}

/** Admin: Dataset von Hand setzen (Ziffern) oder leeren (dann wieder automatisch ermitteln). */
export async function setDatasetManually(customerId: string, raw: string | null): Promise<{ ok: true; datasetId: string | null } | { ok: false; error: string }> {
  const v = (raw ?? "").replace(/\s+/g, "");
  if (v && !/^\d{5,20}$/.test(v)) return { ok: false, error: "Bitte die Dataset-ID (nur Ziffern) eingeben." };
  await prisma.customer.update({
    where: { id: customerId },
    data: v
      ? { metaDatasetId: v, metaDatasetSource: "admin", metaDatasetError: null }
      : { metaDatasetId: null, metaDatasetSource: null, metaDatasetCheckedAt: null, metaDatasetError: null },
  });
  return { ok: true, datasetId: v || null };
}

/** Inhaber: Rückmeldung an/aus. */
export async function setCapiEnabled(customerId: string, on: boolean): Promise<void> {
  await prisma.customer.update({ where: { id: customerId }, data: { capiEnabled: !!on } });
}

// ─── Meta-Leads und Stufen laden ────────────────────────────────────────

export type MetaLeadStages = { leadId: string; metaLeadId: string; createdAt: Date; times: Partial<Record<CapiStage, Date>> };

/** Leads aus Meta-Lead-Ads (leadgen_id) eines Kunden seit `since` mit ihren erkannten Stufen. */
export async function loadMetaLeadStages(customerId: string, since: Date, now = new Date(), opts: { includeErased?: boolean } = {}): Promise<MetaLeadStages[]> {
  const rows = await prisma.lead.findMany({
    // Testleads (lib/testlead.ts) gehen nie an Meta
    where: { customerId, externalId: { not: null }, subscriptionId: null, isTest: false, createdAt: { gte: since, lte: now }, ...(opts.includeErased ? {} : { erasedAt: null }) },
    select: {
      id: true,
      externalId: true,
      createdAt: true,
      reached: true,
      status: true,
      statusChangedAt: true,
      closedAt: true,
      appointments: { orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } },
      conversations: { select: { messages: { where: { direction: "inbound" }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } } } },
    },
  });
  const out: MetaLeadStages[] = [];
  for (const l of rows) {
    if (!isMetaLeadId(l.externalId)) continue;
    let firstInboundAt: Date | null = null;
    for (const c of l.conversations) {
      const m = c.messages[0]?.createdAt;
      if (m && (!firstInboundAt || m < firstInboundAt)) firstInboundAt = m;
    }
    const times = detectStages(
      {
        createdAt: l.createdAt,
        reached: l.reached,
        status: l.status,
        statusChangedAt: l.statusChangedAt,
        closedAt: l.closedAt,
        firstInboundAt,
        firstAppointmentAt: l.appointments[0]?.createdAt ?? null,
      },
      now,
    );
    out.push({ leadId: l.id, metaLeadId: l.externalId, createdAt: l.createdAt, times });
  }
  return out;
}

/** Neue Stufen eines Kunden in den Postausgang (je Lead und Stufe einmal; zu alte gleich als „zu alt“). */
export async function detectForCustomer(customerId: string, now = new Date()): Promise<{ created: number; queued: number }> {
  const leads = await loadMetaLeadStages(customerId, new Date(now.getTime() - DETECT_DAYS * DAY_MS), now);
  if (!leads.length) return { created: 0, queued: 0 };
  const existing = await prisma.capiEvent.findMany({ where: { leadId: { in: leads.map((l) => l.leadId) } }, select: { leadId: true, stage: true } });
  const have = new Set(existing.map((e) => `${e.leadId}|${e.stage}`));
  const data: { customerId: string; leadId: string; stage: string; eventTime: Date; status: CapiStatus; error: string | null }[] = [];
  for (const l of leads) {
    for (const [stage, at] of Object.entries(l.times) as [CapiStage, Date][]) {
      if (have.has(`${l.leadId}|${stage}`)) continue;
      const old = isTooOld(at, now);
      data.push({ customerId, leadId: l.leadId, stage, eventTime: at, status: old ? "skipped" : "queued", error: old ? TOO_OLD : null });
    }
  }
  if (!data.length) return { created: 0, queued: 0 };
  const r = await prisma.capiEvent.createMany({ data, skipDuplicates: true });
  return { created: r.count, queued: data.filter((d) => d.status === "queued").length };
}

// ─── Senden ─────────────────────────────────────────────────────────────

/** Jahresbeitrag netto je Lead beim Senden (Summe der Verträge, ohne Stornierte). */
async function premiumsFor(leadIds: string[]): Promise<Map<string, number | null>> {
  const rows = leadIds.length ? await prisma.leadContract.findMany({ where: { leadId: { in: leadIds } }, select: { leadId: true, premium: true, status: true, sparte: true } }) : [];
  const by = new Map<string, { premium: number | null; status: string; kind: string }[]>();
  for (const r of rows) {
    const list = by.get(r.leadId) ?? [];
    list.push({ premium: r.premium == null ? null : Number(r.premium), status: r.status, kind: sparteKind(r.sparte) });
    by.set(r.leadId, list);
  }
  return new Map(leadIds.map((id) => [id, annualPremium(by.get(id) ?? [])]));
}

const retryAt = (now: Date, attempts: number) => (attempts >= MAX_ATTEMPTS ? null : new Date(now.getTime() + RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1)));

/** Fälliges senden: neue Ereignisse und Fehler, deren Wiederholung fällig ist. */
export async function sendDue(now = new Date(), opts: { max?: number } = {}): Promise<{ sent: number; failed: number; skipped: number; waiting: number }> {
  const out = { sent: 0, failed: 0, skipped: 0, waiting: 0 };
  const t = token();
  if (!t) return out;
  const open = { OR: [{ status: "queued" }, { status: "failed", attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: now } }] };
  // Ohne Dataset warten (bis es ermittelt ist oder das Ereignis zu alt wird), ohne die anderen zu blockieren
  const handleable = {
    OR: [
      { customer: { metaDatasetId: { not: null } } },
      { customer: { OR: [{ capiEnabled: false }, { isTest: true }, { archived: true }] } },
      { eventTime: { lt: new Date(now.getTime() - MAX_EVENT_AGE_MS) } },
    ],
  };
  out.waiting = await prisma.capiEvent.count({ where: { AND: [open, { NOT: handleable }] } });
  const due = await prisma.capiEvent.findMany({
    where: { AND: [open, handleable] },
    orderBy: { eventTime: "asc" },
    take: opts.max ?? 2000,
    select: {
      id: true,
      customerId: true,
      leadId: true,
      stage: true,
      eventTime: true,
      attempts: true,
      lead: { select: { externalId: true, erasedAt: true, isTest: true } },
      customer: { select: { capiEnabled: true, isTest: true, archived: true, metaDatasetId: true } },
    },
  });
  const skip = async (ids: string[], reason: string) => {
    if (!ids.length) return;
    await prisma.capiEvent.updateMany({ where: { id: { in: ids } }, data: { status: "skipped", error: reason, nextAttemptAt: null } });
    out.skipped += ids.length;
  };
  const byCustomer = new Map<string, typeof due>();
  for (const e of due) byCustomer.set(e.customerId, [...(byCustomer.get(e.customerId) ?? []), e]);
  for (const list of byCustomer.values()) {
    const c = list[0].customer;
    if (!c.capiEnabled || c.archived) {
      await skip(list.map((e) => e.id), "Rückmeldung abgeschaltet");
      continue;
    }
    if (c.isTest) {
      await skip(list.map((e) => e.id), "Testkunde");
      continue;
    }
    // Testleads (lib/testlead.ts) nie an Meta senden
    await skip(list.filter((e) => e.lead.isTest).map((e) => e.id), "Testlead");
    const alle = list.filter((e) => !e.lead.isTest);
    // Widerspruch gegen Werbung (Betroffenenrechte D8, lib/dsgvo/server.ts): nie an Meta
    const widerspruch = await import("@/lib/dsgvo/server").then((m) => m.leadsMitWiderspruch(alle.map((e) => e.leadId))).catch(() => new Set<string>());
    await skip(alle.filter((e) => widerspruch.has(e.leadId)).map((e) => e.id), "Widerspruch gegen Werbung");
    const real = alle.filter((e) => !widerspruch.has(e.leadId));
    await skip(real.filter((e) => e.lead.erasedAt || !isMetaLeadId(e.lead.externalId)).map((e) => e.id), "Lead gelöscht");
    await skip(real.filter((e) => !e.lead.erasedAt && isMetaLeadId(e.lead.externalId) && isTooOld(e.eventTime, now)).map((e) => e.id), TOO_OLD);
    const ready = real.filter((e) => !e.lead.erasedAt && isMetaLeadId(e.lead.externalId) && !isTooOld(e.eventTime, now) && isCapiStage(e.stage));
    if (!c.metaDatasetId) continue;
    const premiums = await premiumsFor(ready.filter((e) => e.stage === "abschluss").map((e) => e.leadId));
    for (let i = 0; i < ready.length; i += BATCH) {
      const pack = ready.slice(i, i + BATCH);
      const events: CapiOutgoing[] = pack.map((e) => ({
        metaLeadId: e.lead.externalId!,
        stage: e.stage as CapiStage,
        eventTime: e.eventTime,
        value: e.stage === "abschluss" ? (premiums.get(e.leadId) ?? null) : null,
      }));
      try {
        await postEvents(c.metaDatasetId, events, t);
        for (const [j, e] of pack.entries()) {
          const value = events[j].value;
          await prisma.capiEvent.update({ where: { id: e.id }, data: { status: "sent", sentAt: now, error: null, nextAttemptAt: null, attempts: e.attempts + 1, value } });
        }
        out.sent += pack.length;
      } catch (err) {
        const error = errText(err);
        for (const e of pack) {
          const attempts = e.attempts + 1;
          await prisma.capiEvent.update({ where: { id: e.id }, data: { status: "failed", attempts, error, nextAttemptAt: retryAt(now, attempts) } });
        }
        out.failed += pack.length;
      }
    }
  }
  return out;
}

/** Lauf aus dem zentralen Cron. */
export async function runCapi(now = new Date()): Promise<{ customers: number; created: number; sent: number; failed: number; skipped: number; waiting: number } | { skipped: string }> {
  if (!token()) return { skipped: "META_ACCESS_TOKEN fehlt" };
  const customers = await prisma.customer.findMany({
    where: { isTest: false, archived: false, capiEnabled: true, OR: [{ metaAdAccountId: { not: null } }, { metaDatasetId: { not: null } }] },
    select: { id: true, metaAdAccountId: true, metaDatasetId: true, metaDatasetCheckedAt: true },
  });
  let created = 0;
  for (const c of customers) {
    try {
      await resolveDataset(c, now);
      created += (await detectForCustomer(c.id, now)).created;
    } catch (e) {
      reportError(e, "capi-erkennen", { customer: c.id });
    }
  }
  const sent = await sendDue(now);
  await prisma.capiEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - KEEP_DAYS * DAY_MS) } } }).catch(() => undefined);
  return { customers: customers.length, created, ...sent };
}

// ─── Status (Kundenbereich, Admin) ──────────────────────────────────────

export type CapiWindow = { stats: StageStats; coverage: number | null; rec: Recommendation };
export type CapiOverview = {
  enabled: boolean;
  isTest: boolean;
  adAccountId: string | null;
  datasetId: string | null;
  datasetSource: string | null;
  datasetError: string | null;
  datasetCheckedAt: Date | null;
  /** Datensatz aus der letzten Meta-Prüfung der Einrichtung (Onboarding.metaCheck), null = nie geprüft. */
  datasetCheck: (MetaDatasetCheck & { at: string }) | null;
  counts7d: Record<CapiStatus, number>;
  lastSent: { stage: CapiStage; eventTime: Date; sentAt: Date; value: number | null }[];
  lastErrors: { stage: CapiStage; at: Date; status: CapiStatus; error: string | null }[];
  windows: { d30: CapiWindow; d90: CapiWindow };
};

/** Kennzahlen und Empfehlung für einen Zeitraum (Leads nach Eingang). */
export async function capiWindow(customerId: string, days: number, now = new Date()): Promise<CapiWindow> {
  const since = new Date(now.getTime() - days * DAY_MS);
  const leads = await loadMetaLeadStages(customerId, since, now, { includeErased: true });
  const stats = stageStats(leads, days);
  const covered = leads.length ? await prisma.capiEvent.count({ where: { customerId, stage: "lead", status: "sent", leadId: { in: leads.map((l) => l.leadId) } } }) : 0;
  const coverage = leads.length && covered ? covered / leads.length : null;
  return { stats, coverage, rec: recommendStage(stats, coverage) };
}

export async function loadCapiOverview(customerId: string, now = new Date()): Promise<CapiOverview | null> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { capiEnabled: true, isTest: true, metaAdAccountId: true, metaDatasetId: true, metaDatasetSource: true, metaDatasetError: true, metaDatasetCheckedAt: true },
  });
  if (!c) return null;
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const [grouped, sent, errors, d30, d90, ob] = await Promise.all([
    prisma.capiEvent.groupBy({ by: ["status"], where: { customerId, updatedAt: { gte: since7 } }, _count: { _all: true } }),
    prisma.capiEvent.findMany({ where: { customerId, status: "sent" }, orderBy: { sentAt: "desc" }, take: 10, select: { stage: true, eventTime: true, sentAt: true, value: true } }),
    prisma.capiEvent.findMany({
      where: { customerId, OR: [{ status: "failed" }, { status: "skipped", error: { not: TOO_OLD } }], updatedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { stage: true, updatedAt: true, status: true, error: true },
    }),
    capiWindow(customerId, 30, now),
    capiWindow(customerId, 90, now),
    prisma.onboarding.findUnique({ where: { customerId }, select: { metaCheck: true } }),
  ]);
  const metaCheck = (ob?.metaCheck ?? null) as MetaCheck | null;
  const counts7d = Object.fromEntries(CAPI_STATUSES.map((s) => [s, 0])) as Record<CapiStatus, number>;
  for (const g of grouped) if ((CAPI_STATUSES as readonly string[]).includes(g.status)) counts7d[g.status as CapiStatus] = g._count._all;
  return {
    enabled: c.capiEnabled,
    isTest: c.isTest,
    adAccountId: c.metaAdAccountId,
    datasetId: c.metaDatasetId,
    datasetSource: c.metaDatasetSource,
    datasetError: c.metaDatasetError,
    datasetCheckedAt: c.metaDatasetCheckedAt,
    datasetCheck: metaCheck?.dataset ? { ...metaCheck.dataset, at: metaCheck.at } : null,
    counts7d,
    lastSent: sent.filter((e) => isCapiStage(e.stage) && e.sentAt).map((e) => ({ stage: e.stage as CapiStage, eventTime: e.eventTime, sentAt: e.sentAt!, value: e.value == null ? null : Number(e.value) })),
    lastErrors: errors.filter((e) => isCapiStage(e.stage)).map((e) => ({ stage: e.stage as CapiStage, at: e.updatedAt, status: e.status as CapiStatus, error: e.error })),
    windows: { d30, d90 },
  };
}

/** War die Rückmeldung im Zeitraum aktiv (mindestens ein Ereignis gesendet)? Für Monatsbericht und Tipps. */
export async function capiSentBetween(customerId: string, from: Date, to: Date): Promise<number> {
  return prisma.capiEvent.count({ where: { customerId, status: "sent", sentAt: { gte: from, lt: to } } });
}

// ─── Optimierung: Vorschlag „Conversion Leads“ ──────────────────────────

export const CONVERSION_LEADS_KIND = "conversion_leads_vorschlag" as const;

/**
 * Vorschlag für den Admin, sobald die Meta-Kriterien erfüllt sind (Leads der letzten 30 Tage). Nur Vorschlag:
 * Kampagnen werden nie automatisch umgestellt. Höchstens alle 60 Tage erneut (auch nach Ablehnung).
 */
export async function conversionLeadsSuggestion(input: { accountId: string; customerId: string }, now = new Date()): Promise<PlannedMeasure | null> {
  const c = await prisma.customer.findUnique({ where: { id: input.customerId }, select: { capiEnabled: true, isTest: true } });
  if (!c?.capiEnabled || c.isTest) return null;
  const recent = await prisma.optimizationMeasure.count({ where: { accountId: input.accountId, kind: CONVERSION_LEADS_KIND, OR: [{ plannedAt: { gte: new Date(now.getTime() - 60 * DAY_MS) } }, { status: { in: ["geplant", "freigegeben"] } }] } });
  if (recent) return null;
  const w = await capiWindow(input.customerId, 30, now);
  if (!w.rec.ready || !w.rec.stage) return null;
  const s = w.stats.stages[w.rec.stage];
  const name = STAGE_EVENT_NAME[w.rec.stage];
  return {
    kind: CONVERSION_LEADS_KIND,
    targetType: "account",
    targetId: null,
    targetName: null,
    title: `Kampagne auf Conversion Leads umstellen (Stufe ${name})`,
    reason: `${w.rec.checks.volume.text}; ${w.rec.checks.coverage.text}; ${w.rec.checks.stage.text}${s.medianDays != null ? `, im Mittel nach ${s.medianDays.toLocaleString("de-DE")} Tagen` : ""}.${w.rec.notes.length ? ` ${w.rec.notes.join(" ")}` : ""} Vorschlag: im Werbeanzeigenmanager eine Lead-Kampagne mit Leistungsziel „Conversion Leads“ und Stufe „${name}“ anlegen bzw. umstellen (im Events Manager die CRM-Stufen zuordnen). Nicht automatisch umgestellt.`,
    data: { stage: w.rec.stage, leadsPerMonth: w.stats.leadsPerMonth, coverage: w.coverage, rate: s.rate, medianDays: s.medianDays },
    params: { adSetIds: [] },
    major: false,
  };
}

// ─── Diagnose ───────────────────────────────────────────────────────────

/** Admin-Diagnose: Kunden mit Status, Dataset, Ereignisse je Status (7 Tage), letzte Fehler gekürzt, ohne Lead-IDs. */
export async function capiDiagnose(now = new Date()) {
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const customers = await prisma.customer.findMany({
    where: { OR: [{ metaAdAccountId: { not: null } }, { metaDatasetId: { not: null } }, { capiEvents: { some: {} } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isTest: true, archived: true, capiEnabled: true, metaAdAccountId: true, metaDatasetId: true, metaDatasetSource: true, metaDatasetError: true, metaDatasetCheckedAt: true },
  });
  const ids = customers.map((c) => c.id);
  const [grouped, errors] = await Promise.all([
    ids.length ? prisma.capiEvent.groupBy({ by: ["customerId", "status"], where: { customerId: { in: ids }, updatedAt: { gte: since7 } }, _count: { _all: true } }) : Promise.resolve([]),
    ids.length
      ? prisma.capiEvent.findMany({ where: { customerId: { in: ids }, status: "failed" }, orderBy: { updatedAt: "desc" }, take: 50, select: { customerId: true, stage: true, error: true, attempts: true, updatedAt: true } })
      : Promise.resolve([]),
  ]);
  return {
    token: token() ? "gesetzt" : "fehlt",
    kunden: customers.map((c) => {
      const counts = Object.fromEntries(CAPI_STATUSES.map((s) => [s, 0])) as Record<CapiStatus, number>;
      for (const g of grouped) if (g.customerId === c.id && (CAPI_STATUSES as readonly string[]).includes(g.status)) counts[g.status as CapiStatus] = g._count._all;
      return {
        id: c.id,
        name: c.name,
        aktiv: c.capiEnabled && !c.isTest && !c.archived,
        rueckmeldungAn: c.capiEnabled,
        testkunde: c.isTest,
        werbekonto: !!c.metaAdAccountId,
        datasetGesetzt: !!c.metaDatasetId,
        datasetQuelle: c.metaDatasetSource,
        datasetFehler: shortError(c.metaDatasetError),
        datasetGeprueft: c.metaDatasetCheckedAt,
        ereignisse7Tage: counts,
        letzteFehler: errors
          .filter((e) => e.customerId === c.id)
          .slice(0, 3)
          .map((e) => ({ stufe: e.stage, versuche: e.attempts, am: e.updatedAt, fehler: shortError(e.error) })),
      };
    }),
  };
}
