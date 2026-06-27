// Adspend-Transparenz: welche Kampagnen fließen in die Cost-Berechnung ein
// (zugeordnet) und welche werden ignoriert (nicht zugeordnet).
//
// - Zugeordnete Kampagnen kommen aus der Cost-Tabelle (kind=LEAD): jede Zeile
//   trägt im note-Feld "<Channel>: <Kampagne> (<Datum>) [<Konto>]" und in der
//   product-Spalte das zugeordnete Produkt.
// - Nicht zugeordnete Kampagnen werden beim Channel-Sync in UnmatchedCampaign
//   persistiert (siehe persistUnmatched).

import { endOfDay, startOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import { displayProduct } from "@/lib/products";

export type AdChannel = "Meta" | "Outbrain" | "TikTok" | "Google";

function decToNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const obj = v as { toNumber?: () => number };
  if (typeof obj.toNumber === "function") return obj.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Aggregiert die (pro Tag mehrfach vorkommenden) Unmatched-Einträge eines
// Channels auf eine Zeile je Kampagne und schreibt sie atomar neu. Wird nur
// nach einem sauberen Channel-Sync aufgerufen (sonst würde ein Teil-Fehler die
// Liste leer zurücklassen). Ein leeres Array löscht den Channel (alles wieder
// zugeordnet).
export async function persistUnmatched(
  channel: AdChannel,
  unmatched: { campaign: string; spend: number }[],
): Promise<void> {
  const byCampaign = new Map<string, number>();
  for (const u of unmatched) {
    const name = u.campaign?.trim();
    if (!name) continue;
    byCampaign.set(name, (byCampaign.get(name) ?? 0) + (u.spend || 0));
  }
  await prisma.$transaction([
    prisma.unmatchedCampaign.deleteMany({ where: { channel } }),
    ...(byCampaign.size > 0
      ? [
          prisma.unmatchedCampaign.createMany({
            data: [...byCampaign.entries()].map(([campaign, spend]) => ({
              channel,
              campaign,
              spend,
            })),
          }),
        ]
      : []),
  ]);
}

export type AdspendCampaignRow = {
  channel: string;
  campaign: string;
  spend: number;
};

export type AdspendProductGroup = {
  product: string;
  label: string;
  total: number;
  campaigns: AdspendCampaignRow[];
};

export type AdspendAttribution = {
  monthLabel: string;
  matched: AdspendProductGroup[];
  matchedTotal: number;
  unmatched: AdspendCampaignRow[];
  unmatchedTotal: number;
};

// note-Format aus den Channel-Syncs: "<Channel>: <Kampagne> (<YYYY-MM-DD>) …".
const NOTE_RE = /^(Meta|Outbrain|TikTok|Google):\s+(.+?)\s+\(\d{4}-\d{2}-\d{2}\)/;

function parseNote(
  note: string | null,
): { channel: string; campaign: string } | null {
  if (!note) return null;
  const m = NOTE_RE.exec(note);
  if (m) return { channel: m[1], campaign: m[2] };
  // Fallback: nur den Channel-Prefix erkennen, Rest als Kampagnenname.
  const colon = note.indexOf(":");
  if (colon > 0) {
    return { channel: note.slice(0, colon), campaign: note.slice(colon + 1).trim() };
  }
  return null;
}

// Zugeordnete Kampagnen (MTD) je Produkt + die ignorierten Kampagnen aus dem
// letzten Sync. now = Stichtag (für den Monat).
export async function listAdspendAttribution(
  now: Date = new Date(),
): Promise<AdspendAttribution> {
  const monthStart = startOfMonth(now);
  const mtdEnd = endOfDay(now);

  const [costRows, unmatchedRows] = await Promise.all([
    prisma.cost.findMany({
      where: { kind: "LEAD", occurredAt: { gte: monthStart, lte: mtdEnd } },
      select: { product: true, note: true, amount: true },
    }),
    prisma.unmatchedCampaign.findMany({
      orderBy: [{ channel: "asc" }, { spend: "desc" }],
      select: { channel: true, campaign: true, spend: true },
    }),
  ]);

  // Matched: product → (channel|campaign) → spend.
  const groups = new Map<string, Map<string, AdspendCampaignRow>>();
  let matchedTotal = 0;
  for (const c of costRows) {
    const product = c.product;
    if (!product) continue;
    const parsed = parseNote(c.note);
    const channel = parsed?.channel ?? "—";
    const campaign = parsed?.campaign ?? c.note ?? "(unbekannt)";
    const amount = decToNumber(c.amount);
    matchedTotal += amount;
    const inner = groups.get(product) ?? new Map<string, AdspendCampaignRow>();
    const k = `${channel}|${campaign}`;
    const existing = inner.get(k);
    if (existing) existing.spend += amount;
    else inner.set(k, { channel, campaign, spend: amount });
    groups.set(product, inner);
  }

  const matched: AdspendProductGroup[] = [...groups.entries()]
    .map(([product, inner]) => {
      const campaigns = [...inner.values()].sort((a, b) => b.spend - a.spend);
      const total = campaigns.reduce((s, c) => s + c.spend, 0);
      return { product, label: displayProduct(product), total, campaigns };
    })
    .sort((a, b) => b.total - a.total);

  const unmatched: AdspendCampaignRow[] = unmatchedRows.map((u) => ({
    channel: u.channel,
    campaign: u.campaign,
    spend: decToNumber(u.spend),
  }));
  const unmatchedTotal = unmatched.reduce((s, u) => s + u.spend, 0);

  const monthLabel = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
  }).format(monthStart);

  return { monthLabel, matched, matchedTotal, unmatched, unmatchedTotal };
}
