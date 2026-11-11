// BWA aus der Datenbank: dieselben Quellen wie die Zahlen-Seite (Umsatzbuch,
// Meta-Kosten, WhatsApp-Gebühren, Bank & Karten, laufende Kosten), aber ohne
// Hochrechnung des laufenden Monats. Aggregation in lib/bwa-shared.ts.

import { prisma } from "@/lib/prisma";
import { addMonths, monthKey, monthRange } from "@/lib/revenue-ledger";
import { FIRST_MONTH, loadKpiSettings, loadLedger, recurringShare } from "@/lib/zahlen";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { monthlyFeeCosts } from "@/lib/whatsapp/fees";
import { netCost } from "@/lib/bank/rules";
import { buildBwa, groupSmallBetrieb, type Bwa, type BwaInput, type BwaItem } from "@/lib/bwa-shared";

export type BwaRange = { key: string; label: string };
export type BwaData = {
  range: string;
  ranges: BwaRange[];
  bwa: Bwa;
  items: BwaItem[];
  hints: { openExpenses: number; amexLastImport: string | null; amexLastBooking: string | null; bankFrom: string | null };
};

const n = (v: unknown) => (v == null ? 0 : Number(v));
const r2 = (x: number) => Math.round(x * 100) / 100;
const ZUORDNEN = "/admin/einstellungen/bank/zuordnen";

/** Zeitraum aus ?bwa=: Jahr (2026) oder „12m“; Standard laufendes Jahr. */
export function bwaMonths(param: string | undefined, now = new Date()): { key: string; months: string[] } {
  const current = monthKey(now);
  const year = Number(current.slice(0, 4));
  if (param === "12m") return { key: "12m", months: monthRange(addMonths(current, -11), current) };
  const y = /^\d{4}$/.test(param ?? "") ? Math.min(Number(param), year) : year;
  const last = y === year ? current : `${y}-12`;
  return { key: String(y), months: monthRange(`${y}-01`, last) };
}

/** Anzeigename einer Betriebs-Gruppe: Regel-Bezeichnung ohne Klammerzusatz, sonst Gegenpartei. */
export function betriebGroup(label: string | null | undefined, counterparty: string | null | undefined): string {
  const l = (label ?? "").replace(/\s*\(.*\)\s*$/, "").trim();
  if (l && l !== "Standardregel") return l.slice(0, 60);
  const c = (counterparty ?? "").replace(/\s+/g, " ").trim();
  return (c || "Ohne Empfänger").slice(0, 60);
}

export async function loadBwa(param?: string, now = new Date()): Promise<BwaData> {
  const { key, months } = bwaMonths(param, now);
  const current = monthKey(now);
  const from = new Date(`${months[0]}-01T00:00:00.000Z`);
  const fromQ = new Date(from.getTime() - 86_400_000);
  const inRange = (m: string) => months.includes(m);
  const items: BwaItem[] = [];

  // ── Umsatz (Umsatzbuch; Pay-per-Lead ohne Hochrechnung) ──
  const [{ ledger, pplCounts }, settings] = await Promise.all([loadLedger(now), loadKpiSettings()]);
  const ids = new Set<string>([...ledger.rows.map((r) => r.customerId), ...pplCounts.map((p) => p.customerId)]);
  const names = new Map(
    (await prisma.customer.findMany({ where: { id: { in: [...ids].filter((x) => !x.includes(":")) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]),
  );
  const nameOf = (id: string) => names.get(id) ?? (id.startsWith("nachtrag:") ? "Nachtrag (ohne Kunde)" : id.startsWith("angebot:") ? "Angebot (ohne Kundenakte)" : "Unbekannt");
  for (const p of pplCounts) {
    if (!inRange(p.month) || !(p.amount > 0)) continue;
    items.push({ month: p.month, line: "umsatz:ppl", label: nameOf(p.customerId), net: r2(p.amount), detail: `${p.n} Leads`, href: names.has(p.customerId) ? `/admin/kunden/${p.customerId}` : null });
  }
  for (const r of ledger.rows) {
    if (r.stream === "ppl" || !inRange(r.month)) continue;
    const line = r.stream === "setup" ? "umsatz:setup" : r.stream === "software" ? "umsatz:software" : "umsatz:service";
    items.push({ month: r.month, line, label: nameOf(r.customerId), net: r.amount, href: names.has(r.customerId) ? `/admin/kunden/${r.customerId}` : null });
  }

  // ── Meta-Werbung (LEAD-Kosten): Kundengewinnung per Kampagnenname, Rest direkt ──
  const patterns = settings.acquisitionCampaigns.length ? settings.acquisitionCampaigns.map((c) => `%${c}%`) : ["%__nie__%"];
  const meta = await prisma.$queryRaw<{ month: string; note: string | null; acq: boolean; amount: number }[]>`
    SELECT to_char(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS month, note,
           (note IS NOT NULL AND note ILIKE ANY (${patterns})) AS acq, SUM(amount)::float8 AS amount
    FROM "Cost" WHERE kind = 'LEAD' AND "occurredAt" >= ${fromQ}
    GROUP BY 1, 2, 3`;
  for (const c of meta) {
    if (!inRange(c.month) || !(c.amount > 0)) continue;
    items.push({ month: c.month, line: c.acq ? "akquise:meta" : "direkt:meta", label: c.note ?? "Ohne Kampagne", net: r2(c.amount) });
  }
  const other = await prisma.$queryRaw<{ month: string; note: string | null; amount: number }[]>`
    SELECT to_char(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS month, note, SUM(amount)::float8 AS amount
    FROM "Cost" WHERE kind = 'OTHER' AND "occurredAt" >= ${fromQ}
    GROUP BY 1, 2`;
  for (const c of other) {
    if (!inRange(c.month) || !(c.amount > 0)) continue;
    items.push({ month: c.month, line: "betrieb:Sonstige Kosten (manuell)", label: c.note ?? "Kosten", net: r2(c.amount) });
  }

  // ── WhatsApp-Gebühren (nur wenn im Preis enthalten → direkte Kosten) ──
  if (PRICE_LIST.whatsappIncluded) {
    for (const [m, v] of await monthlyFeeCosts(fromQ)) if (inRange(m) && v > 0) items.push({ month: m, line: "direkt:whatsapp", label: "WhatsApp-Gebühren (Meta)", net: r2(v) });
  }

  // ── Bank & Karten (zugeordnete Ausgaben, netto) ──
  const bank = await prisma.bankTransaction.findMany({
    where: { status: "zugeordnet", bookingDate: { gte: from }, amount: { lt: 0 }, costPurpose: { not: null } },
    select: { id: true, bookingDate: true, amount: true, costPurpose: true, vatIncluded: true, counterparty: true, purpose: true, accountKey: true, rule: { select: { label: true } } },
    orderBy: { bookingDate: "asc" },
  });
  for (const t of bank) {
    const m = t.bookingDate.toISOString().slice(0, 7);
    if (!inRange(m)) continue;
    const net = netCost(Number(t.amount), t.vatIncluded);
    const line =
      t.costPurpose === "ppl" ? "direkt:ppl" : t.costPurpose === "software" ? "direkt:software" : t.costPurpose === "akquise" ? "akquise:tools" : `betrieb:${betriebGroup(t.rule?.label, t.counterparty)}`;
    items.push({
      month: m,
      line,
      label: (t.counterparty ?? "Ohne Empfänger").slice(0, 80),
      date: t.bookingDate.toISOString().slice(0, 10),
      net,
      gross: r2(-Number(t.amount)),
      detail: [t.accountKey.startsWith("csv:amex") ? "Amex" : "Konto", t.vatIncluded ? "inkl. USt" : "ohne USt", t.purpose?.slice(0, 80)].filter(Boolean).join(" · "),
      href: ZUORDNEN,
    });
  }

  // ── Laufende Kosten (von Hand) ──
  const recurring = await prisma.recurringCost.findMany();
  for (const rc of recurring) {
    for (const m of months) {
      const share = recurringShare(rc.startsAt, rc.endsAt, m);
      if (share <= 0) continue;
      const v = r2(n(rc.monthlyAmount) * share);
      if (!(v > 0)) continue;
      const line = rc.purpose === "ppl" ? "direkt:ppl" : rc.purpose === "software" ? "direkt:software" : rc.purpose === "akquise" ? "akquise:tools" : `betrieb:${rc.name.slice(0, 60)}`;
      items.push({ month: m, line, label: rc.name, net: v, detail: "laufende Kosten (von Hand)", href: "/admin/einstellungen/kosten" });
    }
  }

  // ── Hinweise ──
  const [openExpenses, amex, first] = await Promise.all([
    prisma.bankTransaction.count({ where: { status: "neu", amount: { lt: 0 } } }),
    prisma.bankTransaction.aggregate({ where: { accountKey: "csv:amex" }, _max: { createdAt: true, bookingDate: true } }),
    prisma.bankTransaction.aggregate({ _min: { bookingDate: true } }),
  ]);
  const bankFrom = first._min.bookingDate ? first._min.bookingDate.toISOString().slice(0, 7) : null;

  // Kleine Betriebs-Posten einmal zusammenfassen – Tabelle und Aufschlüsselung nutzen dieselben Zeilen
  const grouped = groupSmallBetrieb(items, months);
  const input: BwaInput = {
    months,
    current,
    items: grouped,
    bankFrom,
    fixedLines: [
      { section: "umsatz", line: "umsatz:software", label: "Software" },
      { section: "umsatz", line: "umsatz:service", label: "Betreuung" },
      { section: "umsatz", line: "umsatz:ppl", label: "Pay-per-Lead (Pilot)" },
      { section: "umsatz", line: "umsatz:setup", label: "Einrichtung & Einmal-Umsätze" },
      { section: "direkt", line: "direkt:meta", label: "Meta-Werbung Pay-per-Lead (Pilot)" },
      ...(PRICE_LIST.whatsappIncluded ? [{ section: "direkt" as const, line: "direkt:whatsapp", label: "WhatsApp-Gebühren" }] : []),
      { section: "direkt", line: "direkt:ppl", label: "Lead-Kosten Pay-per-Lead (Pilot; Bank, Karte, laufend)" },
      { section: "direkt", line: "direkt:software", label: "Software & Tools" },
      { section: "akquise", line: "akquise:meta", label: "Meta-Werbung Kundengewinnung" },
      { section: "akquise", line: "akquise:tools", label: "Tools & Werbung" },
    ],
  };

  const year = Number(current.slice(0, 4));
  const ranges: BwaRange[] = [{ key: "12m", label: "Letzte 12 Monate" }];
  for (let y = year; y >= Number(FIRST_MONTH.slice(0, 4)); y--) ranges.push({ key: String(y), label: String(y) });

  return {
    range: key,
    ranges,
    bwa: buildBwa(input),
    items: grouped,
    hints: {
      openExpenses,
      amexLastImport: amex._max.createdAt ? amex._max.createdAt.toISOString() : null,
      amexLastBooking: amex._max.bookingDate ? amex._max.bookingDate.toISOString().slice(0, 10) : null,
      bankFrom,
    },
  };
}
