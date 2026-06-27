import { addDays, format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { loadProductMatcher } from "@/lib/product-catalog";
import { persistUnmatched } from "@/lib/ad-spend";

// Outbrain Amplify Reporting API:
//   Auth:   OB-TOKEN-V1: <long-lived token>
//   Endpoint: https://api.outbrain.com/amplify/v0.1/reports/marketers/{id}/campaigns
//   Response: { results: [ { metadata: { id, name }, metrics: { spend, ... } } ] }
//   Tagesgranularität: das breakdown=daily-Param wird vom Campaigns-Report
//   ignoriert (es liefert immer einen Aggregat-Wert pro Kampagne für from..to).
//   Wir holen deshalb pro Tag einen eigenen Request — Antwort = Tages-Spend.
// Wir spiegeln das in dieselbe Cost-Tabelle wie Meta (kind=LEAD, product=…),
// damit das Dashboard ohne weitere Anpassung den Spend mitzählt. Note-Prefix
// "Outbrain:" trennt die Datenherkunft sauber vom Meta-Sync.

const OUTBRAIN_API = "https://api.outbrain.com/amplify/v0.1";
// Outbrain dokumentiert kein hartes Limit, ist in der Praxis aber bei ~5 req/s
// schnell mit HTTP 429 unterwegs. 500 ms hat in Tests stabil funktioniert.
const REQUEST_DELAY_MS = Number(process.env.OUTBRAIN_REQUEST_DELAY_MS ?? 500);
const MAX_429_RETRIES = 4;

type CampaignResult = {
  metadata?: { id?: string; name?: string };
  metrics?: { spend?: string | number };
};

type CampaignsResponse = {
  results?: CampaignResult[];
  totalResults?: number;
  error?: { message?: string; code?: number };
};

export type OutbrainSyncResult = {
  marketers: { id: string; rows: number }[];
  costs: number;
  matched: { campaign: string; product: string; spend: number }[];
  unmatched: { campaign: string; spend: number }[];
  errors: string[];
  // Diagnose: erste Antwort-Häppchen pro Marketer, damit man bei rows=0
  // sieht, was die API tatsächlich zurückgibt (Feldname, Pagination,
  // Endpoint-Mismatch, leerer Account, …). Nur die ersten ~800 Zeichen.
  debug?: { marketerId: string; sample: string }[];
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

// 429-aware Fetch: bei Rate-Limit-Fehlern wird mit exponentiellem Backoff
// (1s, 2s, 4s, 8s) erneut versucht. Andere HTTP-Fehler werfen sofort.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<{ res: Response; text: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await fetch(url, init);
    const text = await res.text();
    if (res.status !== 429) return { res, text };
    if (attempt === MAX_429_RETRIES) {
      lastErr = new Error(
        `HTTP 429 nach ${MAX_429_RETRIES + 1} Versuchen — Outbrain rate-limited.`,
      );
      break;
    }
    const backoffMs = 1000 * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, backoffMs));
  }
  throw lastErr;
}

async function fetchCampaignsRange(
  marketerId: string,
  token: string,
  from: string,
  to: string,
  debugSink?: (sample: string) => void,
): Promise<CampaignResult[]> {
  const url = new URL(
    `${OUTBRAIN_API}/reports/marketers/${marketerId}/campaigns`,
  );
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("includeArchivedCampaigns", "true");
  url.searchParams.set("limit", "500");

  const all: CampaignResult[] = [];
  let offset = 0;
  let firstBody = "";
  for (let safety = 0; safety < 50; safety++) {
    url.searchParams.set("offset", String(offset));
    const { res, text } = await fetchWithRetry(url.toString(), {
      headers: { "OB-TOKEN-V1": token },
      cache: "no-store",
    });
    if (!firstBody) firstBody = text;
    let json: CampaignsResponse;
    try {
      json = JSON.parse(text) as CampaignsResponse;
    } catch {
      throw new Error(
        `Outbrain-API für marketer ${marketerId} (${from}…${to}) gab kein JSON zurück: ${text.slice(0, 400)}`,
      );
    }
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `HTTP ${res.status}`;
      throw new Error(
        `Outbrain-API für marketer ${marketerId} (${from}…${to}): ${msg}`,
      );
    }
    const batch = json.results ?? [];
    all.push(...batch);
    const total = json.totalResults ?? all.length;
    offset += batch.length;
    if (batch.length === 0 || offset >= total) break;
  }
  if (all.length === 0 && debugSink && firstBody) {
    debugSink(firstBody.slice(0, 800));
  }
  return all;
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

  // Default-Lookback: 14 Tage. Per Tag = 1 Request — Outbrains Rate-Limit
  // ist strikt, ein 90-Tage-Lauf inkl. 429-Backoffs läuft schnell in 5+ Min.
  // 14 Tage × ~500-700 ms ≈ 10-20 Sek. Über OUTBRAIN_LOOKBACK_DAYS
  // (oder OUTBRAIN_SYNC_FROM für ein hartes Startdatum) anpassbar.
  const today = new Date();
  const sinceEnv = process.env.OUTBRAIN_SYNC_FROM;
  const lookbackDays = Number(process.env.OUTBRAIN_LOOKBACK_DAYS ?? 14);
  const defaultSince = addDays(today, -lookbackDays);
  const since =
    sinceEnv && /^\d{4}-\d{2}-\d{2}$/.test(sinceEnv)
      ? sinceEnv
      : format(defaultSince, "yyyy-MM-dd");
  const until = format(today, "yyyy-MM-dd");

  // Hard cap nur noch als Notnagel pro Marketer (Aggregat-Request sollte
  // <5s sein, falls Outbrain nicht zickt). Nicht mehr im Innen-Loop.
  void process.env.OUTBRAIN_MAX_SYNC_MS;

  type Insertable = {
    product: string;
    amount: number;
    occurredAt: Date;
    note: string;
  };
  const toInsert: Insertable[] = [];

  const classify = await loadProductMatcher();

  let anyMarketerSucceededFully = false;
  for (const marketerId of marketers) {
    let firstDebugSample: string | null = null;
    let totalCampaignRows = 0;
    let failedDays = 0;
    // Pro Tag genau ein Request: Outbrains breakdown=daily wird vom Campaigns-
    // Report ignoriert, also setzen wir from=to=Tag und holen damit den Tages-
    // Aggregat-Spend pro Kampagne. Bei 14 Tagen × ~500ms ≈ 7-30s, je nach
    // Rate-Limit. 429-Retries hängen im fetchWithRetry mit drin.
    let day = new Date(`${since}T00:00:00Z`);
    const end = new Date(`${until}T00:00:00Z`);
    while (day.getTime() <= end.getTime()) {
      const dayStr = format(day, "yyyy-MM-dd");
      try {
        const campaigns = await fetchCampaignsRange(
          marketerId,
          token,
          dayStr,
          dayStr,
          (sample) => {
            if (!firstDebugSample) firstDebugSample = sample;
          },
        );
        totalCampaignRows += campaigns.length;
        for (const c of campaigns) {
          const name = c.metadata?.name?.trim();
          if (!name) continue;
          const spend = parseSpend(c.metrics?.spend);
          if (spend <= 0) continue;
          const product = classify(name);
          if (!product) {
            result.unmatched.push({ campaign: name, spend });
            continue;
          }
          toInsert.push({
            product,
            amount: spend,
            occurredAt: dayAtNoonUtc(dayStr),
            note: `Outbrain: ${name} (${dayStr}) [marketer_${marketerId}]`,
          });
        }
      } catch (err) {
        failedDays += 1;
        result.errors.push(
          `marketer ${marketerId} (${dayStr}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      day = addDays(day, 1);
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }
    if (failedDays === 0) anyMarketerSucceededFully = true;
    result.marketers.push({ id: marketerId, rows: totalCampaignRows });
    if (totalCampaignRows === 0 && firstDebugSample) {
      result.debug = result.debug ?? [];
      result.debug.push({ marketerId, sample: firstDebugSample });
    }
  }

  // Persistenz:
  //   • Wenn mindestens ein Marketer komplett fehlerfrei durchlief: alle
  //     bestehenden Outbrain-Cost-Zeilen löschen und mit toInsert ersetzen
  //     (idempotent, spiegelt Korrekturen aus Outbrain).
  //   • Wenn alle Marketer mind. einen Fehler hatten: nicht löschen (sonst
  //     wäre ein API-Aussetzer = leeres Dashboard). Stattdessen toInsert per
  //     upsert pro (Tag × Kampagne × Marketer) einspielen — die erfolgreich
  //     geholten Tage werden so trotzdem aktualisiert.
  if (anyMarketerSucceededFully) {
    await prisma.cost.deleteMany({
      where: { kind: "LEAD", note: { startsWith: "Outbrain:" } },
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
    // Partial — die erfolgreichen Tage nachziehen, alte Daten der gleichen
    // Tage löschen (per note-Match — Tag steht in der Note), Rest bleibt.
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

  // Matched-Zusammenfassung pro Kampagne — Note-Format jetzt
  // "Outbrain: <name> (<since>…<until>) [marketer_<id>]".
  const summary = new Map<string, { product: string; spend: number }>();
  for (const row of toInsert) {
    const m = /^Outbrain:\s+(.+?)\s+\(/.exec(row.note);
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

  if (result.errors.length === 0) {
    await persistUnmatched("Outbrain", result.unmatched);
  }

  return result;
}
