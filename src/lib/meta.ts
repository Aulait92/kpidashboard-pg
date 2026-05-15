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

export type MetaProduct = "Wechsel" | "Neugeschäft";

export type MetaSyncResult = {
  accounts: { id: string; rows: number }[];
  costs: number;
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

function classifyProduct(campaignName: string): MetaProduct | null {
  const n = campaignName.toLowerCase();
  // Reihenfolge wichtig: "Neugeschäft" zuerst, falls "wechsel" als Substring
  // in einem Neugeschäft-Namen vorkäme.
  if (n.includes("neugeschäft") || n.includes("neugeschaeft") || n.includes("neuvertrag")) {
    return "Neugeschäft";
  }
  if (n.includes("wechsel")) return "Wechsel";
  return null;
}

function monthStart(dateStart: string): Date {
  // Meta liefert Datum als "YYYY-MM-DD". Bei time_increment=monthly ist
  // date_start der erste Tag des Monats.
  const [y, m] = dateStart.split("-").map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    throw new Error(`Ungültiges Datum von Meta: ${dateStart}`);
  }
  return new Date(Date.UTC(y, m - 1, 1, 12));
}

async function fetchInsights(
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
  url.searchParams.set("time_increment", "monthly");
  url.searchParams.set(
    "time_range",
    JSON.stringify({ since, until }),
  );
  url.searchParams.set("limit", "500");

  let nextUrl: string | null = url.toString();
  while (nextUrl) {
    const res = await fetch(nextUrl, { cache: "no-store" });
    const json = (await res.json()) as MetaInsightsResponse;
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Meta-API für act_${accountId}: ${msg}`);
    }
    if (json.data) rows.push(...json.data);
    nextUrl = json.paging?.next ?? null;
  }
  return rows;
}

export async function syncMeta(): Promise<MetaSyncResult> {
  const { token, accounts } = getEnv();
  const result: MetaSyncResult = {
    accounts: [],
    costs: 0,
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
    product: MetaProduct | null;
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
        const occurredAt = monthStart(startStr);

        if (!product) {
          result.unmatched.push({ campaign: name, spend: amount });
        }

        toInsert.push({
          product,
          amount,
          occurredAt,
          note: `Meta: ${name} (${startStr.slice(0, 7)}) [act_${accountId}]`,
        });
      }
    } catch (err) {
      result.errors.push(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Idempotent: alle bestehenden Meta-LEAD-Kosten im Zeitraum löschen, dann frisch einfügen.
  // So spiegeln wir Änderungen in Meta (z. B. nachträgliche Spend-Korrekturen).
  await prisma.cost.deleteMany({
    where: {
      kind: "LEAD",
      note: { startsWith: "Meta:" },
    },
  });

  for (const row of toInsert) {
    await prisma.cost.create({
      data: {
        kind: "LEAD",
        product: row.product,
        amount: row.amount,
        occurredAt: row.occurredAt,
        note: row.note,
      },
    });
    result.costs += 1;
  }

  return result;
}
