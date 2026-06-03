import { addDays, format } from "date-fns";
import { classifyProduct, type MetaProduct } from "@/lib/meta";
import { prisma } from "@/lib/prisma";

// Outbrain Amplify Reporting API:
//   Auth:   OB-TOKEN-V1: <long-lived token>
//   Endpoint: https://api.outbrain.com/amplify/v0.1/reports/marketers/{id}/campaigns
//   Tagesspend kommt per breakdown=daily → metricsByBreakdown[].metrics.spend
// Wir spiegeln das in dieselbe Cost-Tabelle wie Meta (kind=LEAD, product=…),
// damit das Dashboard ohne weitere Anpassung den Spend mitzählt. Note-Prefix
// "Outbrain:" trennt die Datenherkunft sauber vom Meta-Sync.

const OUTBRAIN_API = "https://api.outbrain.com/amplify/v0.1";

type CampaignResult = {
  campaign?: { id?: string; name?: string };
  metrics?: { spend?: string | number };
  metricsByBreakdown?: {
    fromDate?: string;
    metrics?: { spend?: string | number };
  }[];
};

type CampaignsResponse = {
  campaignResults?: CampaignResult[];
  totalResults?: number;
  error?: { message?: string; code?: number };
};

export type OutbrainSyncResult = {
  marketers: { id: string; rows: number }[];
  costs: number;
  matched: { campaign: string; product: MetaProduct; spend: number }[];
  unmatched: { campaign: string; spend: number }[];
  errors: string[];
};

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
  if (marketers.length === 0) {
    throw new Error("OUTBRAIN_MARKETER_IDS ist leer.");
  }
  return { token, marketers };
}

function dayAtNoonUtc(dateStart: string): Date {
  const [y, m, d] = dateStart.split("-").map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Ungültiges Datum von Outbrain: ${dateStart}`);
  }
  return new Date(Date.UTC(y, m - 1, d, 12));
}

async function fetchCampaignsWindow(
  marketerId: string,
  token: string,
  from: string,
  to: string,
): Promise<CampaignResult[]> {
  const url = new URL(
    `${OUTBRAIN_API}/reports/marketers/${marketerId}/campaigns`,
  );
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("breakdown", "daily");
  url.searchParams.set("includeArchivedCampaigns", "true");
  url.searchParams.set("limit", "500");

  const all: CampaignResult[] = [];
  let offset = 0;
  // Outbrain paginiert per offset/limit. Wir bleiben bis totalResults erreicht.
  // Hard cap als Schutz gegen Endlosschleifen.
  for (let safety = 0; safety < 50; safety++) {
    url.searchParams.set("offset", String(offset));
    const res = await fetch(url.toString(), {
      headers: { "OB-TOKEN-V1": token },
      cache: "no-store",
    });
    const json = (await res.json()) as CampaignsResponse;
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `HTTP ${res.status}`;
      throw new Error(
        `Outbrain-API für marketer ${marketerId} (${from}…${to}): ${msg}`,
      );
    }
    const batch = json.campaignResults ?? [];
    all.push(...batch);
    const total = json.totalResults ?? all.length;
    offset += batch.length;
    if (batch.length === 0 || offset >= total) break;
  }
  return all;
}

// Outbrain liefert breakdown=daily zuverlässig bis ~3 Monate pro Request,
// danach wird die Antwort gekürzt. Daher in 90-Tage-Fenstern fetchen.
async function fetchCampaigns(
  marketerId: string,
  token: string,
  since: string,
  until: string,
): Promise<CampaignResult[]> {
  const WINDOW_DAYS = 90;
  const out: CampaignResult[] = [];
  let chunkStart = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  while (chunkStart.getTime() <= end.getTime()) {
    const chunkEndCandidate = addDays(chunkStart, WINDOW_DAYS - 1);
    const chunkEnd =
      chunkEndCandidate.getTime() < end.getTime() ? chunkEndCandidate : end;
    const chunk = await fetchCampaignsWindow(
      marketerId,
      token,
      format(chunkStart, "yyyy-MM-dd"),
      format(chunkEnd, "yyyy-MM-dd"),
    );
    out.push(...chunk);
    chunkStart = addDays(chunkEnd, 1);
  }
  return out;
}

function parseSpend(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function syncOutbrain(): Promise<OutbrainSyncResult> {
  const { token, marketers } = getEnv();
  const result: OutbrainSyncResult = {
    marketers: [],
    costs: 0,
    matched: [],
    unmatched: [],
    errors: [],
  };

  // Default: 24 Monate zurück bis heute. Über OUTBRAIN_SYNC_FROM überschreibbar.
  const today = new Date();
  const defaultSince = new Date(
    Date.UTC(today.getUTCFullYear() - 2, today.getUTCMonth(), 1),
  );
  const sinceEnv = process.env.OUTBRAIN_SYNC_FROM;
  const since =
    sinceEnv && /^\d{4}-\d{2}-\d{2}$/.test(sinceEnv)
      ? sinceEnv
      : defaultSince.toISOString().slice(0, 10);
  const until = today.toISOString().slice(0, 10);

  type Insertable = {
    product: MetaProduct;
    amount: number;
    occurredAt: Date;
    note: string;
  };
  const toInsert: Insertable[] = [];

  for (const marketerId of marketers) {
    try {
      const campaigns = await fetchCampaigns(marketerId, token, since, until);
      result.marketers.push({ id: marketerId, rows: campaigns.length });

      for (const c of campaigns) {
        const name = c.campaign?.name?.trim();
        if (!name) continue;
        const product = classifyProduct(name);
        const breakdown = c.metricsByBreakdown ?? [];

        if (!product) {
          // Unmatched: Kampagne taucht weder als Produkt-Spend noch im
          // "Alle"-Filter auf — nur als Hinweis im SyncResult.
          const totalSpend = breakdown.reduce(
            (s, b) => s + parseSpend(b.metrics?.spend),
            parseSpend(c.metrics?.spend) > 0 && breakdown.length === 0
              ? parseSpend(c.metrics?.spend)
              : 0,
          );
          if (totalSpend > 0) {
            result.unmatched.push({ campaign: name, spend: totalSpend });
          }
          continue;
        }

        for (const b of breakdown) {
          const day = b.fromDate;
          const amount = parseSpend(b.metrics?.spend);
          if (!day || amount <= 0) continue;
          toInsert.push({
            product,
            amount,
            occurredAt: dayAtNoonUtc(day),
            note: `Outbrain: ${name} (${day}) [marketer_${marketerId}]`,
          });
        }
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Defensiv: nur löschen, wenn der Fetch fehlerfrei durchlief. Bei Errors
  // bleiben die bestehenden Outbrain-Cost-Zeilen stehen, damit ein API-
  // Aussetzer nicht den Spend im Dashboard wegradiert (siehe Meta-Sync).
  const canReplace = result.errors.length === 0 && toInsert.length > 0;
  if (canReplace) {
    await prisma.cost.deleteMany({
      where: { kind: "LEAD", note: { startsWith: "Outbrain:" } },
    });
    await prisma.cost.createMany({
      data: toInsert.map((row) => ({
        kind: "LEAD" as const,
        product: row.product,
        amount: row.amount,
        occurredAt: row.occurredAt,
        note: row.note,
      })),
    });
    result.costs = toInsert.length;
  } else if (result.errors.length === 0 && toInsert.length === 0) {
    await prisma.cost.deleteMany({
      where: { kind: "LEAD", note: { startsWith: "Outbrain:" } },
    });
  }

  // Matched-Zusammenfassung pro Kampagne (statt N Tagessummen).
  const summary = new Map<string, { product: MetaProduct; spend: number }>();
  for (const row of toInsert) {
    const m = /^Outbrain:\s+(.+?)\s+\(\d{4}-\d{2}-\d{2}\)/.exec(row.note);
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
