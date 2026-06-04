// Outbrain Amplify Marketing API — Read-only Wrapper für den Media Buyer.
//
// Phase 1: nur lesen (Campaigns + Tagesbudget + Periodenspend), damit der
// Buyer Outbrain-Pacing & CPL in seine Entscheidungen einbeziehen kann.
// Schreib-Operationen (Budget-Update, Pause) kommen in Phase 2.
//
// Env-Variablen (gleiche wie outbrain.ts):
//   OUTBRAIN_TOKEN          — long-lived Token, Header OB-TOKEN-V1
//   OUTBRAIN_MARKETER_IDS   — kommagetrennt; wir nehmen alle, deduzieren Spend
//                             über alle Marketer

import { addDays, endOfMonth, format, startOfMonth } from "date-fns";

const OUTBRAIN_API = "https://api.outbrain.com/amplify/v0.1";

function getEnv() {
  const token = process.env.OUTBRAIN_TOKEN;
  const marketersRaw = process.env.OUTBRAIN_MARKETER_IDS;
  if (!token || !marketersRaw) {
    throw new Error(
      "OUTBRAIN_TOKEN und OUTBRAIN_MARKETER_IDS müssen gesetzt sein.",
    );
  }
  const marketers = marketersRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return { token, marketers };
}

// Outbrain-Budget-Form aus dem Marketing-API-Schema. Felder, die wir brauchen,
// sind type ("DAILY" / "MONTHLY") und amount (Zahl in der Konto-Währung).
type OutbrainBudget = {
  id?: string;
  amount?: number;
  currency?: string;
  type?: string;
  pacing?: string;
};

type OutbrainCampaignMetadata = {
  id?: string;
  name?: string;
  enabled?: boolean;
  onAirStatus?: string;
  campaignOnAir?: boolean;
  budget?: OutbrainBudget;
};

type OutbrainCampaignResult = {
  metadata?: OutbrainCampaignMetadata;
  metrics?: { spend?: string | number };
};

type OutbrainListResponse = {
  results?: OutbrainCampaignResult[];
  totalResults?: number;
  error?: { message?: string; code?: number };
};

export type OutbrainCampaign = {
  marketerId: string;
  id: string;
  name: string;
  enabled: boolean;
  onAir: boolean;
  dailyBudgetEur: number;
};

function parseSpend(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function obFetch(url: string): Promise<unknown> {
  const { token } = getEnv();
  const res = await fetch(url, {
    headers: { "OB-TOKEN-V1": token },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Outbrain ${url} ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as unknown;
}

// Listet alle Kampagnen über alle Marketer hinweg. Tagesbudget kommt aus dem
// budget-Block (nur Kampagnen mit budget.type === "DAILY" sind steuerbar).
export async function listCampaigns(): Promise<OutbrainCampaign[]> {
  const { marketers } = getEnv();
  const out: OutbrainCampaign[] = [];
  for (const marketerId of marketers) {
    const url = new URL(
      `${OUTBRAIN_API}/marketers/${marketerId}/campaigns`,
    );
    url.searchParams.set("limit", "500");
    url.searchParams.set("includeArchived", "false");
    const json = (await obFetch(url.toString())) as {
      campaigns?: OutbrainCampaignMetadata[];
      error?: { message?: string };
    };
    if (json.error) {
      throw new Error(
        `Outbrain marketer ${marketerId}: ${json.error.message ?? "unbekannt"}`,
      );
    }
    const items = json.campaigns ?? [];
    for (const c of items) {
      if (!c.id || !c.name) continue;
      const budgetAmount =
        c.budget?.type === "DAILY"
          ? typeof c.budget.amount === "number"
            ? c.budget.amount
            : Number.parseFloat(String(c.budget.amount ?? 0))
          : 0;
      out.push({
        marketerId,
        id: c.id,
        name: c.name,
        enabled: c.enabled ?? false,
        onAir: c.campaignOnAir ?? false,
        dailyBudgetEur: Number.isFinite(budgetAmount) ? budgetAmount : 0,
      });
    }
  }
  return out;
}

// Substring-Match analog zu Meta — case-insensitive.
export function findCampaignsByKeyword(
  campaigns: OutbrainCampaign[],
  keyword: string,
): OutbrainCampaign[] {
  const k = keyword.toLowerCase().trim();
  if (!k) return [];
  return campaigns.filter((c) => c.name.toLowerCase().includes(k));
}

// Spend pro Kampagne für den laufenden Monat (Aggregat, kein breakdown).
// Liefert eine Map campaignId → Spend in der Konto-Währung. Spend, der
// noch nicht aus der API geflossen ist (Outbrain-Reporting-Latenz 6–24h),
// taucht erst beim nächsten Sync auf.
export async function getMonthlySpendByCampaign(
  now: Date = new Date(),
): Promise<Map<string, number>> {
  const { marketers } = getEnv();
  const from = format(startOfMonth(now), "yyyy-MM-dd");
  const to = format(endOfMonth(now), "yyyy-MM-dd");
  const result = new Map<string, number>();
  for (const marketerId of marketers) {
    const url = new URL(
      `${OUTBRAIN_API}/reports/marketers/${marketerId}/campaigns`,
    );
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("includeArchivedCampaigns", "true");
    url.searchParams.set("limit", "500");
    const json = (await obFetch(url.toString())) as OutbrainListResponse;
    if (json.error) {
      throw new Error(
        `Outbrain spend marketer ${marketerId}: ${json.error.message ?? "unbekannt"}`,
      );
    }
    for (const c of json.results ?? []) {
      const id = c.metadata?.id;
      if (!id) continue;
      result.set(id, parseSpend(c.metrics?.spend));
    }
  }
  return result;
}

// Mini-Helper, der die für den Buyer relevanten Lebenszeichen einer Kampagne
// kompakt zurückgibt. Aktuell read-only — Schreiboperationen kommen erst in
// Phase 2.
export type OutbrainBudgetState = {
  marketerId: string;
  campaignId: string;
  campaignName: string;
  enabled: boolean;
  onAir: boolean;
  dailyBudgetEur: number;
};

export function getCampaignBudgetState(
  campaign: OutbrainCampaign,
): OutbrainBudgetState {
  return {
    marketerId: campaign.marketerId,
    campaignId: campaign.id,
    campaignName: campaign.name,
    enabled: campaign.enabled,
    onAir: campaign.onAir,
    dailyBudgetEur: campaign.dailyBudgetEur,
  };
}

// Optional: bei Bedarf einzelner Kampagnen-Refresh (für Phase 2 nützlich).
export async function refreshCampaign(
  marketerId: string,
  campaignId: string,
): Promise<OutbrainCampaign | null> {
  const url = `${OUTBRAIN_API}/marketers/${marketerId}/campaigns/${campaignId}`;
  const json = (await obFetch(url)) as OutbrainCampaignMetadata;
  if (!json.id || !json.name) return null;
  const budgetAmount =
    json.budget?.type === "DAILY"
      ? typeof json.budget.amount === "number"
        ? json.budget.amount
        : Number.parseFloat(String(json.budget.amount ?? 0))
      : 0;
  return {
    marketerId,
    id: json.id,
    name: json.name,
    enabled: json.enabled ?? false,
    onAir: json.campaignOnAir ?? false,
    dailyBudgetEur: Number.isFinite(budgetAmount) ? budgetAmount : 0,
  };
}

// Helper, damit der Aufrufer „lookback for forecasting" sauber bauen kann.
export function daysBack(now: Date, n: number): Date {
  return addDays(now, -n);
}
