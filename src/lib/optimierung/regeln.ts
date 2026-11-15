// Automatische Optimierung je Werbekonto (Teil B, Ole 18.11.2026): reine Entscheidungslogik.
//
// Kennzahlen rein, Maßnahmenliste raus. Keine Datenbank, keine Meta-Aufrufe, keine Uhr
// (alles über `input`), damit jede Regel in Unit-Tests nachprüfbar ist.
//
// Hebel (jeweils nur mit Datenbegründung):
//   1. Motiv-Erneuerung bei Ermüdung (Frequenz hoch, CTR fällt, Leadpreis steigt) oder
//      spätestens alle 4 Wochen: 2–3 neue Motive in die bestehende Anzeigengruppe.
//   2. Schwache Anzeigen pausieren (Leadpreis deutlich über Ziel bei genug Ausgaben),
//      die beste Anzeige einer Gruppe läuft immer weiter.
//   3. Budget zwischen Anzeigengruppen einer Kampagne umschichten, Summe bleibt gleich.
//   4. Schlechte Leadqualität: Formular- bzw. Zielgruppen-Vorschlag, nur an Ole.
// Regeln: höchstens 1 größere Änderung je Anzeigengruppe und Woche (Lernphase), nie über
// das vereinbarte Budget, keine Scheinaktionen (ohne Datenbegründung keine Maßnahme).

import { disqualifyLabel } from "@/lib/lead-quality";

export const MEASURE_KINDS = [
  "motiv_erneuern",
  "anzeige_pausieren",
  "budget_umschichten",
  "formular_vorschlag",
  "zielgruppe_vorschlag",
  "motiv_vorschlag",
  // Rückmeldung an Meta (lib/capi): Kampagne auf „Conversion Leads“ umstellen, nur Vorschlag (nie automatisch)
  "conversion_leads_vorschlag",
  "manuell",
] as const;
export type MeasureKind = (typeof MEASURE_KINDS)[number];

/** Vorschläge gehen nur an Ole (werden nie automatisch bei Meta umgesetzt). */
export const SUGGESTION_KINDS: readonly MeasureKind[] = ["formular_vorschlag", "zielgruppe_vorschlag", "motiv_vorschlag", "conversion_leads_vorschlag"];
export const isSuggestion = (k: string) => (SUGGESTION_KINDS as readonly string[]).includes(k);

export type TargetType = "ad" | "adset" | "campaign" | "account";

export type AdMetrics = {
  adId: string;
  adName: string;
  adSetId: string;
  campaignId: string;
  createdTime: string | null;
  /** letzte 14 Tage */
  spend: number;
  impressions: number;
  clicks: number;
  frequency: number;
  leads: number;
  /** die 14 Tage davor (null = keine Daten bzw. Anzeige zu jung) */
  prev: { spend: number; impressions: number; clicks: number; leads: number } | null;
};

export type AdSetMetrics = {
  adSetId: string;
  adSetName: string;
  campaignId: string;
  campaignName: string;
  /** Tagesbudget der Anzeigengruppe in € (null = Budget liegt an der Kampagne) */
  dailyBudget: number | null;
};

/** Leadqualität aus der Software. */
export type LeadQuality = {
  /** Leads der letzten 28 Tage */
  leads: number;
  /** davon disqualifiziert bzw. ungültig */
  disqualified: number;
  /** Gründe (Schlüssel aus lead-quality.ts bzw. Prüfgrund) → Anzahl */
  reasons: Record<string, number>;
  /** Leads, die alt genug für eine Bewertung sind (7 bis 60 Tage) */
  mature: number;
  /** davon nie erreicht */
  notReached: number;
  /** davon Abschluss */
  closed: number;
};

export type History = {
  /** Anzeigengruppe → letzte größere Änderung (ISO), aus Protokoll und Kampagnen-Läufen */
  majorChangeAt: Record<string, string>;
  /** Anzeigengruppe → zuletzt neue Motive (ISO) */
  lastRefreshAt: Record<string, string>;
  /** ausgeführte Maßnahmen im laufenden Monat */
  executedThisMonth: number;
  /** offene (geplante bzw. freigegebene) Maßnahmen als „Art|Ziel“ */
  open: string[];
  /** Vorschlagsart → letzter Vorschlag (ISO) */
  lastSuggestionAt: Partial<Record<MeasureKind, string>>;
};

export type Thresholds = {
  maxFrequency: number;
  /** CTR-Rückgang gegenüber den 14 Tagen davor (Anteil, 0.3 = 30 %) */
  ctrDrop: number;
  /** Leadpreis-Anstieg gegenüber den 14 Tagen davor (Anteil) */
  cplRise: number;
  /** Mindestausgaben (14 Tage), bevor der Leadpreis einer Anzeige zählt */
  minSpendEur: number;
  /** „deutlich über Ziel“: Leadpreis mindestens Ziel × Faktor */
  weakCplFactor: number;
  /** spätestens nach so vielen Tagen neue Motive */
  refreshEveryDays: number;
  /** jüngere Anzeigen werden nicht bewertet (Lernphase) */
  minAdAgeDays: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  maxFrequency: 3,
  ctrDrop: 0.3,
  cplRise: 0.4,
  minSpendEur: 50,
  weakCplFactor: 1.5,
  refreshEveryDays: 28,
  minAdAgeDays: 7,
};

export type PlanInput = {
  now: Date;
  /** Tag im Monat (Berlin) */
  dayOfMonth: number;
  /** Ziel-Leadpreis (€); null = Schnitt des Kontos */
  refCpl: number | null;
  /** z. B. „Ziel-Leadpreis“ oder „Schnitt des Kontos“ */
  refCplLabel?: string;
  /** vereinbartes Tagesbudget gesamt (€); null = unbekannt */
  agreedDailyBudget: number | null;
  /** aktuelles Tagesbudget gesamt bei Meta (Kampagnen- und Anzeigengruppen-Budgets) */
  currentDailyBudget: number | null;
  adSets: AdSetMetrics[];
  ads: AdMetrics[];
  quality: LeadQuality | null;
  history: History;
  /** Anzeigengruppen, in die das Agenten-Team neue Motive legen kann (Kampagne von uns angelegt) */
  refreshableAdSets: string[];
  thresholds?: Partial<Thresholds>;
};

export type PlannedMeasure = {
  kind: MeasureKind;
  targetType: TargetType;
  targetId: string | null;
  targetName: string | null;
  title: string;
  reason: string;
  data: Record<string, unknown>;
  params: Record<string, unknown> & { adSetIds: string[] };
  major: boolean;
};

export type PlanResult = {
  measures: PlannedMeasure[];
  /** Auffälligkeiten ohne Maßnahme (z. B. Budget über Vereinbarung) → Aufgabe an Ole */
  warnings: string[];
};

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: n >= 100 ? 0 : 2 })} €`;
const pct = (n: number) => `${(n * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
const cplOf = (spend: number, leads: number) => (leads > 0 ? spend / leads : Infinity);
const ctrOf = (clicks: number, impressions: number) => (impressions > 0 ? clicks / impressions : 0);
const daysBetween = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / DAY);
const MIN_IMPRESSIONS = 1000;
/** Mindestbudget je Anzeigengruppe nach dem Umschichten (Meta-Minimum mit Puffer) */
const MIN_ADSET_BUDGET = 5;

/** Ermüdungszeichen einer Anzeige (leer = keine). */
export function fatigueSignals(ad: AdMetrics, th: Thresholds): string[] {
  const out: string[] = [];
  if (ad.frequency > th.maxFrequency && ad.impressions >= MIN_IMPRESSIONS) {
    out.push(`Frequenz ${ad.frequency.toLocaleString("de-DE", { maximumFractionDigits: 1 })} (Grenze ${th.maxFrequency.toLocaleString("de-DE")})`);
  }
  const p = ad.prev;
  if (p && p.impressions >= MIN_IMPRESSIONS && ad.impressions >= MIN_IMPRESSIONS) {
    const before = ctrOf(p.clicks, p.impressions);
    const now = ctrOf(ad.clicks, ad.impressions);
    if (before > 0 && now <= before * (1 - th.ctrDrop)) {
      out.push(`CTR ${pct(now)} statt ${pct(before)} in den 14 Tagen davor (${Math.round((1 - now / before) * 100)} % weniger)`);
    }
  }
  if (p && p.leads > 0 && ad.spend >= th.minSpendEur) {
    const before = p.spend / p.leads;
    const now = cplOf(ad.spend, ad.leads);
    if (now >= before * (1 + th.cplRise)) {
      out.push(
        ad.leads > 0
          ? `Leadpreis ${eur(now)} statt ${eur(before)} in den 14 Tagen davor (${Math.round((now / before - 1) * 100)} % mehr)`
          : `${eur(ad.spend)} ausgegeben ohne Lead (davor ${eur(before)} je Lead)`,
      );
    }
  }
  return out;
}

function adAgeDays(ad: AdMetrics, now: Date): number | null {
  if (!ad.createdTime) return null;
  const t = new Date(ad.createdTime);
  return Number.isNaN(t.getTime()) ? null : daysBetween(t, now);
}

/** Maßnahmen für ein Werbekonto planen. */
export function planMeasures(input: PlanInput): PlanResult {
  const base = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  // Monatsziel: noch keine Maßnahme und schon Monatsmitte → etwas niedrigere Schwellen,
  // aber weiterhin nur mit Datenbegründung (keine Scheinaktion).
  const catchUp = input.history.executedThisMonth === 0 && input.dayOfMonth >= 15;
  const th: Thresholds = catchUp ? { ...base, refreshEveryDays: Math.min(base.refreshEveryDays, 21), weakCplFactor: Math.min(base.weakCplFactor, 1.3) } : base;
  const catchUpNote = catchUp ? " Diesen Monat gab es noch keine Maßnahme, deshalb etwas niedrigere Schwellen." : "";
  const now = input.now;
  const measures: PlannedMeasure[] = [];
  const warnings: string[] = [];
  const open = new Set(input.history.open);
  const isOpen = (kind: MeasureKind, targetId: string | null) => open.has(`${kind}|${targetId ?? ""}`);

  // Größere Änderungen dieser Woche je Anzeigengruppe (Protokoll + in diesem Lauf geplant)
  const majorThisWeek = new Set(
    Object.entries(input.history.majorChangeAt)
      .filter(([, iso]) => now.getTime() - new Date(iso).getTime() < 7 * DAY)
      .map(([id]) => id),
  );

  // Vergleichs-Leadpreis: Ziel, sonst Schnitt des Kontos (mind. 3 Leads)
  const totalSpend = input.ads.reduce((s, a) => s + a.spend, 0);
  const totalLeads = input.ads.reduce((s, a) => s + a.leads, 0);
  const ref = input.refCpl && input.refCpl > 0 ? input.refCpl : totalLeads >= 3 ? totalSpend / totalLeads : null;
  const refLabel = input.refCpl && input.refCpl > 0 ? (input.refCplLabel ?? "Ziel-Leadpreis") : "Schnitt des Kontos";

  const adsBySet = new Map<string, AdMetrics[]>();
  for (const a of input.ads) adsBySet.set(a.adSetId, [...(adsBySet.get(a.adSetId) ?? []), a]);
  const setInfo = new Map(input.adSets.map((s) => [s.adSetId, s]));
  const refreshable = new Set(input.refreshableAdSets);

  // ── 1. Motiv-Erneuerung ──
  for (const [adSetId, ads] of adsBySet) {
    const set = setInfo.get(adSetId);
    const setName = set?.adSetName ?? adSetId;
    const spend = ads.reduce((s, a) => s + a.spend, 0);
    if (spend <= 0) continue; // läuft nicht → keine Datenbasis
    const fatigued = ads.map((a) => ({ ad: a, signals: fatigueSignals(a, th) })).filter((f) => f.signals.length);
    const newest = ads.map((a) => adAgeDays(a, now)).filter((d): d is number => d != null);
    const lastRefreshIso = input.history.lastRefreshAt[adSetId];
    const sinceRefresh = lastRefreshIso ? daysBetween(new Date(lastRefreshIso), now) : newest.length ? Math.min(...newest) : null;
    const due = sinceRefresh != null && sinceRefresh >= th.refreshEveryDays;
    if (!fatigued.length && !due) continue;
    if (sinceRefresh != null && sinceRefresh < 14) continue; // frische Motive erst wirken lassen
    const canAgents = refreshable.has(adSetId);
    const kind: MeasureKind = canAgents ? "motiv_erneuern" : "motiv_vorschlag";
    if (isOpen(kind, adSetId)) continue;
    if (canAgents && majorThisWeek.has(adSetId)) continue;
    const reasons = [
      ...fatigued.map((f) => `„${f.ad.adName}“: ${f.signals.join("; ")}`),
      ...(due ? [`letzte neue Motive vor ${sinceRefresh} Tagen (spätestens alle ${th.refreshEveryDays} Tage)`] : []),
    ];
    measures.push({
      kind,
      targetType: "adset",
      targetId: adSetId,
      targetName: setName,
      title: canAgents ? `2 bis 3 neue Motive in „${setName}“` : `Neue Motive für „${setName}“ erstellen (von Hand)`,
      reason: `${reasons.join(". ")}.${canAgents ? "" : " Die Kampagne wurde nicht von den Kampagnen-Agenten angelegt, deshalb als Vorschlag."}${catchUpNote}`,
      data: {
        adSetSpend14d: r2(spend),
        daysSinceRefresh: sinceRefresh,
        fatigued: fatigued.map((f) => ({ adId: f.ad.adId, adName: f.ad.adName, frequency: f.ad.frequency, signals: f.signals })),
      },
      params: {
        adSetIds: [adSetId],
        campaignId: set?.campaignId ?? ads[0].campaignId,
        adSetId,
        fatigued: fatigued.map((f) => ({ adId: f.ad.adId, adName: f.ad.adName, adSetId, reasons: f.signals })),
      },
      major: canAgents,
    });
    if (canAgents) majorThisWeek.add(adSetId);
  }

  // ── 2. Schwache Anzeigen pausieren ──
  if (ref != null) {
    for (const [adSetId, ads] of adsBySet) {
      if (ads.length < 2) continue; // letzte laufende Anzeige nie pausieren
      const setName = setInfo.get(adSetId)?.adSetName ?? adSetId;
      const minSpend = Math.max(th.minSpendEur, 2 * ref);
      const judged = ads.map((a) => {
        const age = adAgeDays(a, now);
        const cpl = cplOf(a.spend, a.leads);
        const weak = (age == null || age >= th.minAdAgeDays) && a.spend >= minSpend && cpl >= ref * th.weakCplFactor;
        return { ad: a, cpl, weak };
      });
      // Beste Anzeige (niedrigster Leadpreis, bei Gleichstand höhere CTR) läuft immer weiter
      const best = [...judged].sort((x, y) => x.cpl - y.cpl || ctrOf(y.ad.clicks, y.ad.impressions) - ctrOf(x.ad.clicks, x.ad.impressions))[0];
      const weak = judged.filter((j) => j.weak && j.ad.adId !== best.ad.adId).sort((x, y) => y.cpl - x.cpl || y.ad.spend - x.ad.spend);
      // höchstens 2 je Gruppe und Woche; die beste Anzeige ist nie dabei, bleibt also aktiv
      for (const w of weak.slice(0, 2)) {
        if (isOpen("anzeige_pausieren", w.ad.adId)) continue;
        const cplText = w.ad.leads > 0 ? `Leadpreis ${eur(w.cpl)} bei ${w.ad.leads} Leads` : "kein Lead";
        measures.push({
          kind: "anzeige_pausieren",
          targetType: "ad",
          targetId: w.ad.adId,
          targetName: w.ad.adName,
          title: `Anzeige „${w.ad.adName}“ pausieren`,
          reason: `${eur(w.ad.spend)} ausgegeben in 14 Tagen, ${cplText}; ${refLabel} ${eur(ref)} (Grenze ${eur(ref * th.weakCplFactor)}). Beste Anzeige der Gruppe „${best.ad.adName}“ läuft weiter${Number.isFinite(best.cpl) ? ` (${eur(best.cpl)} je Lead)` : ""}.${catchUpNote}`,
          data: { spend14d: r2(w.ad.spend), leads14d: w.ad.leads, cpl: Number.isFinite(w.cpl) ? r2(w.cpl) : null, refCpl: r2(ref), refLabel, bestAdId: best.ad.adId, adSet: setName },
          params: { adSetIds: [adSetId], adId: w.ad.adId, adSetId },
          major: false,
        });
      }
    }
  }

  // ── 3. Budget umschichten (innerhalb einer Kampagne, Summe gleich) ──
  const overBudget = input.agreedDailyBudget != null && input.currentDailyBudget != null && input.currentDailyBudget > input.agreedDailyBudget * 1.05 + 0.5;
  if (overBudget) {
    warnings.push(`Tagesbudget bei Meta ${eur(input.currentDailyBudget!)} liegt über dem vereinbarten Budget von ${eur(input.agreedDailyBudget!)}. Bitte prüfen; die Optimierung schichtet nichts um, solange das so ist.`);
  } else {
    const byCampaign = new Map<string, AdSetMetrics[]>();
    for (const s of input.adSets) if (s.dailyBudget != null && s.dailyBudget > 0 && adsBySet.has(s.adSetId)) byCampaign.set(s.campaignId, [...(byCampaign.get(s.campaignId) ?? []), s]);
    for (const [campaignId, sets] of byCampaign) {
      if (sets.length < 2) continue;
      const rows = sets
        .map((s) => {
          const ads = adsBySet.get(s.adSetId) ?? [];
          const spend = ads.reduce((n, a) => n + a.spend, 0);
          const leads = ads.reduce((n, a) => n + a.leads, 0);
          return { set: s, spend, leads, cpl: cplOf(spend, leads) };
        })
        .filter((r) => r.spend >= th.minSpendEur);
      if (rows.length < 2) continue;
      const sorted = [...rows].sort((a, b) => a.cpl - b.cpl);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if (best.leads < 2 || !(worst.cpl >= best.cpl * 1.3)) continue;
      if (majorThisWeek.has(best.set.adSetId) || majorThisWeek.has(worst.set.adSetId)) continue;
      if (isOpen("budget_umschichten", campaignId)) continue;
      const from = worst.set.dailyBudget!;
      const to = best.set.dailyBudget!;
      // höchstens 20 % je Gruppe (Lernphase), ganze Euro, Untergrenze bleibt
      const amount = Math.floor(Math.min(from * 0.2, to * 0.2, from - MIN_ADSET_BUDGET));
      if (amount < 1) continue;
      const cplText = (r: typeof best) => (r.leads > 0 ? `${eur(r.cpl)} je Lead (${r.leads} Leads)` : `kein Lead bei ${eur(r.spend)}`);
      measures.push({
        kind: "budget_umschichten",
        targetType: "campaign",
        targetId: campaignId,
        targetName: best.set.campaignName,
        title: `${eur(amount)} pro Tag von „${worst.set.adSetName}“ zu „${best.set.adSetName}“`,
        reason: `„${best.set.adSetName}“: ${cplText(best)}, „${worst.set.adSetName}“: ${cplText(worst)} in 14 Tagen. Gesamtbudget bleibt ${eur(from + to)} pro Tag.${catchUpNote}`,
        data: { best: { adSetId: best.set.adSetId, spend: r2(best.spend), leads: best.leads, cpl: Number.isFinite(best.cpl) ? r2(best.cpl) : null }, worst: { adSetId: worst.set.adSetId, spend: r2(worst.spend), leads: worst.leads, cpl: Number.isFinite(worst.cpl) ? r2(worst.cpl) : null } },
        params: {
          adSetIds: [worst.set.adSetId, best.set.adSetId],
          campaignId,
          from: { adSetId: worst.set.adSetId, name: worst.set.adSetName, before: from, after: r2(from - amount) },
          to: { adSetId: best.set.adSetId, name: best.set.adSetName, before: to, after: r2(to + amount) },
        },
        major: true,
      });
      majorThisWeek.add(best.set.adSetId);
      majorThisWeek.add(worst.set.adSetId);
    }
  }

  // ── 4. Leadqualität: Vorschlag an Ole (Formular bzw. Zielgruppe) ──
  const q = input.quality;
  if (q) {
    const recent = (kind: MeasureKind) => {
      const iso = input.history.lastSuggestionAt[kind];
      return iso ? now.getTime() - new Date(iso).getTime() < 28 * DAY : false;
    };
    const points: string[] = [];
    const badShare = q.leads >= 10 ? q.disqualified / q.leads : 0;
    if (q.leads >= 10 && badShare >= 0.25) points.push(`${q.disqualified} von ${q.leads} Leads der letzten 28 Tage disqualifiziert bzw. ungültig (${Math.round(badShare * 100)} %)`);
    const notReachedShare = q.mature >= 10 ? q.notReached / q.mature : 0;
    if (q.mature >= 10 && notReachedShare >= 0.5) points.push(`${q.notReached} von ${q.mature} Leads nie erreicht (${Math.round(notReachedShare * 100)} %)`);
    if (q.mature >= 20 && q.closed === 0) points.push(`kein Abschluss aus ${q.mature} Leads (7 bis 60 Tage alt)`);
    if (points.length) {
      const top = Object.entries(q.reasons).sort((a, b) => b[1] - a[1])[0];
      const regionTop = top && top[0] === "region" && badShare >= 0.25;
      const kind: MeasureKind = regionTop ? "zielgruppe_vorschlag" : "formular_vorschlag";
      if (!recent(kind) && !isOpen(kind, null)) {
        const reasonsText = Object.entries(q.reasons)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, n]) => `${disqualifyLabel(k) ?? k}: ${n}`)
          .join(", ");
        measures.push({
          kind,
          targetType: "account",
          targetId: null,
          targetName: null,
          title: regionTop ? "Zielgruppe prüfen: viele Leads außerhalb der Region" : "Formular schärfen: Leadqualität niedrig",
          reason: `${points.join("; ")}.${reasonsText ? ` Häufigste Gründe: ${reasonsText}.` : ""} ${regionTop ? "Vorschlag: Umkreis bzw. Standorte der Zielgruppe enger fassen." : "Vorschlag: eine qualifizierende Frage ergänzen bzw. Formular auf „höhere Absicht“ stellen."}`,
          data: { ...q },
          params: { adSetIds: [] },
          major: false,
        });
      }
    }
  }

  return { measures, warnings };
}

const OPEN_STATUSES = new Set<string | null>([null, "", "Neu", "Nicht erreicht"]);

/**
 * Leadqualität aus Lead-Zeilen der Software zusammenfassen. null, wenn der Kunde Ergebnisse
 * (noch) kaum einträgt: unter 30 % der reifen Leads bearbeitet → keine Aussage (sonst falsche Schlüsse).
 */
export function summarizeQuality(
  recent: { status: string | null; disqualifyReason: string | null; stornoState: string | null }[],
  mature: { status: string | null; reached: boolean }[],
  extraInvalid: { reason: string | null }[] = [],
): LeadQuality | null {
  const reasons: Record<string, number> = {};
  let disqualified = 0;
  for (const l of recent) {
    if (l.status === "Disqualifiziert" || l.stornoState === "approved") {
      disqualified++;
      const k = l.disqualifyReason ?? (l.stornoState === "approved" ? "storno" : "ohne_grund");
      reasons[k] = (reasons[k] ?? 0) + 1;
    }
  }
  for (const i of extraInvalid) {
    disqualified++;
    const k = i.reason?.slice(0, 40) || "ungueltig";
    reasons[k] = (reasons[k] ?? 0) + 1;
  }
  const worked = mature.filter((l) => !OPEN_STATUSES.has(l.status) || l.reached).length;
  if (mature.length >= 10 && worked / mature.length < 0.3) return null;
  return {
    leads: recent.length + extraInvalid.length,
    disqualified,
    reasons,
    mature: mature.length,
    notReached: mature.filter((l) => !l.reached && OPEN_STATUSES.has(l.status)).length,
    closed: mature.filter((l) => l.status === "Abschluss").length,
  };
}

/** ISO-Woche („2026-W47“) für den Dubletten-Schutz. */
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Schlüssel gegen Doppelplanung innerhalb einer Woche. */
export const dedupeKeyOf = (accountId: string, now: Date, m: Pick<PlannedMeasure, "kind" | "targetId">) => `${accountId}|${isoWeekKey(now)}|${m.kind}|${m.targetId ?? ""}`;
