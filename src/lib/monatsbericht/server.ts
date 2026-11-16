// Monatsberichte für Kunden: Zahlen sammeln, intern einstufen, Text von Claude schreiben
// lassen, prüfen (deterministisch + KI), dann je nach Einstufung automatisch senden (nur
// „gut“, nur wenn eingeschaltet und nur mit echten Maßnahmen im Monat) oder als Entwurf mit
// Aufgabe für Ole ablegen. Garantien werden nie erwähnt (für Kunden bewusst ausgeblendet).
//
// Monatsbericht neu (Ole, 14.11.2026): Betreff mit Ergebnis, KI-Einstieg, Vertriebstrichter, Ergebnis
// als Rechnung, Bestand, Empfehlungen, Bestandskampagnen, „Was wir für Sie getan haben“ und Tipps.
// Alle Zahlen mit denselben Funktionen wie /buyer/zahlen (computeKpis, customer-spend, lib/ertrag,
// lib/lead-herkunft, lib/zahlen-tipps); Aufbau und E-Mail-HTML in lib/monatsbericht/bericht.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { CLOSED_STATUS } from "@/lib/products";
import { contractProvision } from "@/lib/provision";
import { bestandOf, ertragForRange, loadErtragData, type ErtragData } from "@/lib/ertrag";
import { originWhere, PAID_LEAD_WHERE } from "@/lib/lead-herkunft";
import { computeKpis } from "@/lib/kpis";
import { computeCustomerSpend, loadRetainerConfig } from "@/lib/customer-spend";
import { KOLLEGEN_TIPP_AKTIV, pickTips } from "@/lib/zahlen-tipps";
import { loadTipSignals } from "@/lib/zahlen-tipps-server";
import { listExecutedMeasures, listMetaActivities } from "@/lib/optimierung/server";
import { activityLabel, OPTIMIZATION_EVENT_TYPES } from "@/lib/optimierung/shared";
import { regionPoolKey } from "@/lib/media-buyer";
import { canonicalProductKey } from "@/lib/products";
import { loadCustomerProvision } from "@/lib/provision-server";
import { loadRechnerConfig } from "@/lib/rechner-server";
import { ergebnisQuote } from "@/lib/garantien";
import { getAppUrl, sendCustomerMail, type CustomerMailOpts } from "@/lib/email";
import { PROVIDER } from "@/lib/legal-texts";
import { customerGreeting } from "@/lib/offer-links";
import { claudeCall, runAgent, type AgentUsage, type LlmCall } from "@/lib/kampagnen/llm";
import type { Valid } from "@/lib/kampagnen/types";
import {
  checkText,
  classify,
  hasDash,
  DEFAULT_THRESHOLDS,
  eligible,
  fmtValue,
  monthBounds,
  monthLabel,
  previousMonthKey,
  shiftMonth,
  type CheckResult,
  type Classification,
  type Fact,
  type MonthMetrics,
  type ReportMetrics,
  type ReportThresholds,
} from "@/lib/monatsbericht/shared";
import {
  checkGewinnPair,
  gewinnPairText,
  reportNumbers,
  reportSectionsHtml,
  reportSectionsText,
  reportSubject,
  signedEur,
  type FunnelStep,
  type RawMeasure,
  type ReportModel,
  type ResultLine,
} from "@/lib/monatsbericht/bericht";

const NOT_STORNO = { OR: [{ stornoState: null }, { stornoState: { not: "approved" } }] };

// ─── Einstellungen ───────────────────────────────────────────────────────

export type ReportSettingsView = ReportThresholds & { autoSendGood: boolean; senderName: string | null; targetCpl: number | null; bookingUrl: string | null };

export async function loadReportSettings(): Promise<ReportSettingsView> {
  const r = await prisma.reportSettings.findUnique({ where: { id: "default" } }).catch(() => null);
  return {
    ...DEFAULT_THRESHOLDS,
    autoSendGood: false,
    senderName: null,
    targetCpl: null,
    bookingUrl: null,
    ...(r
      ? {
          autoSendGood: r.autoSendGood,
          senderName: r.senderName,
          goodLeadsPct: r.goodLeadsPct,
          weakLeadsPct: r.weakLeadsPct,
          weakCplPct: r.weakCplPct,
          weakNoMeetingLeads: r.weakNoMeetingLeads,
          minResultPct: r.minResultPct,
          minActiveDays: r.minActiveDays,
          targetCpl: r.targetCpl != null ? Number(r.targetCpl) : null,
          bookingUrl: r.bookingUrl,
        }
      : {}),
  };
}

export async function saveReportSettings(input: Partial<Omit<ReportSettingsView, "targetCpl">> & { targetCpl?: number | null }, actor?: AuditActor) {
  const data = {
    ...(input.autoSendGood != null ? { autoSendGood: input.autoSendGood } : {}),
    ...(input.senderName !== undefined ? { senderName: input.senderName?.trim() || null } : {}),
    ...(input.goodLeadsPct != null ? { goodLeadsPct: clampInt(input.goodLeadsPct, 1, 300) } : {}),
    ...(input.weakLeadsPct != null ? { weakLeadsPct: clampInt(input.weakLeadsPct, 1, 300) } : {}),
    ...(input.weakCplPct != null ? { weakCplPct: clampInt(input.weakCplPct, 100, 500) } : {}),
    ...(input.weakNoMeetingLeads != null ? { weakNoMeetingLeads: clampInt(input.weakNoMeetingLeads, 1, 500) } : {}),
    ...(input.minResultPct != null ? { minResultPct: clampInt(input.minResultPct, 0, 100) } : {}),
    ...(input.minActiveDays != null ? { minActiveDays: clampInt(input.minActiveDays, 0, 31) } : {}),
    ...(input.targetCpl !== undefined ? { targetCpl: input.targetCpl && input.targetCpl > 0 ? input.targetCpl : null } : {}),
    ...(input.bookingUrl !== undefined ? { bookingUrl: /^https:\/\//.test(input.bookingUrl ?? "") ? input.bookingUrl : null } : {}),
  };
  await prisma.reportSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  await audit("bericht.settings", { entity: "ReportSettings", entityId: "default", details: data, ...(actor ? { actor } : {}) });
}

const clampInt = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

// ─── Kennzahlen ──────────────────────────────────────────────────────────

async function monthMetrics(customerId: string, month: string, data: ErtragData): Promise<MonthMetrics> {
  const { from, to } = monthBounds(month);
  // Leads, Leadpreis und Ergebnis-Quote nur aus bezahlten Leads; Abschlüsse und Provision wie auf
  // /buyer/zahlen über alle Verträge (lib/ertrag), Datum des Abschlusses im Monat.
  const [leads, spendRows, termine, closed] = await Promise.all([
    prisma.lead.findMany({ where: { customerId, createdAt: { gte: from, lt: to }, ...NOT_STORNO, ...PAID_LEAD_WHERE }, select: { createdAt: true, status: true, source: true } }),
    prisma.customerAdSpend.findMany({ where: { customerId, date: { gte: from, lt: to } }, select: { date: true, amount: true } }),
    prisma.appointment.count({ where: { customerId, startsAt: { gte: from, lt: to }, status: { not: "cancelled" }, NOT: { lead: { is: { isTest: true } } } } }),
    prisma.lead.findMany({ where: { customerId, status: CLOSED_STATUS, closedAt: { gte: from, lt: to }, isTest: false, ...NOT_STORNO }, select: { id: true } }),
  ]);
  const spend = spendRows.reduce((s, r) => s + Number(r.amount), 0);
  const activeDays = new Set(spendRows.filter((r) => Number(r.amount) > 0).map((r) => r.date.toISOString().slice(0, 10))).size;
  const inMonth = data.contracts.filter((c) => c.signedAt >= from && c.signedAt < to);
  // Gekündigte Verträge zählen wie auf /buyer/zahlen mit ihrer Abschlussprovision (Rückbelastung im Ergebnis)
  const provKnown = inMonth.map((c) => contractProvision({ ...c, status: "aktiv" }, data.rates));
  const bestandProJahr = provKnown.reduce((s, p) => s + p.trailPerYear, 0);
  return {
    leads: leads.length,
    spend: Math.round(spend * 100) / 100,
    cpl: leads.length ? Math.round((spend / leads.length) * 100) / 100 : null,
    termine,
    abschluesse: closed.length,
    provision: provKnown.length ? provKnown.reduce((s, p) => s + p.firstYear, 0) : null,
    bestandProJahr: bestandProJahr > 0 ? Math.round(bestandProJahr) : null,
    provisionLabel: data.typ === "makler" ? "Courtage 1. Jahr (geschätzt)" : "Abschlussprovision (geschätzt)",
    ergebnisQuote: ergebnisQuote(leads.map((l) => ({ createdAt: l.createdAt, status: l.status, source: l.source })), to).quote,
    activeDays,
  };
}

// ─── Maßnahmen „Was wir für Sie getan haben“ ─────────────────────────────

/** Media-Buyer-Pools, aus denen der Kunde Leads bekommt (Produkt-Pools je Abo, Regionen je Produkt). */
async function mediaBuyerPoolKeys(customerId: string): Promise<string[]> {
  const [subs, cps, cust] = await Promise.all([
    prisma.leadSubscription.findMany({ where: { customerId }, select: { productKey: true }, distinct: ["productKey"] }),
    prisma.customerProduct.findMany({ where: { customerId, product: { poolKind: "region" } }, select: { region: true, product: { select: { name: true } } } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { region: true } }),
  ]);
  const keys = new Set<string>();
  for (const s of subs) keys.add(`product:${canonicalProductKey(s.productKey)}`);
  for (const cp of cps) {
    const region = (cp.region ?? cust?.region)?.trim();
    if (region) keys.add(regionPoolKey(canonicalProductKey(cp.product.name), region));
  }
  return [...keys];
}

/** Zeile unter „Was wir für Sie getan haben“, wenn die Rückmeldung an Meta im Monat aktiv war. */
export const CAPI_MEASURE_TEXT = "Ihre Ergebnisse (Erreicht, Termin, Abschluss) an Meta zurückgemeldet, damit Meta lernt, welche Anfragen bei Ihnen zum Abschluss führen";

const BUYER_TEXT: Record<string, (label: string) => string> = {
  increase: (l) => `Budget der Kampagne ${l} erhöht, damit genug Anfragen kommen`,
  boost: (l) => `Budget der Kampagne ${l} zum Monatsende erhöht, damit genug Anfragen kommen`,
  decrease: (l) => `Budget der Kampagne ${l} gesenkt, damit der Leadpreis stabil bleibt`,
  pause: (l) => `Kampagne ${l} pausiert`,
  activate: (l) => `Kampagne ${l} wieder gestartet`,
};

/**
 * Echte Maßnahmen des Monats aus allen Quellen (intern, ohne Zahlen): ausgeführte Optimierungen
 * (automatisch und von Hand, inkl. Pay-per-Lead-Pools), Meta-Änderungsprotokoll des eigenen
 * Werbekontos, Media-Buyer-Läufe der Pools, Kampagnen-Läufe und Budgetänderungen. Gleiche Sätze
 * nur einmal. Leer = nichts getan, dann geht der Bericht nicht automatisch raus.
 */
export async function collectMeasures(customerId: string, month: string): Promise<RawMeasure[]> {
  const { from, to } = monthBounds(month);
  const [executed, activities, runs, budgets, poolKeys, capiFirst] = await Promise.all([
    listExecutedMeasures(customerId, from, to, { includePools: true }),
    listMetaActivities(customerId, from, to),
    prisma.campaignRun.findMany({ where: { customerId, status: "built", updatedAt: { gte: from, lt: to } }, select: { product: true, kind: true, updatedAt: true } }),
    prisma.budgetChange.findMany({ where: { customerId, status: "applied", effectiveFrom: { gte: from, lt: to } }, select: { effectiveFrom: true, monthlyBudgetFrom: true, monthlyBudgetTo: true } }),
    mediaBuyerPoolKeys(customerId),
    // Rückmeldung an Meta (lib/capi): erste im Monat gesendete Rückmeldung
    prisma.capiEvent.findFirst({ where: { customerId, status: "sent", sentAt: { gte: from, lt: to } }, orderBy: { sentAt: "asc" }, select: { sentAt: true } }),
  ]);
  const buyer = poolKeys.length
    ? await prisma.mediaBuyerAction.findMany({
        where: { poolKey: { in: poolKeys }, dryRun: false, errorMessage: null, action: { in: Object.keys(BUYER_TEXT) }, createdAt: { gte: from, lt: to } },
        orderBy: { createdAt: "asc" },
        select: { poolLabel: true, action: true, createdAt: true },
      })
    : [];
  const out: RawMeasure[] = [];
  const seen = new Set<string>();
  const push = (source: RawMeasure["source"], at: Date, text: string) => {
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ source, at: at.toISOString(), text });
  };
  for (const m of executed) push(m.source === "manuell" ? "manuell" : "optimierung", m.executedAt, m.reportText);
  const acts = activities.filter((a) => OPTIMIZATION_EVENT_TYPES.includes(a.eventType)).map((a) => ({ at: a.eventTime, label: activityLabel(a.eventType, a.translatedEventType) }));
  const actCount = new Map<string, number>();
  for (const a of acts) actCount.set(a.label, (actCount.get(a.label) ?? 0) + 1);
  for (const a of acts) push("meta", a.at, `Werbekonto: ${a.label}${(actCount.get(a.label) ?? 0) > 1 ? " (mehrfach)" : ""}`);
  for (const b of buyer) push("mediabuyer", b.createdAt, BUYER_TEXT[b.action](b.poolLabel));
  for (const r of runs) push("kampagne", r.updatedAt, r.kind === "auffrischung" ? `Neue Anzeigenmotive für ${r.product} in die laufende Kampagne gebracht` : `Neue Kampagne mit frischen Anzeigen für ${r.product} aufgesetzt`);
  if (capiFirst?.sentAt) push("capi", capiFirst.sentAt, CAPI_MEASURE_TEXT);
  for (const b of budgets) push("budget", b.effectiveFrom, b.monthlyBudgetTo > b.monthlyBudgetFrom ? "Werbebudget erhöht" : b.monthlyBudgetTo < b.monthlyBudgetFrom ? "Werbebudget angepasst" : "Budget neu verteilt");
  return out.sort((x, y) => x.at.localeCompare(y.at));
}

async function targetCplFor(customerId: string, settings: ReportSettingsView): Promise<number | null> {
  if (settings.targetCpl) return settings.targetCpl;
  const [cfg, prov] = await Promise.all([loadRechnerConfig().catch(() => null), loadCustomerProvision(customerId)]);
  const tkv = cfg?.products.find((p) => p.key === "tkv");
  if (!tkv) return null;
  return prov.typ === "makler" && tkv.cplMakler ? tkv.cplMakler : tkv.cpl;
}

export async function collectMetrics(customerId: string, month: string, settings: ReportSettingsView): Promise<ReportMetrics> {
  const data = await loadErtragData(customerId);
  const [current, previous, measures, targetCpl] = await Promise.all([
    monthMetrics(customerId, month, data),
    monthMetrics(customerId, shiftMonth(month, -1), data),
    collectMeasures(customerId, month),
    targetCplFor(customerId, settings),
  ]);
  return {
    month,
    current,
    previous: previous.activeDays > 0 || previous.leads > 0 ? previous : null,
    expectedLeads: targetCpl && current.spend > 0 ? Math.round(current.spend / targetCpl) : null,
    targetCpl,
    actions: measures.map((x) => x.text),
  };
}

// ─── Bericht (Abschnitte) ────────────────────────────────────────────────

export type ReportData = Omit<ReportModel, "measures"> & { rawMeasures: RawMeasure[] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Monat als Zeitraum wie die Filter auf /buyer/zahlen (bis 23:59:59,999 des letzten Tags, deutsche Zeit). */
export function monthRangeInclusive(month: string): { from: Date; to: Date } {
  const { from, to } = monthBounds(month);
  return { from, to: new Date(to.getTime() - 1) };
}

/** Link auf /buyer/zahlen mit genau diesem Monat. */
export function zahlenLink(month: string, appUrl = getAppUrl()): string {
  const r = monthRangeInclusive(month);
  return `${appUrl}/buyer/zahlen?range=custom&from=${ymd(r.from)}&to=${ymd(r.to)}`;
}

/**
 * Alle Abschnitte des Berichts. Rechnet wie /buyer/zahlen mit denselben Funktionen: Trichter aus
 * computeKpis (nur bezahlte Leads), Lead-Kosten aus customer-spend bzw. Lead-Preis, Ergebnis aus
 * lib/ertrag (ertragForRange, summarizeBestand), Herkunft aus lib/lead-herkunft, Tipps aus
 * lib/zahlen-tipps. Abschnitte ohne Daten sind null.
 */
export async function collectReportData(customerId: string, month: string, settings: ReportSettingsView, now = new Date()): Promise<ReportData> {
  const range = monthRangeInclusive(month);
  const prev = monthRangeInclusive(shiftMonth(month, -1));
  const inRange = { gte: range.from, lte: range.to };
  const retainerCfg = await loadRetainerConfig(customerId);
  const [k, p, spend, data, empfLeads, bestandLeads, asked, rawMeasures, dismissed] = await Promise.all([
    computeKpis({ range, customerId, product: null, origin: "paid" }),
    computeKpis({ range: prev, customerId, product: null, origin: "paid" }),
    retainerCfg ? computeCustomerSpend(customerId, range, retainerCfg) : null,
    loadErtragData(customerId),
    prisma.lead.count({ where: { customerId, createdAt: inRange, ...originWhere("empfehlung") } }),
    prisma.lead.count({ where: { customerId, createdAt: inRange, ...originWhere("bestand") } }),
    prisma.reviewRequest.count({ where: { customerId, referralSentAt: inRange } }),
    collectMeasures(customerId, month),
    prisma.customer.findUnique({ where: { id: customerId }, select: { zahlenTipsDismissed: true } }).then((c) => c?.zahlenTipsDismissed ?? null),
  ]);
  // Lead-Kosten aus Kundensicht wie /buyer/zahlen: Retainer = Werbebudget + Retainer, sonst Lead-Preis
  const cost = spend ? spend.total : Number(k.revenue);
  const cur = await ertragForRange(customerId, data, range, now, cost);
  // Bestand mit der Stornoquote des Kunden, gekündigte Verträge ab dem Datum raus (wie /buyer/zahlen)
  const bestand = bestandOf(data, now);
  const makler = data.typ === "makler";
  const prov = cur.provision;

  const step = (key: FunnelStep["key"], label: string, value: number, prevValue: number, rate: number | null, rateLabel: string | null): FunnelStep => ({
    key,
    label,
    value,
    rate,
    rateLabel,
    previous: p.nettoLeads > 0 ? prevValue : null,
  });
  const funnel =
    k.nettoLeads > 0
      ? {
          steps: [
            step("leads", "Leads", k.nettoLeads, p.nettoLeads, null, null),
            step("erreicht", "Erreicht", k.reachedLeads, p.reachedLeads, k.reachabilityRate, "erreicht"),
            step("termine", "Termine", k.terminLeads, p.terminLeads, k.terminRate, "aus Erreicht"),
            step("abschluesse", "Abschlüsse", k.closedLeads, p.closedLeads, k.closingRate, "Abschlussquote"),
          ],
        }
      : null;

  const agency = cur.agency.total;
  const lines: ResultLine[] = [
    { key: "paid", label: makler ? "Courtage 1. Jahr aus Leads" : "Abschlussprovision aus Leads (einmalig)", amount: prov.byOrigin.paid.amount, sign: "+" },
  ];
  if (prov.byOrigin.empfehlung.amount > 0) lines.push({ key: "empfehlung", label: "aus Empfehlungen", amount: prov.byOrigin.empfehlung.amount, sign: "+" });
  if (prov.byOrigin.bestand.amount > 0) lines.push({ key: "bestand", label: "aus Bestandskampagnen", amount: prov.byOrigin.bestand.amount, sign: "+" });
  if (prov.chargeback > 0) lines.push({ key: "rueckbelastung", label: "Rückbelastung (gekündigte Verträge)", amount: prov.chargeback, sign: "-" });
  lines.push({ key: "leadkosten", label: "Lead-Kosten", amount: cur.leadCosts, sign: "-" });
  lines.push({ key: "betreuung", label: "Betreuung & Software (inkl. USt., Gutschriften abgezogen)", amount: r2(Math.abs(agency)), sign: agency >= 0 ? "-" : "+" });
  // Immer beide Zahlen: Gewinn und Gewinn mit künftigem Bestand (Kohorte des Monats, 5 Jahre, Prognose)
  const result = prov.firstYear > 0 || prov.chargeback > 0 || cur.costs !== 0 ? { lines, gewinn: cur.gewinn, gewinnMitBestand: cur.gewinnMitBestand, kuenftigerBestand: prov.futureTrail } : null;

  const bestandBlock =
    bestand.perYear > 0 || bestand.growth.some((g) => g.total > 0)
      ? {
          label: makler ? "Bestandscourtage" : "Bestandsprovision",
          perYear: bestand.perYear,
          contracts: bestand.contracts,
          fromYear2: bestand.fromYear2,
          inYears: bestand.inYears,
          storno: bestand.storno,
          stornoReal: bestand.real.quote,
          perMonth: bestand.perMonth,
          years: bestand.growth.map((g) => ({ year: g.year, existing: Math.round(g.existing), added: Math.round(g.added), total: Math.round(g.total) })),
        }
      : null;

  // Bestandskampagnen über die Herkunft „bestand“ (lib/lead-herkunft), Abschlüsse/Provision wie „aus Bestandskampagnen“ auf /buyer/zahlen
  const empf = { asked, empfehlungen: empfLeads, abschluesse: prov.byOrigin.empfehlung.leads, provision: prov.byOrigin.empfehlung.amount };
  const bk = { leads: bestandLeads, abschluesse: prov.byOrigin.bestand.leads, provision: prov.byOrigin.bestand.amount };

  // Tipps aus derselben Logik wie die Karte auf /buyer/zahlen; Kollegen-Tipp nur mit Schalter (Standard aus)
  const signals = await loadTipSignals(customerId, data, now).catch(() => null);
  const tips = (signals ? pickTips(signals, dismissed, now) : [])
    .filter((t) => KOLLEGEN_TIPP_AKTIV || t.key !== "kollegen")
    .slice(0, 2)
    .map(({ key, title, text, href, cta }) => ({ key, title, text, href, cta }));

  return {
    version: 2,
    month,
    makler,
    closings: prov.leads,
    funnel,
    result,
    bestand: bestandBlock,
    empfehlungen: Object.values(empf).some((n) => n > 0) ? empf : null,
    bestandskampagnen: Object.values(bk).some((n) => n > 0) ? bk : null,
    tips,
    links: { zahlen: zahlenLink(month) },
    rawMeasures,
  };
}

// ─── Text (Claude) und Prüfung ───────────────────────────────────────────

/** Was die KI schreibt: kurzer Einstieg und die verständliche Zusammenfassung der Maßnahmen. */
export type ReportText = { intro: string; massnahmen: string[] };

const TEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intro", "massnahmen"],
  properties: {
    intro: { type: "string" },
    massnahmen: { type: "array", items: { type: "string" } },
  },
};

/** Sätze zählen (Satzende gefolgt von Großbuchstabe bzw. Textende). */
export const sentenceCount = (t: string) => t.trim().split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/).filter((x) => x.trim()).length;

export function validateReportText(x: unknown, rawMeasures: number): Valid<ReportText> {
  const o = x as Partial<ReportText> | null;
  const errors: string[] = [];
  if (!o || typeof o !== "object") return { ok: false, errors: ["kein Objekt"] };
  const intro = typeof o.intro === "string" ? o.intro.trim() : "";
  if (intro.length < 40 || intro.length > 600) errors.push("intro: 40 bis 600 Zeichen");
  else if (sentenceCount(intro) > 4) errors.push("intro: höchstens 3 Sätze");
  if (!Array.isArray(o.massnahmen) || o.massnahmen.some((p) => typeof p !== "string" || !p.trim() || p.length > 240)) errors.push("massnahmen: Liste kurzer Sätze (je höchstens 240 Zeichen)");
  else if (rawMeasures === 0 && o.massnahmen.length > 0) errors.push("massnahmen: Es gibt keine Maßnahmen in den Daten, also massnahmen = [] (nichts erfinden).");
  else if (rawMeasures > 0 && (o.massnahmen.length < 1 || o.massnahmen.length > 6)) errors.push("massnahmen: 1 bis 6 Punkte");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { intro, massnahmen: o.massnahmen!.map((p) => p.trim()) } };
}

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "issues"],
  properties: { ok: { type: "boolean" }, issues: { type: "array", items: { type: "string" } } },
};

function validateCheck(x: unknown): Valid<CheckResult> {
  const o = x as Partial<CheckResult> | null;
  if (!o || typeof o.ok !== "boolean" || !Array.isArray(o.issues)) return { ok: false, errors: ["{ ok: boolean, issues: string[] } erwartet"] };
  return { ok: true, value: { ok: o.ok, issues: o.issues.filter((i): i is string => typeof i === "string") } };
}

const WRITER_SYSTEM = `Du schreibst zwei Teile für den Monatsbericht von performancegrowth an einen Versicherungsvermittler (Kunde), Sie-Form, im Namen von Ole Kannapinn und performancegrowth. Die Zahlen stehen im Bericht darunter schon als Tabellen.
1) intro: kurzer Einstieg in 2 bis 3 Sätzen mit dem Wichtigsten des Monats (Ergebnis bzw. Abschlüsse, Termine, Vergleich zum Vormonat, wenn vorhanden). Ist der Gewinn negativ, den Verlust nicht betonen: Abschlüsse, Termine oder den wachsenden Bestand nennen, nichts beschönigen. Bei Einstufung „mittel“ oder „schwach“ ruhig und sachlich, nach vorne schauen.
2) massnahmen: die Liste massnahmen_roh verständlich für den Kunden zusammenfassen, 1 bis 6 kurze Punkte im Stil „Wir haben …“. Nutzen statt Technik, keine internen Namen, gleichartige Maßnahmen zusammenfassen. Nur, was in massnahmen_roh steht: nichts erfinden, keine Floskeln wie „laufende Optimierung“. Ist massnahmen_roh leer, dann massnahmen = [].
Regeln:
- Nur Zahlen aus den gelieferten Daten. Keine Prozent-Werte selbst ausrechnen.
- Nennst du den Gewinn, dann immer beide Zahlen wie in ergebnis_im_monat.so_nennen („Gewinn: 490 €, mit künftigem Bestand: 2.590 €“). Der Wert mit künftigem Bestand ist eine Prognose, nicht schon verdient.
- Das Wort „Garantie“ (und Abwandlungen) nie verwenden. Keine Versprechen oder Zusicherungen („garantiert“, „sicher mehr“, „verdoppeln“).
- Keine Gedankenstriche (– oder —), stattdessen Komma, Doppelpunkt oder neuer Satz. Keine Abkürzungen wie „z. B.“.
- Ton: positiv ehrlich, kurz, wertschätzend, nie vorwurfsvoll. Keine Floskeln, keine Ausrufezeichen-Kaskaden.
- Keine Anrede (kommt separat), keine Grußformel, keine Links, kein Markdown.
Antworte ausschließlich mit JSON laut Schema.`;

const CHECKER_SYSTEM = `Du prüfst Einstieg und Maßnahmen eines Kundenberichts von performancegrowth vor dem Versand. Melde Probleme (issues) und setze ok=false, wenn:
- eine Zahl oder Behauptung nicht durch die gelieferten Daten gedeckt ist,
- eine Maßnahme genannt wird, die nicht in massnahmen_roh steht, oder eine Maßnahme nur eine Floskel ist,
- „Garantie“ oder ein Versprechen bzw. eine Zusicherung vorkommt,
- ein Gedankenstrich (– oder —) vorkommt,
- der Gewinn genannt wird, aber nicht beide Zahlen (Gewinn und Gewinn mit künftigem Bestand, siehe ergebnis_im_monat.so_nennen), oder der Wert mit künftigem Bestand als schon verdient dargestellt wird,
- der Ton vorwurfsvoll, entmutigend oder übertrieben ist,
- Fehler in Rechtschreibung oder Grammatik vorkommen.
Sonst ok=true und issues=[]. Antworte ausschließlich mit JSON laut Schema.`;

/** Daten für Schreiber und Prüfer (formatiert wie im Bericht). */
export function writerInput(customerName: string, d: ReportData, c: Classification): string {
  return JSON.stringify(
    {
      kunde: customerName,
      monat: monthLabel(d.month),
      einstufung_intern: c.rating,
      datenlage: c.dataQuality === "ok" ? "verlässlich" : "zu wenige Ergebnisse eingetragen, keine Abschlussquote betonen",
      betreff: reportSubject(d),
      vertriebstrichter_nur_bezahlte_leads: d.funnel?.steps.map((s) => ({ name: s.label, wert: s.value, quote: s.rate != null ? `${fmtPct(s.rate)} ${s.rateLabel}` : null, vormonat: s.previous })) ?? null,
      ergebnis_im_monat: d.result
        ? {
            zeilen: d.result.lines.map((l) => `${signedEur(l.amount, l.sign)} ${l.label}`),
            gewinn: fmtValue({ value: d.result.gewinn, unit: "€" }),
            gewinn_mit_kuenftigem_bestand: d.result.gewinnMitBestand != null ? fmtValue({ value: d.result.gewinnMitBestand, unit: "€" }) : null,
            kuenftige_bestandsprovision_5_jahre_prognose: d.result.kuenftigerBestand != null ? fmtValue({ value: d.result.kuenftigerBestand, unit: "€" }) : null,
            so_nennen: gewinnPairText(d.result),
          }
        : null,
      bestand: d.bestand
        ? {
            pro_jahr: fmtValue({ value: d.bestand.perYear, unit: "€" }),
            vertraege: d.bestand.contracts,
            in_5_jahren: fmtValue({ value: d.bestand.inYears, unit: "€" }),
            prognose_je_jahr: d.bestand.years.map((y) => `${y.year}. Jahr: ${fmtValue({ value: y.total, unit: "€" })}`),
          }
        : null,
      empfehlungen: d.empfehlungen,
      bestandskampagnen: d.bestandskampagnen,
      massnahmen_roh: d.rawMeasures.map((m) => m.text),
    },
    null,
    2,
  );
}

const fmtPct = (r: number) => `${(Math.round(r * 1000) / 10).toLocaleString("de-DE")} %`;

export type Generated = { text: ReportText; check: CheckResult; usage: AgentUsage };

/** Einstieg und Maßnahmen schreiben und prüfen (deterministisch und KI); bei Befund genau eine Überarbeitung. */
export async function writeReport(customerName: string, d: ReportData, c: Classification, llm: LlmCall = claudeCall): Promise<Generated> {
  const allowed = reportNumbers({ ...d, measures: [] });
  const input = writerInput(customerName, d, c);
  let usage: AgentUsage = { tokensIn: 0, tokensOut: 0, costCents: 0 };
  let hint = "";
  let last: Generated | null = null;
  for (let round = 1; round <= 2; round++) {
    const w = await runAgent(
      llm,
      { agent: "Berichtsschreiber", system: WRITER_SYSTEM, user: hint ? `${input}\n\nBitte überarbeiten:\n- ${hint}` : input, schema: TEXT_SCHEMA, maxTokens: 8000 },
      (x) => validateReportText(x, d.rawMeasures.length),
    );
    usage = add(usage, w.usage);
    const text = [w.value.intro, ...w.value.massnahmen].join("\n");
    const det = checkText(text, allowed);
    // Gewinn immer mit beiden Zahlen (Nur jetzt und mit künftigem Bestand)
    const pair = checkGewinnPair(text, d.result);
    if (pair) det.issues.push(pair);
    det.ok = det.ok && !pair;
    let ai: CheckResult = { ok: true, issues: [] };
    try {
      const r = await runAgent(llm, { agent: "Berichtsprüfer", system: CHECKER_SYSTEM, user: `Daten:\n${input}\n\nEinstieg und Maßnahmen:\n${text}`, schema: CHECK_SCHEMA, maxTokens: 4000 }, validateCheck);
      usage = add(usage, r.usage);
      ai = r.value;
    } catch (e) {
      ai = { ok: false, issues: [`KI-Prüfung nicht möglich: ${e instanceof Error ? e.message : e}`] };
    }
    const check = { ok: det.ok && ai.ok, issues: [...det.issues, ...ai.issues] };
    last = { text: w.value, check, usage };
    if (check.ok) return last;
    hint = check.issues.join("\n- ");
  }
  return { ...last!, usage };
}

const add = (a: AgentUsage, b: AgentUsage): AgentUsage => ({ tokensIn: a.tokensIn + b.tokensIn, tokensOut: a.tokensOut + b.tokensOut, costCents: a.costCents + b.costCents });

// ─── E-Mail ──────────────────────────────────────────────────────────────

/** Gespeicherter Inhalt: version 2 = neuer Bericht (model), sonst alte Kacheln (facts). */
export type ReportBody = { version?: 2; paragraphs: string[]; tips: string[]; facts?: Fact[]; model?: ReportModel };

export function tilesHtml(facts: Fact[]): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  const cells = facts
    .map(
      (f) => `<td style="padding:4px;width:${Math.floor(100 / Math.max(1, facts.length))}%"><div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#f8fafc">
  <div style="font-size:12px;color:#64748b">${esc(f.label)}</div>
  <div style="font-size:18px;font-weight:700;color:#0b1220;margin-top:2px">${esc(fmtValue(f))}</div>
  ${f.previous != null ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">Vormonat ${esc(fmtValue({ value: f.previous, unit: f.unit }))}</div>` : ""}
</div></td>`,
    )
    .join("");
  return `<table role="presentation" style="width:100%;border-collapse:separate;margin:0 0 16px"><tr>${cells}</tr></table>`;
}

/** Inhalt der Mail (ohne Empfänger und Betreff), für Versand und Vorschau. */
export function reportMailContent(
  body: ReportBody,
  o: { greeting: string; signature: string; bookingUrl: string | null; appUrl: string },
): Pick<CustomerMailOpts, "greeting" | "paragraphs" | "list" | "button" | "html" | "textBlocks" | "signature"> {
  if (body.version === 2 && body.model) {
    return {
      greeting: o.greeting,
      paragraphs: body.paragraphs,
      html: reportSectionsHtml(body.model, o.appUrl),
      textBlocks: reportSectionsText(body.model, o.appUrl),
      signature: o.signature,
    };
  }
  return {
    greeting: o.greeting,
    paragraphs: body.paragraphs,
    list: body.tips,
    html: tilesHtml(body.facts ?? []),
    button: { label: "Alle Zahlen ansehen", url: `${o.appUrl}/buyer/zahlen` },
    signature: o.signature,
  };
}

async function deliver(reportId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await prisma.monthlyReport.findUniqueOrThrow({
    where: { id: reportId },
    include: { customer: { select: { name: true, salesContact: { select: { id: true } }, users: { where: { role: "BUYER", teamRole: "owner" }, select: { email: true } } } } },
  });
  const to = r.customer.users.map((u) => u.email);
  if (!to.length) return { ok: false, error: "Kein Inhaber-Login mit E-Mail beim Kunden." };
  const settings = await loadReportSettings();
  const content = reportMailContent(r.body as unknown as ReportBody, {
    greeting: await customerGreeting({ salesContactId: r.customer.salesContact?.id ?? null }),
    signature: settings.senderName ?? `${PROVIDER.manager}\n${PROVIDER.brand}`,
    bookingUrl: settings.bookingUrl,
    appUrl: getAppUrl(),
  });
  const res = await sendCustomerMail({ to, subject: r.subject, ...content });
  return res.ok ? { ok: true } : res;
}

// ─── Erzeugen (Cron) ─────────────────────────────────────────────────────

export type RunOptions = { llm?: LlmCall; limit?: number; month?: string; customerIds?: string[] };

export const NO_MEASURE_REASON = "keine Maßnahme im Monat eingetragen, Bericht geht nicht automatisch raus";

/** Berichte für den Vormonat erzeugen (idempotent je Kunde und Monat). */
export async function runMonthlyReports(now = new Date(), opts: RunOptions = {}) {
  const month = opts.month ?? previousMonthKey(now);
  const settings = await loadReportSettings();
  const customers = await prisma.customer.findMany({
    where: {
      archived: false,
      isTest: false,
      monthlyReportsOff: false,
      plan: { in: ["software", "service"] },
      monthlyReports: { none: { month } },
      ...(opts.customerIds ? { id: { in: opts.customerIds } } : {}),
    },
    select: { id: true, name: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } },
    orderBy: { name: "asc" },
    take: opts.limit ?? 5,
  });
  const out = { month, created: 0, sent: 0, drafts: 0, skippedIneligible: 0, errors: 0 };
  for (const c of customers) {
    try {
      const m = await collectMetrics(c.id, month, settings);
      if (!eligible(m, settings)) {
        out.skippedIneligible++;
        continue;
      }
      const cls = classify(m, settings);
      const data = await collectReportData(c.id, month, settings, now);
      const gen = await writeReport(c.name, data, cls, opts.llm);
      const { rawMeasures, ...rest } = data;
      const model: ReportModel = { ...rest, measures: gen.text.massnahmen };
      // Ohne echte Maßnahme im Monat: nie automatisch, Ole prüft (Platzhalter gibt es nicht mehr)
      const noMeasure = rawMeasures.length === 0 || model.measures.length === 0;
      const reasons = noMeasure ? [...cls.reasons, NO_MEASURE_REASON] : cls.reasons;
      // Nur „gut“, geprüft, mit Maßnahmen und nur wenn eingeschaltet: automatisch senden. Alles andere bleibt Entwurf.
      const auto = cls.rating === "gut" && settings.autoSendGood && gen.check.ok && !noMeasure;
      const body: ReportBody = { version: 2, paragraphs: [gen.text.intro], tips: model.tips.map((t) => `${t.title}. ${t.text}`), facts: [], model };
      const row = await prisma.monthlyReport
        .create({
          data: {
            customerId: c.id,
            month,
            rating: cls.rating,
            dataQuality: cls.dataQuality,
            reasons,
            metrics: { ...m, rawMeasures } as unknown as Prisma.InputJsonValue,
            subject: reportSubject(model),
            body: body as unknown as Prisma.InputJsonValue,
            check: gen.check as unknown as Prisma.InputJsonValue,
            costCents: gen.usage.costCents,
          },
        })
        .catch((e: unknown) => {
          // Parallel schon angelegt (unique) → überspringen
          if (String(e).includes("Unique")) return null;
          throw e;
        });
      if (!row) continue;
      out.created++;
      if (auto) {
        const sent = await deliver(row.id).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
        if (sent.ok) {
          await prisma.monthlyReport.update({ where: { id: row.id }, data: { status: "sent", sentAt: new Date(), decidedBy: "automatisch" } });
          out.sent++;
          continue;
        }
        // Versand fehlgeschlagen → Entwurf mit Hinweis, Ole sieht es in Heute
        gen.check.issues.push(`Automatischer Versand fehlgeschlagen: ${sent.error}`);
        await prisma.monthlyReport.update({ where: { id: row.id }, data: { check: gen.check as unknown as Prisma.InputJsonValue } });
      }
      out.drafts++;
      const contactId = c.salesContact?.id ?? c.onboarding?.salesContactId ?? null;
      const advice =
        cls.rating === "schwach"
          ? "Empfehlung: anrufen statt schicken"
          : noMeasure
            ? "keine Maßnahme im Monat, bitte eintragen und prüfen"
            : cls.rating === "mittel"
              ? "bitte prüfen"
              : gen.check.ok
                ? "kann so raus"
                : "Prüfung hat Hinweise";
      await prisma.salesTask
        .create({
          data: {
            contactId,
            type: "SONSTIGES",
            title: `Monatsbericht prüfen: ${c.name} (${cls.rating}): ${advice}`,
            note: `Monat ${monthLabel(month)}. ${reasons.join("; ")}${gen.check.issues.length ? `\nPrüfung: ${gen.check.issues.join("; ")}` : ""}${noMeasure ? "\nMaßnahme eintragen: Admin → Optimierung" : ""}\nAdmin → Monatsberichte`,
            dueAt: new Date(),
          },
        })
        .catch((err) => reportError(err, "bericht-task"));
    } catch (e) {
      out.errors++;
      reportError(e, "monatsbericht", { customer: c.id });
    }
  }
  if (out.drafts > 0) {
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({ title: `Monatsberichte ${monthLabel(month)}`, body: `${out.drafts} Bericht(e) warten auf deine Prüfung`, url: `/admin/monatsberichte?monat=${month}` }).catch(() => {});
  }
  return out;
}

// ─── Entscheidungen (Admin) ──────────────────────────────────────────────

type Result = { ok: true } | { ok: false; error: string };

export async function sendReport(id: string, actor: AuditActor, edited?: { subject: string; paragraphs: string[] }): Promise<Result> {
  const r = await prisma.monthlyReport.findUnique({ where: { id }, select: { status: true, customerId: true, body: true } });
  if (!r) return { ok: false, error: "Bericht nicht gefunden." };
  if (r.status === "sent") return { ok: false, error: "Schon gesendet." };
  if (edited) {
    const text = [edited.subject, ...edited.paragraphs].join("\n");
    if (/garantie/i.test(text)) return { ok: false, error: "Bitte das Wort „Garantie“ entfernen, Garantien erwähnen wir im Bericht nicht." };
    if (hasDash(text)) return { ok: false, error: "Bitte ohne Gedankenstriche (– oder —) schreiben, besser Komma, Doppelpunkt oder neuer Satz." };
    const body = r.body as Record<string, unknown>;
    await prisma.monthlyReport.update({ where: { id }, data: { subject: edited.subject.trim(), body: { ...body, paragraphs: edited.paragraphs } as Prisma.InputJsonValue } });
  }
  const res = await deliver(id).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
  if (!res.ok) return res;
  await prisma.monthlyReport.update({ where: { id }, data: { status: "sent", sentAt: new Date(), decidedBy: actor.email ?? "admin" } });
  await audit("bericht.send", { entity: "MonthlyReport", entityId: id, customerId: r.customerId, details: { edited: !!edited }, actor });
  return { ok: true };
}

/** „Nicht senden, ich rufe an“: Anruf-Aufgabe statt Bericht. */
export async function callInstead(id: string, actor: AuditActor): Promise<Result> {
  const r = await prisma.monthlyReport.findUnique({
    where: { id },
    select: { status: true, month: true, customerId: true, reasons: true, customer: { select: { name: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } } } },
  });
  if (!r) return { ok: false, error: "Bericht nicht gefunden." };
  if (r.status === "sent") return { ok: false, error: "Schon gesendet." };
  await prisma.monthlyReport.update({ where: { id }, data: { status: "call", decidedBy: actor.email ?? "admin" } });
  await prisma.salesTask.create({
    data: {
      contactId: r.customer.salesContact?.id ?? r.customer.onboarding?.salesContactId ?? null,
      type: "ANRUF",
      title: `Anrufen: ${r.customer.name}, Monat ${monthLabel(r.month)} besprechen`,
      note: `Statt Monatsbericht. Intern: ${((r.reasons as string[] | null) ?? []).join("; ")}`,
      dueAt: new Date(),
    },
  });
  await audit("bericht.call", { entity: "MonthlyReport", entityId: id, customerId: r.customerId, actor });
  return { ok: true };
}

export async function skipReport(id: string, actor: AuditActor): Promise<Result> {
  const r = await prisma.monthlyReport.findUnique({ where: { id }, select: { status: true, customerId: true } });
  if (!r) return { ok: false, error: "Bericht nicht gefunden." };
  if (r.status === "sent") return { ok: false, error: "Schon gesendet." };
  await prisma.monthlyReport.update({ where: { id }, data: { status: "skipped", decidedBy: actor.email ?? "admin" } });
  await audit("bericht.skip", { entity: "MonthlyReport", entityId: id, customerId: r.customerId, actor });
  return { ok: true };
}

export async function setCustomerReportsOff(customerId: string, off: boolean, actor: AuditActor) {
  await prisma.customer.update({ where: { id: customerId }, data: { monthlyReportsOff: off } });
  await audit("bericht.kunde", { entity: "Customer", entityId: customerId, customerId, details: { off }, actor });
}

// ─── Lesen ───────────────────────────────────────────────────────────────

export async function listReports(month: string) {
  return prisma.monthlyReport.findMany({
    where: { month },
    orderBy: [{ status: "asc" }, { rating: "desc" }],
    select: { id: true, rating: true, dataQuality: true, status: true, subject: true, sentAt: true, costCents: true, customer: { select: { id: true, name: true, monthlyReportsOff: true } } },
  });
}

/** Für den Kundenbereich: nur gesendete Berichte, ohne interne Einstufung. */
export async function sentReportsFor(customerId: string) {
  return prisma.monthlyReport.findMany({
    where: { customerId, status: "sent" },
    orderBy: { month: "desc" },
    take: 12,
    select: { id: true, month: true, subject: true, body: true, sentAt: true },
  });
}
