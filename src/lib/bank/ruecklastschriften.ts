// Rücklastschriften verrechnen (Ole, 25.11.2026): Gutschrift mit „Rückgabegrund“ hebt die Lastschrift mit derselben
// End-to-End-Referenz auf. Beide zählen nicht: Lastschrift „ignoriert“ (zurückgegeben), Rückbuchung „ignoriert“
// (Rücklastschrift). Paarbildung ohne Datenbank in rules.ts (ruecklastschriftPaare).
import { prisma } from "@/lib/prisma";
import { RUECKLASTSCHRIFT, ZURUECKGEGEBEN, bankNetto, istRuecklastschrift, ruecklastschriftPaare } from "@/lib/bank/rules";

const tag = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;
/** Notiz-Anfang einer schon verknüpften Rückbuchung. */
export const RL_VERKNUEPFT = `${RUECKLASTSCHRIFT} zu Lastschrift`;

const textFilter = ["ckgabegrund", "ck gabegrund", "cklastschrift", "lastschriftrückgabe", "lastschriftrueckgabe"].map((t) => ({ purpose: { contains: t, mode: "insensitive" as const } }));

const sel = {
  id: true,
  accountKey: true,
  bookingDate: true,
  amount: true,
  counterparty: true,
  purpose: true,
  status: true,
  costPurpose: true,
  vatIncluded: true,
  note: true,
  beleg: { select: { netto: true, brutto: true, waehrung: true } },
} as const;

async function ladeRueckbuchungen(where: { accountKey?: string } = {}) {
  const rows = await prisma.bankTransaction.findMany({ where: { ...where, amount: { gt: 0 }, OR: textFilter }, select: sel });
  return rows.map((r) => ({ ...r, amount: Number(r.amount) })).filter((r) => istRuecklastschrift(r));
}

export type RlErgebnis = {
  vorschau: boolean;
  paare: number;
  neuVerrechnet: number;
  ohneLastschrift: number;
  summeBrutto: number;
  /** Netto, das die Lastschriften vorher als Kosten zählten (nur, solange sie „zugeordnet“ waren) */
  summeNettoBisher: number;
  jeMonat2026: { monat: string; paare: number; brutto: number; nettoBisher: number }[];
  liste: { lastschrift: string | null; rueckbuchung: string; betrag: number; gegenpartei: string | null; ueber: string | null; statusVorher: string | null; nettoBisher: number }[];
};

/** Alle Paare finden und (ohne vorschau) verrechnen. Idempotent; schon verrechnete Paare zählen als Paar, nicht als neu. */
export async function ruecklastschriftenVerrechnen(opts: { vorschau: boolean; accountKey?: string }): Promise<RlErgebnis> {
  const rueck = await ladeRueckbuchungen(opts.accountKey ? { accountKey: opts.accountKey } : {});
  const res: RlErgebnis = { vorschau: opts.vorschau, paare: 0, neuVerrechnet: 0, ohneLastschrift: 0, summeBrutto: 0, summeNettoBisher: 0, jeMonat2026: [], liste: [] };
  if (!rueck.length) return res;
  const betraege = [...new Set(rueck.map((r) => -r.amount))];
  const lastschriften = (
    await prisma.bankTransaction.findMany({ where: { ...(opts.accountKey ? { accountKey: opts.accountKey } : {}), amount: { in: betraege } }, select: sel })
  ).map((r) => ({ ...r, amount: Number(r.amount) }));
  const monate = new Map<string, { paare: number; brutto: number; nettoBisher: number }>();
  for (const p of ruecklastschriftPaare([...rueck, ...lastschriften])) {
    const r = p.rueckbuchung;
    const l = p.lastschrift;
    if (!l) {
      res.ohneLastschrift++;
      res.liste.push({ lastschrift: null, rueckbuchung: tag(r.bookingDate), betrag: r.amount, gegenpartei: r.counterparty, ueber: null, statusVorher: null, nettoBisher: 0 });
      if (!opts.vorschau && !(r.note ?? "").startsWith(RUECKLASTSCHRIFT)) {
        await prisma.bankTransaction.update({ where: { id: r.id }, data: { status: "ignoriert", costPurpose: null, note: `${RUECKLASTSCHRIFT} (Lastschrift nicht gefunden)` } });
      }
      continue;
    }
    res.paare++;
    const zaehlte = l.status === "zugeordnet" && !!l.costPurpose;
    const nettoBisher = zaehlte ? bankNetto(l.amount, l.vatIncluded, l.beleg).netto : 0;
    const schon = l.status === "ignoriert" && (l.note ?? "").startsWith(ZURUECKGEGEBEN) && (r.note ?? "").startsWith(RL_VERKNUEPFT);
    if (!schon) res.neuVerrechnet++;
    res.summeBrutto = r2(res.summeBrutto + r.amount);
    res.summeNettoBisher = r2(res.summeNettoBisher + nettoBisher);
    const m = tag(l.bookingDate).slice(0, 7);
    if (m.startsWith("2026")) {
      const e = monate.get(m) ?? { paare: 0, brutto: 0, nettoBisher: 0 };
      e.paare++;
      e.brutto = r2(e.brutto + r.amount);
      e.nettoBisher = r2(e.nettoBisher + nettoBisher);
      monate.set(m, e);
    }
    res.liste.push({ lastschrift: tag(l.bookingDate), rueckbuchung: tag(r.bookingDate), betrag: r.amount, gegenpartei: l.counterparty ?? r.counterparty, ueber: p.ueber, statusVorher: l.status, nettoBisher });
    if (!opts.vorschau && !schon) {
      await prisma.$transaction([
        prisma.bankTransaction.update({
          where: { id: l.id },
          data: { status: "ignoriert", costPurpose: null, note: `${ZURUECKGEGEBEN}: ${RUECKLASTSCHRIFT} vom ${tag(r.bookingDate)}`, assignedAt: new Date() },
        }),
        prisma.bankTransaction.update({ where: { id: r.id }, data: { status: "ignoriert", costPurpose: null, note: `${RL_VERKNUEPFT} vom ${tag(l.bookingDate)}` } }),
      ]);
    }
  }
  res.jeMonat2026 = [...monate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([monat, v]) => ({ monat, ...v }));
  return res;
}

/**
 * Für Auswertungen (BWA, Kosten je Monat): IDs zugeordneter Lastschriften, die schon zurückgegeben wurden, deren Paar aber
 * noch nicht verrechnet ist. So stimmen die Zahlen auch vor dem Verrechnen.
 */
export async function zurueckgegebeneLastschriften(
  zugeordnet: { id: string; accountKey: string; bookingDate: Date; amount: unknown; counterparty: string | null; purpose: string | null }[],
): Promise<Set<string>> {
  const rueck = (await ladeRueckbuchungen()).filter((r) => !(r.note ?? "").startsWith(RL_VERKNUEPFT));
  if (!rueck.length) return new Set();
  const debits = zugeordnet.map((t) => ({ ...t, amount: Number(t.amount) })).filter((t) => t.amount < 0);
  return new Set(
    ruecklastschriftPaare([...rueck, ...debits])
      .map((p) => p.lastschrift?.id)
      .filter((x): x is string => !!x && debits.some((d) => d.id === x)),
  );
}
