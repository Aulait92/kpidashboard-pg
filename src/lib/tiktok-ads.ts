// TikTok Marketing API — Read/Write für den Media Buyer.
//
// ENV: gleiche wie tiktok.ts (TIKTOK_ACCESS_TOKEN, TIKTOK_ADVERTISER_IDS).
//
// Endpoints:
//   GET  /campaign/get/                 → Kampagnen-Liste + budget
//   POST /campaign/update/              → budget ändern
//   POST /campaign/status/update/       → ENABLE / DISABLE
//   POST /report/integrated/get/        → Spend pro Kampagne (Range)

import { format, startOfMonth, endOfMonth } from "date-fns";

const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";

function getEnv() {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  const advertisersRaw = process.env.TIKTOK_ADVERTISER_IDS;
  if (!token || !advertisersRaw) {
    throw new Error(
      "TIKTOK_ACCESS_TOKEN und TIKTOK_ADVERTISER_IDS müssen gesetzt sein.",
    );
  }
  const advertisers = advertisersRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return { token, advertisers };
}

type TikTokCampaignMetadata = {
  campaign_id?: string;
  campaign_name?: string;
  operation_status?: string; // "ENABLE" | "DISABLE"
  campaign_status?: string;
  budget?: string | number;
  budget_mode?: string; // "BUDGET_MODE_DAY" | "BUDGET_MODE_TOTAL" | "BUDGET_MODE_INFINITE"
};

type CampaignsListResponse = {
  code?: number;
  message?: string;
  data?: { list?: TikTokCampaignMetadata[] };
};

export type TikTokCampaign = {
  advertiserId: string;
  id: string;
  name: string;
  enabled: boolean;
  dailyBudgetEur: number;
  // Nur Kampagnen mit BUDGET_MODE_DAY sind sinnvoll steuerbar; Total/Infinite
  // bleiben read-only.
  hasDailyBudget: boolean;
};

async function ttRequest(
  method: "GET" | "POST",
  url: string,
  body?: unknown,
): Promise<unknown> {
  const { token } = getEnv();
  const res = await fetch(url, {
    method,
    headers: {
      "Access-Token": token,
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `TikTok ${method} ${url} ${res.status}: ${text.slice(0, 400)}`,
    );
  }
  return text.length > 0 ? (JSON.parse(text) as unknown) : null;
}

function parseBudget(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function metaToCampaign(
  advertiserId: string,
  m: TikTokCampaignMetadata,
): TikTokCampaign | null {
  if (!m.campaign_id || !m.campaign_name) return null;
  const isDaily = m.budget_mode === "BUDGET_MODE_DAY";
  return {
    advertiserId,
    id: m.campaign_id,
    name: m.campaign_name,
    enabled: m.operation_status === "ENABLE",
    dailyBudgetEur: isDaily ? parseBudget(m.budget) : 0,
    hasDailyBudget: isDaily,
  };
}

export async function listCampaigns(): Promise<TikTokCampaign[]> {
  const { advertisers } = getEnv();
  const out: TikTokCampaign[] = [];
  for (const advertiserId of advertisers) {
    let page = 1;
    for (let safety = 0; safety < 20; safety++) {
      const url = new URL(`${TIKTOK_API}/campaign/get/`);
      url.searchParams.set("advertiser_id", advertiserId);
      url.searchParams.set("page", String(page));
      url.searchParams.set("page_size", "100");
      const json = (await ttRequest(
        "GET",
        url.toString(),
      )) as CampaignsListResponse;
      if (json.code !== 0) {
        throw new Error(
          `TikTok campaign/get ${advertiserId} code=${json.code}: ${json.message}`,
        );
      }
      const list = json.data?.list ?? [];
      for (const m of list) {
        const c = metaToCampaign(advertiserId, m);
        if (c) out.push(c);
      }
      if (list.length < 100) break;
      page += 1;
    }
  }
  return out;
}

export function findCampaignsByKeyword(
  campaigns: TikTokCampaign[],
  keyword: string,
): TikTokCampaign[] {
  const k = keyword.toLowerCase().trim();
  if (!k) return [];
  return campaigns.filter((c) => c.name.toLowerCase().includes(k));
}

// Spend pro Kampagne über ein Range. Wir nutzen denselben Endpoint wie der
// daily-Cost-Sync, aber ohne Tages-Dimension → einer Zeile pro Kampagne.
export async function getSpendByCampaign(params: {
  since: Date;
  until: Date;
}): Promise<Map<string, number>> {
  const { advertisers } = getEnv();
  const from = format(params.since, "yyyy-MM-dd");
  const to = format(params.until, "yyyy-MM-dd");
  const result = new Map<string, number>();
  for (const advertiserId of advertisers) {
    let page = 1;
    for (let safety = 0; safety < 20; safety++) {
      const json = (await ttRequest(
        "POST",
        `${TIKTOK_API}/report/integrated/get/`,
        {
          advertiser_id: advertiserId,
          report_type: "BASIC",
          data_level: "AUCTION_CAMPAIGN",
          dimensions: ["campaign_id"],
          metrics: ["spend"],
          start_date: from,
          end_date: to,
          page,
          page_size: 1000,
        },
      )) as {
        code?: number;
        message?: string;
        data?: {
          list?: {
            dimensions?: { campaign_id?: string };
            metrics?: { spend?: string };
          }[];
          page_info?: { page: number; total_page: number };
        };
      };
      if (json.code !== 0) {
        throw new Error(
          `TikTok report ${advertiserId} code=${json.code}: ${json.message}`,
        );
      }
      const list = json.data?.list ?? [];
      for (const r of list) {
        const id = r.dimensions?.campaign_id;
        if (!id) continue;
        const spend = parseBudget(r.metrics?.spend);
        result.set(id, (result.get(id) ?? 0) + spend);
      }
      const pageInfo = json.data?.page_info;
      if (!pageInfo || page >= pageInfo.total_page || list.length === 0) break;
      page += 1;
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

// ─── Schreib-Operationen ─────────────────────────────────────────────

export async function setCampaignDailyBudget(
  campaign: TikTokCampaign,
  newAmountEur: number,
): Promise<void> {
  if (!campaign.hasDailyBudget) {
    throw new Error(
      `TikTok-Kampagne ${campaign.name} ist nicht BUDGET_MODE_DAY — nicht steuerbar.`,
    );
  }
  const rounded = Math.max(0, Math.round(newAmountEur * 100) / 100);
  await ttRequest("POST", `${TIKTOK_API}/campaign/update/`, {
    advertiser_id: campaign.advertiserId,
    campaign_id: campaign.id,
    budget: rounded,
  });
  campaign.dailyBudgetEur = rounded;
}

export async function setCampaignStatus(
  campaign: TikTokCampaign,
  enabled: boolean,
): Promise<void> {
  await ttRequest("POST", `${TIKTOK_API}/campaign/status/update/`, {
    advertiser_id: campaign.advertiserId,
    campaign_ids: [campaign.id],
    operation_status: enabled ? "ENABLE" : "DISABLE",
  });
  campaign.enabled = enabled;
}
