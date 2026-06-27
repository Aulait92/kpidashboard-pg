// Google-Ads-Cost-Sync für KPI-Dashboard.
//
// Lädt Tages-Spend pro Kampagne aus der Google Ads API und schreibt Cost-
// Zeilen mit Note-Prefix "Google:" — analog zu Meta/Outbrain/TikTok.
//
// ENV:
//   GOOGLE_ADS_*               (siehe google-ads.ts)
//   GOOGLE_ADS_LOOKBACK_DAYS   default 30 (Google-Reporting ist schnell,
//                              Spend ist meist ≤ 1h nach Schaltung sichtbar)
//   GOOGLE_ADS_SYNC_FROM       optional hartes Startdatum YYYY-MM-DD

import { addDays } from "date-fns";
import { getDailySpendByCampaign } from "@/lib/google-ads";
import { prisma } from "@/lib/prisma";
import { loadProductMatcher } from "@/lib/product-catalog";

export type GoogleSyncResult = {
  customers: { rows: number };
  costs: number;
  matched: { campaign: string; product: string; spend: number }[];
  unmatched: { campaign: string; spend: number }[];
  errors: string[];
};

function dayAtNoonUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Ungültiges Google-Datum: ${dateStr}`);
  }
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export async function syncGoogleAds(): Promise<GoogleSyncResult> {
  const result: GoogleSyncResult = {
    customers: { rows: 0 },
    costs: 0,
    matched: [],
    unmatched: [],
    errors: [],
  };

  const today = new Date();
  const sinceEnv = process.env.GOOGLE_ADS_SYNC_FROM;
  const lookbackDays = Number(process.env.GOOGLE_ADS_LOOKBACK_DAYS ?? 30);
  const since =
    sinceEnv && /^\d{4}-\d{2}-\d{2}$/.test(sinceEnv)
      ? new Date(`${sinceEnv}T00:00:00Z`)
      : addDays(today, -lookbackDays);

  type Insertable = {
    product: string;
    amount: number;
    occurredAt: Date;
    note: string;
  };
  const toInsert: Insertable[] = [];

  const classify = await loadProductMatcher();

  let succeeded = false;
  try {
    const perCampaign = await getDailySpendByCampaign({ since, until: today });
    let totalRows = 0;
    for (const [campaignId, entry] of perCampaign) {
      const name = entry.campaignName || `Kampagne ${campaignId}`;
      const product = classify(name);
      for (const [day, spend] of entry.days) {
        totalRows += 1;
        if (spend <= 0) continue;
        if (!product) {
          result.unmatched.push({ campaign: name, spend });
          continue;
        }
        toInsert.push({
          product,
          amount: spend,
          occurredAt: dayAtNoonUtc(day),
          note: `Google: ${name} (${day}) [cid_${campaignId}]`,
        });
      }
    }
    result.customers.rows = totalRows;
    succeeded = true;
  } catch (err) {
    result.errors.push(
      err instanceof Error ? err.message : String(err),
    );
  }

  // Persistenz: bei sauberem Lauf alle Google-Cost-Zeilen ersetzen, sonst
  // per-Note-Upsert (überlebt Teilfehler).
  if (succeeded && result.errors.length === 0) {
    await prisma.cost.deleteMany({
      where: { kind: "LEAD", note: { startsWith: "Google:" } },
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

  // Matched-Summary pro Kampagne (statt N Tages-Einträgen).
  const summary = new Map<string, { product: string; spend: number }>();
  for (const row of toInsert) {
    const m = /^Google:\s+(.+?)\s+\(/.exec(row.note);
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
