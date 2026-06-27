import { addDays, format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { classifyCampaignProduct } from "@/lib/products";
import { loadProductMatcher } from "@/lib/product-catalog";
import { persistUnmatched } from "@/lib/ad-spend";

const META_API_VERSION = "v23.0";
const META_GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;

type MetaInsightsRow = {
  campaign_name?: string;
  spend?: string;
  date_start?: string;
  date_stop?: string;
};

type MetaError = {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  is_transient?: boolean;
};

type MetaInsightsResponse = {
  data?: MetaInsightsRow[];
  paging?: { next?: string };
  error?: MetaError;
};

// Meta-Fehlercodes, die Rate-Limits / transiente Störungen anzeigen und einen
// Retry rechtfertigen (App-/User-/Account-Level-Limits + Insights-Limits).
const META_RETRYABLE_CODES = new Set([
  1, 2, 4, 17, 32, 341, 613, 80000, 80001, 80002, 80003, 80004,
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableMeta(status: number, err?: MetaError): boolean {
  if (status === 429 || status === 500 || status === 502 || status === 503)
    return true;
  if (err?.is_transient) return true;
  if (err?.code != null && META_RETRYABLE_CODES.has(err.code)) return true;
  return false;
}

// Holt eine Insights-Seite mit Retry+Backoff bei Rate-Limit/transienten
// Fehlern. Bei 8 Ad-Accounts × vielen 90-Tage-Fenstern läuft der Sync sonst
// schnell in Metas Request-Limits (#17/#80000…) — ein einzelner gedrosselter
// Request würde den ganzen Account fallen lassen. Nicht-retrybare Fehler
// (z. B. fehlende Permission) brechen sofort ab.
async function fetchMetaPage(
  pageUrl: string,
  accountId: string,
  since: string,
  until: string,
): Promise<MetaInsightsResponse> {
  const MAX_RETRIES = 5;
  let lastErr = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponentielles Backoff: 2s, 4s, 8s, 16s, 32s.
      await sleep(Math.min(32_000, 2_000 * 2 ** (attempt - 1)));
    }
    const res = await fetch(pageUrl, { cache: "no-store" });
    let json: MetaInsightsResponse;
    try {
      json = (await res.json()) as MetaInsightsResponse;
    } catch {
      json = {};
    }
    if (res.ok && !json.error) return json;
    lastErr = json.error?.message ?? `HTTP ${res.status}`;
    if (!isRetryableMeta(res.status, json.error)) break;
  }
  throw new Error(`Meta-API für act_${accountId} (${since}…${until}): ${lastErr}`);
}

export type MetaProduct = "Wechsel" | "Neugeschäft" | "Kinderwunsch";

export type MetaSyncResult = {
  accounts: { id: string; rows: number }[];
  costs: number;
  // product = kanonischer Produkt-Key (Legacy-Sparte oder neuer Produktname).
  matched: { campaign: string; product: string; spend: number }[];
  unmatched: { campaign: string; spend: number }[];
  errors: string[];
};

function getEnv() {
  const token = process.env.META_ACCESS_TOKEN;
  const accountsRaw = process.env.META_AD_ACCOUNT_IDS;
  if (!token || !accountsRaw) {
    throw new Error(
      "META_ACCESS_TOKEN und META_AD_ACCOUNT_IDS müssen gesetzt sein.",
    );
  }
  const accounts = accountsRaw
    .split(",")
    .map((s) => s.trim().replace(/^act_/, ""))
    .filter((s) => s.length > 0);
  if (accounts.length === 0) {
    throw new Error("META_AD_ACCOUNT_IDS ist leer.");
  }
  return { token, accounts };
}

// Legacy-Keyword-Klassifizierung auf die drei Altsparten. Die Logik liegt
// jetzt zentral (und client-bundle-tauglich) in products.ts; hier nur noch
// der typisierte Re-Export für bestehende Aufrufer. Neue Produkte erkennt der
// DB-gestützte loadProductMatcher() (siehe syncMeta).
export function classifyProduct(campaignName: string): MetaProduct | null {
  return classifyCampaignProduct(campaignName) as MetaProduct | null;
}

function dayAtNoonUtc(dateStart: string): Date {
  // Meta liefert Datum als "YYYY-MM-DD". Bei time_increment=1 ist
  // date_start = der konkrete Tag. Noon-UTC vermeidet Tag-Drift durch
  // Zeitzonen-Offsets bei der Anzeige.
  const [y, m, d] = dateStart.split("-").map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Ungültiges Datum von Meta: ${dateStart}`);
  }
  return new Date(Date.UTC(y, m - 1, d, 12));
}

async function fetchInsightsWindow(
  accountId: string,
  token: string,
  since: string,
  until: string,
): Promise<MetaInsightsRow[]> {
  const rows: MetaInsightsRow[] = [];
  const url = new URL(`${META_GRAPH}/act_${accountId}/insights`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("level", "campaign");
  url.searchParams.set("fields", "campaign_name,spend,date_start,date_stop");
  // Eine Zeile pro Tag pro Kampagne — damit Tagesfilter im Dashboard den
  // realen Tagesspend zeigen statt eines aufgeteilten Monatsdurchschnitts.
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("time_range", JSON.stringify({ since, until }));
  url.searchParams.set("limit", "500");

  let nextUrl: string | null = url.toString();
  while (nextUrl) {
    const json = await fetchMetaPage(nextUrl, accountId, since, until);
    if (json.data) rows.push(...json.data);
    nextUrl = json.paging?.next ?? null;
  }
  return rows;
}

// Meta-Insights mit time_increment=1 sind faktisch auf max. ~90 Tage pro
// Request limitiert (über längere Zeiträume bricht die API still ab oder
// liefert leere Antworten). Größere Zeiträume zerlegen wir in 90-Tage-
// Fenster und fügen die Resultate zusammen.
async function fetchInsights(
  accountId: string,
  token: string,
  since: string,
  until: string,
): Promise<MetaInsightsRow[]> {
  const WINDOW_DAYS = 90;
  const rows: MetaInsightsRow[] = [];
  let chunkStart = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  while (chunkStart.getTime() <= end.getTime()) {
    const chunkEndCandidate = addDays(chunkStart, WINDOW_DAYS - 1);
    const chunkEnd =
      chunkEndCandidate.getTime() < end.getTime() ? chunkEndCandidate : end;
    const chunkSinceStr = format(chunkStart, "yyyy-MM-dd");
    const chunkUntilStr = format(chunkEnd, "yyyy-MM-dd");
    const chunkRows = await fetchInsightsWindow(
      accountId,
      token,
      chunkSinceStr,
      chunkUntilStr,
    );
    rows.push(...chunkRows);
    chunkStart = addDays(chunkEnd, 1);
  }
  return rows;
}

export async function syncMeta(): Promise<MetaSyncResult> {
  const { token, accounts } = getEnv();
  const result: MetaSyncResult = {
    accounts: [],
    costs: 0,
    matched: [],
    unmatched: [],
    errors: [],
  };

  // Default: 24 Monate zurück bis heute. Über META_SYNC_FROM überschreibbar.
  const today = new Date();
  const defaultSince = new Date(
    Date.UTC(today.getUTCFullYear() - 2, today.getUTCMonth(), 1),
  );
  const sinceEnv = process.env.META_SYNC_FROM;
  const since = (sinceEnv && /^\d{4}-\d{2}-\d{2}$/.test(sinceEnv)
    ? sinceEnv
    : defaultSince.toISOString().slice(0, 10));
  const until = today.toISOString().slice(0, 10);

  type Insertable = {
    product: string;
    amount: number;
    occurredAt: Date;
    note: string;
  };
  const toInsert: Insertable[] = [];

  // DB-gestützter Klassifizierer: Legacy-Sparten per Keyword, neue Produkte
  // per Name/Slug-Match gegen die Produkte-Tabelle.
  const classify = await loadProductMatcher();

  for (const accountId of accounts) {
    try {
      const rows = await fetchInsights(accountId, token, since, until);
      result.accounts.push({ id: accountId, rows: rows.length });

      for (const row of rows) {
        const name = row.campaign_name?.trim();
        const spendStr = row.spend;
        const startStr = row.date_start;
        if (!name || !spendStr || !startStr) continue;

        const amount = Number.parseFloat(spendStr);
        if (!Number.isFinite(amount) || amount <= 0) continue;

        const product = classify(name);
        const occurredAt = dayAtNoonUtc(startStr);

        if (!product) {
          // Unmatched-Kampagnen werden nur für Transparenz im SyncResult
          // gesammelt und nicht in die Cost-Tabelle geschrieben — sie sollen
          // weder im "Alle"-Filter noch unter einem Produkt-Filter in den
          // Lead-Kosten auftauchen.
          result.unmatched.push({ campaign: name, spend: amount });
          continue;
        }

        toInsert.push({
          product,
          amount,
          occurredAt,
          note: `Meta: ${name} (${startStr}) [act_${accountId}]`,
        });
      }
    } catch (err) {
      result.errors.push(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Per-Account-Replace (resilient): nur die Konten ersetzen, die sauber
  // gefetcht wurden. Ein einzelnes fehlerhaftes Konto (Token-Scope, Rate-Limit,
  // fehlende Permission) blockiert damit NICHT mehr den gesamten Meta-Channel —
  // die übrigen Konten werden trotzdem aktualisiert. Fehlerhafte Konten behalten
  // ihr altes Datenbild. Frühere Logik war all-or-nothing: ein Fehler ließ ALLE
  // Konten ungeschrieben (Kampagnen verschwanden komplett).
  const okAccountIds = result.accounts.map((a) => a.id);
  if (okAccountIds.length > 0) {
    const inserts = toInsert.map((row) => ({
      kind: "LEAD" as const,
      product: row.product,
      amount: row.amount,
      occurredAt: row.occurredAt,
      note: row.note,
    }));
    // Pro erfolgreichem Konto die alten Zeilen löschen (Note enthält
    // "[act_<id>]"), danach die frischen Zeilen in einem Rutsch einfügen.
    await prisma.$transaction([
      ...okAccountIds.map((id) =>
        prisma.cost.deleteMany({
          where: { kind: "LEAD", note: { contains: `[act_${id}]` } },
        }),
      ),
      ...(inserts.length > 0
        ? [prisma.cost.createMany({ data: inserts })]
        : []),
    ]);
    result.costs = inserts.length;
    // Unmatched-Transparenz aktualisieren, sobald mindestens ein Konto lief.
    await persistUnmatched("Meta", result.unmatched);
  }
  // Wenn KEIN Konto sauber lief: altes Datenbild komplett unangetastet lassen.

  // Matched-Summe je Kampagne (statt N Tagessummen, die das SyncResult sonst
  // vollmüllen würden). Kampagnenname kommt aus der note: "Meta: <name> (...)".
  const summary = new Map<string, { product: string; spend: number }>();
  for (const row of toInsert) {
    const m = /^Meta:\s+(.+?)\s+\(\d{4}-\d{2}-\d{2}\)/.exec(row.note);
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
