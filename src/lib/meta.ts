import { addDays, format } from "date-fns";
import { prisma } from "@/lib/prisma";

const META_API_VERSION = "v23.0";
const META_GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;

type MetaInsightsRow = {
  campaign_name?: string;
  spend?: string;
  date_start?: string;
  date_stop?: string;
};

type MetaInsightsResponse = {
  data?: MetaInsightsRow[];
  paging?: { next?: string };
  error?: { message: string; type?: string; code?: number };
};

export type MetaProduct = "Wechsel" | "Neugeschäft" | "Kinderwunsch";

export type MetaSyncResult = {
  accounts: { id: string; rows: number }[];
  costs: number;
  matched: { campaign: string; product: MetaProduct; spend: number }[];
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

export function classifyProduct(campaignName: string): MetaProduct | null {
  const n = campaignName.toLowerCase();
  // Kinderwunsch zuerst — eigenes Vertical, klar über das Keyword erkennbar.
  if (n.includes("kinderwunsch") || n.includes("kiwu")) return "Kinderwunsch";
  // Reihenfolge wichtig: "Neugeschäft" zuerst, falls "wechsel" als Substring
  // in einem Neugeschäft-Namen vorkäme.
  if (n.includes("neugeschäft") || n.includes("neugeschaeft") || n.includes("neuvertrag")) {
    return "Neugeschäft";
  }
  if (n.includes("wechsel")) return "Wechsel";
  return null;
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
    const res = await fetch(nextUrl, { cache: "no-store" });
    const json = (await res.json()) as MetaInsightsResponse;
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `HTTP ${res.status}`;
      throw new Error(
        `Meta-API für act_${accountId} (${since}…${until}): ${msg}`,
      );
    }
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
    product: MetaProduct;
    amount: number;
    occurredAt: Date;
    note: string;
  };
  const toInsert: Insertable[] = [];

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

        const product = classifyProduct(name);
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

  // Defensiv: nur löschen, wenn der Fetch komplett durchlief UND Daten
  // vorliegen. Sonst hätte ein API-Fehler das alte Datenbild wegradiert und
  // wir hätten weder neue noch alte Werte (das ist genau einmal passiert).
  const canReplace = result.errors.length === 0 && toInsert.length > 0;
  if (canReplace) {
    await prisma.cost.deleteMany({
      where: { kind: "LEAD", note: { startsWith: "Meta:" } },
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
    // Sauberer Lauf, aber Meta hat 0 Zeilen geliefert → vermutlich kein Spend.
    // Trotzdem alte Meta-Daten weg, damit veraltete Zahlen nicht stehenbleiben.
    await prisma.cost.deleteMany({
      where: { kind: "LEAD", note: { startsWith: "Meta:" } },
    });
  }
  // Bei Errors lassen wir die bestehenden Cost-Zeilen unangetastet.

  // Matched-Summe je Kampagne (statt N Tagessummen, die das SyncResult sonst
  // vollmüllen würden). Kampagnenname kommt aus der note: "Meta: <name> (...)".
  const summary = new Map<string, { product: MetaProduct; spend: number }>();
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
