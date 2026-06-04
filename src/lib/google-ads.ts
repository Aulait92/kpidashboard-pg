// Google Ads API — Read/Write für Media Buyer + Daten für Cost-Sync.
//
// Auth-Setup (einmalig):
//   1. Developer-Token bei Google beantragen
//      (https://developers.google.com/google-ads/api/docs/first-call/dev-token)
//   2. OAuth2-Client erstellen + Refresh-Token via OAuth-Flow holen
//      (oder via gcloud CLI / oauth2 playground)
//
// ENV:
//   GOOGLE_ADS_DEVELOPER_TOKEN
//   GOOGLE_ADS_CLIENT_ID
//   GOOGLE_ADS_CLIENT_SECRET
//   GOOGLE_ADS_REFRESH_TOKEN
//   GOOGLE_ADS_CUSTOMER_IDS       — kommagetrennt, ohne Bindestriche
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID  — optional, Manager-Account-ID falls MCC

import { addDays, endOfMonth, format, startOfMonth } from "date-fns";

const ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION ?? "v20";
const ADS_API = `https://googleads.googleapis.com/${ADS_API_VERSION}`;
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

function getEnv() {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const customersRaw = process.env.GOOGLE_ADS_CUSTOMER_IDS;
  if (
    !developerToken ||
    !clientId ||
    !clientSecret ||
    !refreshToken ||
    !customersRaw
  ) {
    throw new Error(
      "GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN und GOOGLE_ADS_CUSTOMER_IDS müssen gesetzt sein.",
    );
  }
  const customers = customersRaw
    .split(",")
    .map((s) => s.trim().replace(/-/g, ""))
    .filter((s) => s.length > 0);
  return {
    developerToken,
    clientId,
    clientSecret,
    refreshToken,
    customers,
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(
      /-/g,
      "",
    ),
  };
}

// Access-Token-Cache (Google-Tokens leben 1h — wir verlängern bei <5min Rest).
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const { clientId, clientSecret, refreshToken } = getEnv();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google OAuth refresh ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = JSON.parse(text) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new Error("Google OAuth refresh lieferte kein access_token zurück.");
  }
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

async function adsRequest(
  method: "GET" | "POST",
  customerId: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const { developerToken, loginCustomerId } = getEnv();
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": developerToken,
    ...(body != null ? { "Content-Type": "application/json" } : {}),
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;
  const url = `${ADS_API}/customers/${customerId}${path}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Google Ads ${method} ${url} ${res.status}: ${text.slice(0, 400)}`,
    );
  }
  return text.length > 0 ? (JSON.parse(text) as unknown) : null;
}

// GAQL-Query via searchStream. Antwort ist ein Stream von Result-Batches —
// wir lesen den ganzen Body, parsen jeden Batch und sammeln Rows.
async function gaqlQuery(
  customerId: string,
  query: string,
): Promise<Record<string, unknown>[]> {
  const json = (await adsRequest(
    "POST",
    customerId,
    "/googleAds:searchStream",
    { query },
  )) as
    | { results?: Record<string, unknown>[] }[]
    | { results?: Record<string, unknown>[] }
    | null;
  if (!json) return [];
  const batches = Array.isArray(json) ? json : [json];
  const rows: Record<string, unknown>[] = [];
  for (const b of batches) {
    for (const r of b.results ?? []) rows.push(r);
  }
  return rows;
}

// ─── Campaign-Discovery ──────────────────────────────────────────────

export type GoogleCampaign = {
  customerId: string;
  id: string; // numeric campaign id
  resourceName: string; // "customers/X/campaigns/Y" — fürs Update brauchen wir den
  budgetResourceName: string; // "customers/X/campaignBudgets/Z" — Budget ist eigene Ressource
  name: string;
  enabled: boolean;
  dailyBudgetEur: number;
  hasDailyBudget: boolean;
};

function microsToEur(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v / 1_000_000;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n / 1_000_000 : 0;
  }
  return 0;
}

function eurToMicros(eur: number): number {
  return Math.max(0, Math.round(eur * 1_000_000));
}

export async function listCampaigns(): Promise<GoogleCampaign[]> {
  const { customers } = getEnv();
  const out: GoogleCampaign[] = [];
  for (const customerId of customers) {
    const rows = await gaqlQuery(
      customerId,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.resource_name,
              campaign.campaign_budget,
              campaign_budget.amount_micros, campaign_budget.period
       FROM campaign
       WHERE campaign.status != 'REMOVED'`,
    );
    for (const r of rows) {
      const c = (r as { campaign?: Record<string, unknown> }).campaign;
      const b = (r as { campaignBudget?: Record<string, unknown> })
        .campaignBudget;
      if (!c || !b) continue;
      const id = String(c.id ?? "");
      const name = String(c.name ?? "");
      if (!id || !name) continue;
      const status = String(c.status ?? "");
      // Google Ads kennt PERIOD = DAILY (default) und CUSTOM_PERIOD; wir
      // schalten nur Daily.
      const isDaily = b.period == null || b.period === "DAILY";
      out.push({
        customerId,
        id,
        resourceName: String(c.resource_name ?? `customers/${customerId}/campaigns/${id}`),
        budgetResourceName: String(c.campaign_budget ?? ""),
        name,
        enabled: status === "ENABLED",
        dailyBudgetEur: isDaily ? microsToEur(b.amount_micros) : 0,
        hasDailyBudget: isDaily && !!b.amount_micros,
      });
    }
  }
  return out;
}

export function findCampaignsByKeyword(
  campaigns: GoogleCampaign[],
  keyword: string,
): GoogleCampaign[] {
  const k = keyword.toLowerCase().trim();
  if (!k) return [];
  return campaigns.filter((c) => c.name.toLowerCase().includes(k));
}

// Spend pro Kampagne über ein Range. cost_micros wird in EUR umgerechnet.
export async function getSpendByCampaign(params: {
  since: Date;
  until: Date;
}): Promise<Map<string, number>> {
  const { customers } = getEnv();
  const since = format(params.since, "yyyy-MM-dd");
  const until = format(params.until, "yyyy-MM-dd");
  const result = new Map<string, number>();
  for (const customerId of customers) {
    const rows = await gaqlQuery(
      customerId,
      `SELECT campaign.id, metrics.cost_micros
       FROM campaign
       WHERE segments.date BETWEEN '${since}' AND '${until}'`,
    );
    for (const r of rows) {
      const id = String(
        (r as { campaign?: { id?: unknown } }).campaign?.id ?? "",
      );
      const cost = microsToEur(
        (r as { metrics?: { cost_micros?: unknown } }).metrics?.cost_micros,
      );
      if (!id) continue;
      result.set(id, (result.get(id) ?? 0) + cost);
    }
  }
  return result;
}

export async function getMonthlySpendByCampaign(
  now: Date = new Date(),
): Promise<Map<string, number>> {
  return getSpendByCampaign({
    since: startOfMonth(now),
    until: endOfMonth(now),
  });
}

// Tages-Spend pro (campaign, day) — fürs Cost-Sync. Liefert Reihen mit
// campaignId + Datum als YYYY-MM-DD + spend in EUR.
export async function getDailySpendByCampaign(params: {
  since: Date;
  until: Date;
}): Promise<
  Map<string, { campaignName: string; days: Map<string, number> }>
> {
  const { customers } = getEnv();
  const since = format(params.since, "yyyy-MM-dd");
  const until = format(params.until, "yyyy-MM-dd");
  const result = new Map<
    string,
    { campaignName: string; days: Map<string, number> }
  >();
  for (const customerId of customers) {
    const rows = await gaqlQuery(
      customerId,
      `SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros
       FROM campaign
       WHERE segments.date BETWEEN '${since}' AND '${until}'`,
    );
    for (const r of rows) {
      const id = String(
        (r as { campaign?: { id?: unknown; name?: unknown } }).campaign?.id ??
          "",
      );
      const name = String(
        (r as { campaign?: { id?: unknown; name?: unknown } }).campaign?.name ??
          "",
      );
      const day = String(
        (r as { segments?: { date?: unknown } }).segments?.date ?? "",
      );
      const cost = microsToEur(
        (r as { metrics?: { cost_micros?: unknown } }).metrics?.cost_micros,
      );
      if (!id || !day || cost <= 0) continue;
      let entry = result.get(id);
      if (!entry) {
        entry = { campaignName: name, days: new Map() };
        result.set(id, entry);
      }
      if (name && !entry.campaignName) entry.campaignName = name;
      entry.days.set(day, (entry.days.get(day) ?? 0) + cost);
    }
  }
  return result;
}

// ─── Schreib-Operationen ─────────────────────────────────────────────

// Setzt das Tagesbudget einer Kampagne. Budget ist bei Google Ads ein
// eigenes Resource — wir mutieren campaignBudget.amount_micros direkt
// statt des Campaign-Objekts.
export async function setCampaignDailyBudget(
  campaign: GoogleCampaign,
  newAmountEur: number,
): Promise<void> {
  if (!campaign.hasDailyBudget || !campaign.budgetResourceName) {
    throw new Error(
      `Google-Ads-Kampagne ${campaign.name} hat kein steuerbares Tagesbudget.`,
    );
  }
  const rounded = Math.max(0, Math.round(newAmountEur * 100) / 100);
  await adsRequest("POST", campaign.customerId, "/campaignBudgets:mutate", {
    operations: [
      {
        update: {
          resourceName: campaign.budgetResourceName,
          amountMicros: eurToMicros(rounded),
        },
        updateMask: "amountMicros",
      },
    ],
  });
  campaign.dailyBudgetEur = rounded;
}

export async function setCampaignStatus(
  campaign: GoogleCampaign,
  enabled: boolean,
): Promise<void> {
  await adsRequest("POST", campaign.customerId, "/campaigns:mutate", {
    operations: [
      {
        update: {
          resourceName: campaign.resourceName,
          status: enabled ? "ENABLED" : "PAUSED",
        },
        updateMask: "status",
      },
    ],
  });
  campaign.enabled = enabled;
}
