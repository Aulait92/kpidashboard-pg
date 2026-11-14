// Automatische Optimierung: Meta lesen (Kennzahlen, Änderungsprotokoll) und Maßnahmen umsetzen.
// Alles über die MetaApi-Schnittstelle der Kampagnen-Agenten (lib/kampagnen/builder), damit
// Tests die Graph-API vollständig ersetzen können. Schreibend nur: Anzeige PAUSED setzen und
// Tagesbudgets von Anzeigengruppen ändern. Aktiviert wird hier nie etwas.

import type { MetaApi } from "@/lib/kampagnen/builder";
import type { AdMetrics, AdSetMetrics } from "@/lib/optimierung/regeln";

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const act = (id: string) => (id.startsWith("act_") ? id : `act_${id}`);
const centToEur = (c: string | undefined) => {
  const n = Number.parseInt(c ?? "", 10);
  return Number.isFinite(n) ? n / 100 : null;
};

export type MetaCampaignRow = { id: string; name: string; status?: string; effective_status?: string; daily_budget?: string };
type AdRow = { id: string; name: string; adset_id: string; created_time?: string; effective_status?: string };
type AdSetRow = { id: string; name: string; daily_budget?: string; effective_status?: string };
type InsightRow = { ad_id?: string; impressions?: string; clicks?: string; spend?: string; frequency?: string; actions?: { action_type: string; value: string }[] };

const LEAD_ACTIONS = ["onsite_conversion.lead_grouped", "lead", "leadgen_grouped"];
const leadsOf = (r: InsightRow) => Math.max(0, ...(r.actions ?? []).filter((a) => LEAD_ACTIONS.includes(a.action_type)).map((a) => Number(a.value) || 0));

export type AccountSnapshot = {
  campaigns: { id: string; name: string; adAccountId: string; dailyBudget: number | null }[];
  adSets: AdSetMetrics[];
  ads: AdMetrics[];
  /** Kampagnenbudgets (CBO) + Budgets der Anzeigengruppen (ABO) der betrachteten Kampagnen */
  totalDailyBudget: number;
};

/** Aktive Kampagnen eines Werbekontos. */
export async function listActiveCampaigns(meta: MetaApi, adAccountId: string): Promise<MetaCampaignRow[]> {
  const r = await meta.get<{ data?: MetaCampaignRow[] }>(`${act(adAccountId)}/campaigns`, {
    fields: "id,name,status,effective_status,daily_budget",
    effective_status: JSON.stringify(["ACTIVE"]),
    limit: "200",
  });
  return (r.data ?? []).filter((c) => (c.effective_status ?? c.status) === "ACTIVE");
}

/**
 * Kennzahlen der aktiven Anzeigen (letzte 14 Tage und die 14 Tage davor) und Budgets der
 * aktiven Anzeigengruppen. Nur lesend.
 */
export async function readAccountSnapshot(
  meta: MetaApi,
  input: { adAccountIds: string[]; campaignFilter: (c: MetaCampaignRow) => boolean; now: Date },
): Promise<AccountSnapshot> {
  const until = new Date(input.now.getTime() - DAY);
  const since = new Date(input.now.getTime() - 14 * DAY);
  const prevUntil = new Date(input.now.getTime() - 15 * DAY);
  const prevSince = new Date(input.now.getTime() - 28 * DAY);
  const out: AccountSnapshot = { campaigns: [], adSets: [], ads: [], totalDailyBudget: 0 };
  for (const accountId of input.adAccountIds) {
    const campaigns = (await listActiveCampaigns(meta, accountId)).filter(input.campaignFilter);
    for (const c of campaigns) {
      const cbo = centToEur(c.daily_budget);
      out.campaigns.push({ id: c.id, name: c.name, adAccountId: accountId.replace(/^act_/, ""), dailyBudget: cbo });
      if (cbo) out.totalDailyBudget += cbo;
      const [sets, ads, cur, prev] = await Promise.all([
        meta.get<{ data?: AdSetRow[] }>(`${c.id}/adsets`, { fields: "id,name,daily_budget,effective_status", limit: "100" }),
        meta.get<{ data?: AdRow[] }>(`${c.id}/ads`, { fields: "id,name,adset_id,created_time,effective_status", limit: "200" }),
        meta.get<{ data?: InsightRow[] }>(`${c.id}/insights`, {
          level: "ad",
          fields: "ad_id,impressions,clicks,spend,frequency,actions",
          time_range: JSON.stringify({ since: ymd(since), until: ymd(until) }),
          limit: "500",
        }),
        meta.get<{ data?: InsightRow[] }>(`${c.id}/insights`, {
          level: "ad",
          fields: "ad_id,impressions,clicks,spend,actions",
          time_range: JSON.stringify({ since: ymd(prevSince), until: ymd(prevUntil) }),
          limit: "500",
        }),
      ]);
      const activeSets = (sets.data ?? []).filter((s) => (s.effective_status ?? "ACTIVE") === "ACTIVE");
      for (const s of activeSets) {
        const budget = cbo ? null : centToEur(s.daily_budget);
        if (budget) out.totalDailyBudget += budget;
        out.adSets.push({ adSetId: s.id, adSetName: s.name, campaignId: c.id, campaignName: c.name, dailyBudget: budget });
      }
      const activeSetIds = new Set(activeSets.map((s) => s.id));
      const curBy = new Map((cur.data ?? []).map((r) => [r.ad_id, r]));
      const prevBy = new Map((prev.data ?? []).map((r) => [r.ad_id, r]));
      for (const a of ads.data ?? []) {
        if ((a.effective_status ?? "") !== "ACTIVE" || !activeSetIds.has(a.adset_id)) continue;
        const r = curBy.get(a.id) ?? {};
        const p = prevBy.get(a.id);
        out.ads.push({
          adId: a.id,
          adName: a.name,
          adSetId: a.adset_id,
          campaignId: c.id,
          createdTime: a.created_time ?? null,
          spend: Number(r.spend) || 0,
          impressions: Number(r.impressions) || 0,
          clicks: Number(r.clicks) || 0,
          frequency: Number(r.frequency) || 0,
          leads: leadsOf(r),
          prev: p ? { spend: Number(p.spend) || 0, impressions: Number(p.impressions) || 0, clicks: Number(p.clicks) || 0, leads: leadsOf(p) } : null,
        });
      }
    }
  }
  return out;
}

// ─── Ausführen (nur nach Freigabe) ─────────────────────────────────────

/** Anzeige pausieren. Prüft vorher, dass sie noch läuft und die Gruppe danach nicht leer ist. */
export async function pauseAd(meta: MetaApi, adId: string, adSetId: string): Promise<string> {
  const ad = await meta.get<{ effective_status?: string; adset_id?: string; name?: string }>(adId, { fields: "effective_status,adset_id,name" });
  if (ad.effective_status !== "ACTIVE") throw new Error(`Anzeige läuft nicht mehr (${ad.effective_status ?? "unbekannt"}), nichts geändert.`);
  const siblings = await meta.get<{ data?: AdRow[] }>(`${adSetId}/ads`, { fields: "id,effective_status", limit: "200" });
  const active = (siblings.data ?? []).filter((a) => a.effective_status === "ACTIVE" && a.id !== adId);
  if (!active.length) throw new Error("Es wäre keine Anzeige in der Gruppe mehr aktiv, nichts geändert.");
  const body = { status: "PAUSED" };
  await meta.post(adId, body);
  return `Anzeige „${ad.name ?? adId}“ pausiert; ${active.length} ${active.length === 1 ? "Anzeige läuft" : "Anzeigen laufen"} in der Gruppe weiter.`;
}

export type BudgetMove = { adSetId: string; name?: string; before: number; after: number };

/** Budget zwischen zwei Anzeigengruppen umschichten (Summe darf nicht steigen). */
export async function moveBudget(meta: MetaApi, from: BudgetMove, to: BudgetMove, agreedDailyBudget: number | null): Promise<string> {
  if (from.after + to.after > from.before + to.before + 0.01) throw new Error("Sicherheitsstopp: Summe der Budgets würde steigen.");
  if (from.after < 1) throw new Error("Sicherheitsstopp: Budget unter 1 € pro Tag.");
  const read = (id: string) => meta.get<{ daily_budget?: string; effective_status?: string }>(id, { fields: "daily_budget,effective_status" });
  const [a, b] = await Promise.all([read(from.adSetId), read(to.adSetId)]);
  const nowA = centToEur(a.daily_budget);
  const nowB = centToEur(b.daily_budget);
  if (nowA == null || nowB == null || Math.abs(nowA - from.before) > 0.5 || Math.abs(nowB - to.before) > 0.5) {
    throw new Error(`Budgets haben sich seit der Planung geändert (jetzt ${nowA ?? "?"} € und ${nowB ?? "?"} €), nichts geändert.`);
  }
  if (agreedDailyBudget != null && from.after + to.after > agreedDailyBudget + 0.01) throw new Error("Sicherheitsstopp: über dem vereinbarten Budget.");
  // Erst senken, dann erhöhen: so liegt die Summe nie über dem Ausgangswert.
  await meta.post(from.adSetId, { daily_budget: Math.round(from.after * 100) });
  try {
    await meta.post(to.adSetId, { daily_budget: Math.round(to.after * 100) });
  } catch (err) {
    await meta.post(from.adSetId, { daily_budget: Math.round(from.before * 100) }).catch(() => undefined);
    throw err;
  }
  const fmt = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })} €`;
  return `„${from.name ?? from.adSetId}“ ${fmt(from.before)} → ${fmt(from.after)}, „${to.name ?? to.adSetId}“ ${fmt(to.before)} → ${fmt(to.after)} pro Tag.`;
}

// ─── Änderungsprotokoll (Ad Account activities) ────────────────────────

export type MetaActivityRow = {
  event_time: string;
  event_type: string;
  translated_event_type?: string;
  object_id?: string;
  object_name?: string;
  object_type?: string;
  actor_name?: string;
  application_name?: string;
  extra_data?: string;
};

export const ACTIVITY_FIELDS = "event_time,event_type,translated_event_type,object_id,object_name,object_type,actor_name,application_name,extra_data";

/**
 * GET /act_{id}/activities (Graph API v22.0): Änderungsprotokoll des Werbekontos. Liest mit dem
 * System-User-Token; nötig ist Zugriff auf das Konto mit ads_read bzw. ads_management.
 * since/until als Unix-Sekunden, Blättern über paging.cursors.after.
 */
export async function fetchActivities(meta: MetaApi, adAccountId: string, since: Date, until: Date, maxPages = 10): Promise<MetaActivityRow[]> {
  const out: MetaActivityRow[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const r = await meta.get<{ data?: MetaActivityRow[]; paging?: { cursors?: { after?: string }; next?: string } }>(`${act(adAccountId)}/activities`, {
      fields: ACTIVITY_FIELDS,
      since: String(Math.floor(since.getTime() / 1000)),
      until: String(Math.floor(until.getTime() / 1000)),
      limit: "200",
      ...(after ? { after } : {}),
    });
    out.push(...(r.data ?? []));
    after = r.paging?.next ? r.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}

/** Typische Zugriffsfehler erkennen (Token fehlt/abgelaufen, kein Partnerzugriff). */
export function isAccessError(msg: string): boolean {
  return /#10\b|#200\b|#190\b|\b190\b|ads_management|ads_read|has NOT grant|permission|not authorized|access token|OAuthException|nicht gesetzt/i.test(msg);
}
