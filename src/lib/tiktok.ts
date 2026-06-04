// TikTok Marketing API — Cost-Sync für KPI-Dashboard.
//
// ENV:
//   TIKTOK_ACCESS_TOKEN     — long-lived Access-Token
//   TIKTOK_ADVERTISER_IDS   — kommagetrennt, alle Advertiser-Accounts
//   TIKTOK_SYNC_FROM        — optional, hartes Startdatum YYYY-MM-DD
//   TIKTOK_LOOKBACK_DAYS    — default 14
//
// Reporting-Endpoint liefert Tagesspend pro Kampagne via
//   POST /report/integrated/get/  mit time_granularity=STAT_TIME_DAY.
// Stat-Delay liegt bei TikTok bei ~1-3h.

import { addDays, format } from "date-fns";
import { classifyProduct, type MetaProduct } from "@/lib/meta";
import { prisma } from "@/lib/prisma";

const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";
const REQUEST_DELAY_MS = Number(process.env.TIKTOK_REQUEST_DELAY_MS ?? 300);

type TikTokCampaignReportRow = {
  metrics?: { spend?: string };
  dimensions?: { campaign_id?: string; stat_time_day?: string };
};

type TikTokReportResponse = {
  code?: number;
  message?: string;
  data?: {
    list?: TikTokCampaignReportRow[];
    page_info?: { page: number; total_page: number; total_number: number };
  };
};

type TikTokCampaign = {
  campaign_id?: string;
  campaign_name?: string;
};

type TikTokCampaignListResponse = {
  code?: number;
  message?: string;
  data?: { list?: TikTokCampaign[] };
};

export type TikTokSyncResult = {
  advertisers: { id: string; rows: number }[];
  costs: number;
  matched: { campaign: string; product: MetaProduct; spend: number }[];
  unmatched: { campaign: string; spend: number }[];
  errors: string[];
  debug?: { advertiserId: string; sample: string }[];
};

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

function dayAtNoonUtc(dateStr: string): Date {
  // TikTok liefert stat_time_day im Format "YYYY-MM-DD HH:MM:SS" oder
  // "YYYY-MM-DD". Wir nehmen das Datum vor dem ersten Leerzeichen.
  const datePart = dateStr.split(/[\sT]/)[0];
  const [y, m, d] = datePart.split("-").map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Ungültiges TikTok-Datum: ${dateStr}`);
  }
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function parseSpend(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function ttFetch(url: string, init: RequestInit): Promise<unknown> {
  const { token } = getEnv();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Access-Token": token,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`TikTok ${url} ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as unknown;
}

// Holt alle Kampagnen-Namen für einen Advertiser, damit wir campaign_id →
// campaign_name auflösen können (Reports liefern nur die IDs).
async function fetchCampaignNames(
  advertiserId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 1;
  for (let safety = 0; safety < 20; safety++) {
    const url = new URL(`${TIKTOK_API}/campaign/get/`);
    url.searchParams.set("advertiser_id", advertiserId);
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", "100");
    const json = (await ttFetch(url.toString(), {
      method: "GET",
    })) as TikTokCampaignListResponse;
    if (json.code !== 0) {
      throw new Error(`TikTok campaign/get ${json.code}: ${json.message}`);
    }
    const list = json.data?.list ?? [];
    for (const c of list) {
      if (c.campaign_id && c.campaign_name) {
        map.set(c.campaign_id, c.campaign_name);
      }
    }
    if (list.length < 100) break;
    page += 1;
  }
  return map;
}

async function fetchCampaignSpendForRange(
  advertiserId: string,
  from: string,
  to: string,
  debugSink?: (sample: string) => void,
): Promise<TikTokCampaignReportRow[]> {
  const url = `${TIKTOK_API}/report/integrated/get/`;
  const body = {
    advertiser_id: advertiserId,
    report_type: "BASIC",
    data_level: "AUCTION_CAMPAIGN",
    dimensions: ["campaign_id", "stat_time_day"],
    metrics: ["spend"],
    start_date: from,
    end_date: to,
    page_size: 1000,
  };

  const rows: TikTokCampaignReportRow[] = [];
  let page = 1;
  let firstBody = "";
  for (let safety = 0; safety < 30; safety++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Access-Token": getEnv().token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, page }),
      cache: "no-store",
    });
    const text = await res.text();
    if (!firstBody) firstBody = text;
    if (!res.ok) {
      throw new Error(
        `TikTok report ${advertiserId} (${from}…${to}) ${res.status}: ${text.slice(0, 400)}`,
      );
    }
    let json: TikTokReportResponse;
    try {
      json = JSON.parse(text) as TikTokReportResponse;
    } catch {
      throw new Error(
        `TikTok report ${advertiserId} gab kein JSON zurück: ${text.slice(0, 400)}`,
      );
    }
    if (json.code !== 0) {
      throw new Error(
        `TikTok report ${advertiserId} code=${json.code}: ${json.message}`,
      );
    }
    const list = json.data?.list ?? [];
    rows.push(...list);
    const pageInfo = json.data?.page_info;
    if (!pageInfo || page >= pageInfo.total_page || list.length === 0) break;
    page += 1;
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }
  if (rows.length === 0 && debugSink && firstBody) {
    debugSink(firstBody.slice(0, 800));
  }
  return rows;
}

export async function syncTikTok(): Promise<TikTokSyncResult> {
  const { advertisers } = getEnv();
  const result: TikTokSyncResult = {
    advertisers: [],
    costs: 0,
    matched: [],
    unmatched: [],
    errors: [],
  };

  // Lookback-Default 14 Tage. TikTok-Reporting hat ~1-3h Verzögerung;
  // 14 Tage geben uns frische Daten plus etwas Historie. Über
  // TIKTOK_LOOKBACK_DAYS oder TIKTOK_SYNC_FROM überschreibbar.
  const today = new Date();
  const sinceEnv = process.env.TIKTOK_SYNC_FROM;
  const lookbackDays = Number(process.env.TIKTOK_LOOKBACK_DAYS ?? 14);
  const defaultSince = addDays(today, -lookbackDays);
  const since =
    sinceEnv && /^\d{4}-\d{2}-\d{2}$/.test(sinceEnv)
      ? sinceEnv
      : format(defaultSince, "yyyy-MM-dd");
  const until = format(today, "yyyy-MM-dd");

  type Insertable = {
    product: MetaProduct;
    amount: number;
    occurredAt: Date;
    note: string;
  };
  const toInsert: Insertable[] = [];

  let anyAdvertiserSucceededFully = false;
  for (const advertiserId of advertisers) {
    let totalRows = 0;
    let failed = false;
    let firstDebugSample: string | null = null;
    try {
      const nameMap = await fetchCampaignNames(advertiserId);
      const rows = await fetchCampaignSpendForRange(
        advertiserId,
        since,
        until,
        (sample) => {
          if (!firstDebugSample) firstDebugSample = sample;
        },
      );
      totalRows = rows.length;
      for (const r of rows) {
        const campaignId = r.dimensions?.campaign_id;
        const day = r.dimensions?.stat_time_day;
        const spend = parseSpend(r.metrics?.spend);
        if (!campaignId || !day || spend <= 0) continue;
        const name = nameMap.get(campaignId) ?? `Kampagne ${campaignId}`;
        const product = classifyProduct(name);
        if (!product) {
          result.unmatched.push({ campaign: name, spend });
          continue;
        }
        toInsert.push({
          product,
          amount: spend,
          occurredAt: dayAtNoonUtc(day),
          note: `TikTok: ${name} (${day.split(/[\sT]/)[0]}) [adv_${advertiserId}]`,
        });
      }
    } catch (err) {
      failed = true;
      result.errors.push(
        `advertiser ${advertiserId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!failed) anyAdvertiserSucceededFully = true;
    result.advertisers.push({ id: advertiserId, rows: totalRows });
    if (totalRows === 0 && firstDebugSample) {
      result.debug = result.debug ?? [];
      result.debug.push({ advertiserId, sample: firstDebugSample });
    }
  }

  // Persistenz: bei vollständig fehlerfreiem Lauf alle TikTok-Cost-Zeilen
  // löschen + neu anlegen. Bei Partial: pro Insert ein deleteMany auf die
  // exakte Note + create — so überleben erfolgreiche Tage einen Teilfehler.
  if (anyAdvertiserSucceededFully && result.errors.length === 0) {
    await prisma.cost.deleteMany({
      where: { kind: "LEAD", note: { startsWith: "TikTok:" } },
    });
    if (toInsert.length > 0) {
      await prisma.cost.createMany({
        data: toInsert.map((row) => ({
          kind: "LEAD" as const,
          product: row.product,
          amount: row.amount,
          occurredAt: row.occurredAt,
          note: row.note,
        })),
      });
    }
    result.costs = toInsert.length;
  } else if (toInsert.length > 0) {
    for (const row of toInsert) {
      await prisma.cost.deleteMany({
        where: { kind: "LEAD", note: row.note },
      });
      await prisma.cost.create({
        data: {
          kind: "LEAD" as const,
          product: row.product,
          amount: row.amount,
          occurredAt: row.occurredAt,
          note: row.note,
        },
      });
    }
    result.costs = toInsert.length;
  }

  // Matched-Summary pro Kampagne (statt N Tagessummen).
  const summary = new Map<string, { product: MetaProduct; spend: number }>();
  for (const row of toInsert) {
    const m = /^TikTok:\s+(.+?)\s+\(/.exec(row.note);
    const campaign = m ? m[1] : row.note;
    const key = `${row.product}|${campaign}`;
    const prev = summary.get(key);
    if (prev) prev.spend += row.amount;
    else summary.set(key, { product: row.product, spend: row.amount });
  }
  for (const [key, val] of summary) {
    const campaign = key.split("|").slice(1).join("|");
    result.matched.push({ campaign, product: val.product, spend: val.spend });
  }

  return result;
}
