// Outbrain Amplify Marketing API — Wrapper für den Media Buyer.
//
// Phase 2: liest Campaigns + Tagesbudget + Periodenspend UND schreibt
// Budget/Status (Phase 1 war read-only).
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
  // Budget ist bei Outbrain ein eigenständiges Objekt — die ID brauchen wir
  // fürs Schreiben (PUT /budgets/{id}).
  budgetId: string | null;
};

function parseSpend(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function obRequest(
  method: "GET" | "PUT" | "POST",
  url: string,
  body?: unknown,
): Promise<unknown> {
  const { token } = getEnv();
  const res = await fetch(url, {
    method,
    headers: {
      "OB-TOKEN-V1": token,
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Outbrain ${method} ${url} ${res.status}: ${text.slice(0, 400)}`,
    );
  }
  return text.length > 0 ? (JSON.parse(text) as unknown) : null;
}

function obGet(url: string): Promise<unknown> {
  return obRequest("GET", url);
}

function metadataToCampaign(
  marketerId: string,
  m: OutbrainCampaignMetadata,
): OutbrainCampaign | null {
  if (!m.id || !m.name) return null;
  const budgetAmount =
    m.budget?.type === "DAILY"
      ? typeof m.budget.amount === "number"
        ? m.budget.amount
        : Number.parseFloat(String(m.budget.amount ?? 0))
      : 0;
  return {
    marketerId,
    id: m.id,
    name: m.name,
    enabled: m.enabled ?? false,
    onAir: m.campaignOnAir ?? false,
    dailyBudgetEur: Number.isFinite(budgetAmount) ? budgetAmount : 0,
    budgetId: m.budget?.id ?? null,
  };
}

// Listet alle Kampagnen über alle Marketer hinweg. Wir nehmen den Reports-
// Endpoint mit from=to=heute — Antwort enthält metadata.budget (inkl. ID,
// type, amount), und wir wissen aus dem Sync, dass das Schema stabil ist.
export async function listCampaigns(): Promise<OutbrainCampaign[]> {
  const { marketers } = getEnv();
  const today = format(new Date(), "yyyy-MM-dd");
  const out: OutbrainCampaign[] = [];
  for (const marketerId of marketers) {
    const url = new URL(
      `${OUTBRAIN_API}/reports/marketers/${marketerId}/campaigns`,
    );
    url.searchParams.set("from", today);
    url.searchParams.set("to", today);
    url.searchParams.set("includeArchivedCampaigns", "false");
    url.searchParams.set("limit", "500");
    const json = (await obGet(url.toString())) as OutbrainListResponse;
    if (json.error) {
      throw new Error(
        `Outbrain marketer ${marketerId}: ${json.error.message ?? "unbekannt"}`,
      );
    }
    for (const r of json.results ?? []) {
      const c = metadataToCampaign(marketerId, r.metadata ?? {});
      if (c) out.push(c);
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

// Aggregat-Spend pro Kampagne über ein beliebiges Zeitfenster.
// Spend, der noch nicht aus der API geflossen ist (Outbrain-Reporting-
// Latenz 6–24h), taucht erst beim nächsten Sync auf.
export async function getSpendByCampaign(params: {
  since: Date;
  until: Date;
}): Promise<Map<string, number>> {
  const { marketers } = getEnv();
  const from = format(params.since, "yyyy-MM-dd");
  const to = format(params.until, "yyyy-MM-dd");
  const result = new Map<string, number>();
  for (const marketerId of marketers) {
    const url = new URL(
      `${OUTBRAIN_API}/reports/marketers/${marketerId}/campaigns`,
    );
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("includeArchivedCampaigns", "true");
    url.searchParams.set("limit", "500");
    const json = (await obGet(url.toString())) as OutbrainListResponse;
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

// MTD-Variante — bleibt fürs Admin-UI erhalten.
export async function getMonthlySpendByCampaign(
  now: Date = new Date(),
): Promise<Map<string, number>> {
  return getSpendByCampaign({
    since: startOfMonth(now),
    until: endOfMonth(now),
  });
}

// ─── Schreib-Operationen (Phase 2) ───────────────────────────────────

// Setzt das Tagesbudget einer Outbrain-Kampagne. Budget ist bei Outbrain ein
// eigenständiges Objekt (PUT /budgets/{id} statt am Campaign).
export async function setCampaignDailyBudget(
  campaign: OutbrainCampaign,
  newAmountEur: number,
): Promise<void> {
  if (!campaign.budgetId) {
    throw new Error(
      `Outbrain-Kampagne ${campaign.name} hat keine budget.id — vermutlich Shared/Lifetime-Budget. Steuerung übersprungen.`,
    );
  }
  const rounded = Math.max(0, Math.round(newAmountEur * 100) / 100);
  await obRequest(
    "PUT",
    `${OUTBRAIN_API}/budgets/${campaign.budgetId}`,
    { amount: rounded },
  );
  campaign.dailyBudgetEur = rounded;
}

// Setzt enabled-Flag auf der Kampagne. Outbrains On-Air-Status ist die
// Kombination aus enabled + Schedule — wir kontrollieren nur enabled, das
// reicht für Pause/Resume.
export async function setCampaignStatus(
  campaign: OutbrainCampaign,
  enabled: boolean,
): Promise<void> {
  await obRequest(
    "PUT",
    `${OUTBRAIN_API}/marketers/${campaign.marketerId}/campaigns/${campaign.id}`,
    { enabled },
  );
  campaign.enabled = enabled;
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
  const json = (await obGet(url)) as OutbrainCampaignMetadata;
  return metadataToCampaign(marketerId, json);
}

// Helper, damit der Aufrufer „lookback for forecasting" sauber bauen kann.
export function daysBack(now: Date, n: number): Date {
  return addDays(now, -n);
}
