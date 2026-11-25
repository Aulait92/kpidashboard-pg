// Diagnose „bwa“ (Ole, 24.11.2026: BWA vervollständigen). Nur lesend.
//   GET /api/ops/diagnose?q=bwa[&jahr=2026]               BWA je Monat und Zeile, Umsatz je Kunde, Meta-Kosten (API vs. Bank)
//   GET /api/ops/diagnose?q=bwa&liste=eingaenge&von=&bis=  Zahlungseingänge mit Einordnung (Kunde, Einlage, Erstattung …)
//   GET /api/ops/diagnose?q=bwa&liste=neu                 Ausgaben ohne Kostenart (Status „neu“)
import { prisma } from "@/lib/prisma";

const tag = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;
const datum = (s: string | null, fallback: string) => new Date(`${/^\d{4}-\d{2}-\d{2}$/.test(s ?? "") ? s : fallback}T00:00:00Z`);

export async function bwaDiagnose(p: URLSearchParams) {
  const liste = p.get("liste");
  if (liste === "eingaenge") return eingaenge(datum(p.get("von"), "2026-01-01"), datum(p.get("bis"), "2026-12-31"));
  if (liste === "neu") return ohneKostenart();
  const { loadBwa } = await import("@/lib/bwa");
  const d = await loadBwa(p.get("jahr") ?? undefined);
  const jeMonat: Record<string, Record<string, number>> = {};
  const umsatzJeKunde: Record<string, Record<string, number>> = {};
  for (const i of d.items) {
    const gruppe = i.line.split(":")[0];
    jeMonat[i.month] ??= {};
    jeMonat[i.month][gruppe] = r2((jeMonat[i.month][gruppe] ?? 0) + i.net);
    if (gruppe === "umsatz") {
      umsatzJeKunde[i.label] ??= {};
      umsatzJeKunde[i.label][i.month] = r2((umsatzJeKunde[i.label][i.month] ?? 0) + i.net);
    }
  }
  const ab = new Date(`${d.range.length === 4 ? d.range : "2026"}-01-01T00:00:00Z`);
  const [metaApi, metaBank] = await Promise.all([
    prisma.$queryRaw<{ month: string; amount: number }[]>`
      SELECT to_char(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS month, SUM(amount)::float8 AS amount
      FROM "Cost" WHERE kind = 'LEAD' AND "occurredAt" >= ${ab} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ month: string; amount: number }[]>`
      SELECT to_char("bookingDate", 'YYYY-MM') AS month, -SUM(amount)::float8 AS amount
      FROM "BankTransaction" WHERE amount < 0 AND "bookingDate" >= ${ab}
        AND (counterparty ILIKE '%meta platforms%' OR counterparty ILIKE '%facebook%' OR purpose ILIKE '%facebook%')
      GROUP BY 1 ORDER BY 1`,
  ]);
  return {
    zeitraum: d.range,
    jeMonat,
    umsatzJeKunde,
    metaKosten: { ausApi: metaApi.map((x) => ({ monat: x.month, betrag: r2(x.amount) })), abbuchungenBank: metaBank.map((x) => ({ monat: x.month, betrag: r2(x.amount) })) },
    hinweise: d.hints,
    // Rücklastschriften: zurückgegebene Lastschriften zählen in der BWA nicht (auch vor dem Verrechnen)
    ruecklastschriften: await (async () => {
      const r = await (await import("@/lib/bank/ruecklastschriften")).ruecklastschriftenVerrechnen({ vorschau: true });
      return { paare: r.paare, nochZuVerrechnen: r.neuVerrechnet, ohneLastschrift: r.ohneLastschrift, summeBrutto: r.summeBrutto, jeMonat2026: r.jeMonat2026 };
    })(),
  };
}

async function eingaenge(von: Date, bis: Date) {
  const { eingangsArt, gegenbuchungen } = await import("@/lib/ops/cash-rechnung");
  const [rows, regeln, kunden] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { bookingDate: { gte: new Date(von.getTime() - 3 * 86_400_000), lte: bis } },
      orderBy: { bookingDate: "asc" },
      select: { id: true, accountKey: true, bookingDate: true, amount: true, status: true, costPurpose: true, vatIncluded: true, counterparty: true, purpose: true },
    }),
    prisma.costRule.findMany({ where: { action: "ignore" }, select: { pattern: true, label: true, counterpartyOnly: true } }),
    prisma.customer.findMany({ where: { isTest: false }, select: { id: true, name: true } }),
  ]);
  const buchungen = rows.map((r) => ({ ...r, amount: Number(r.amount) }));
  const umb = gegenbuchungen(buchungen);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();
  const kundeZu = (text: string) => {
    const t = norm(text);
    const k = kunden.find((c) => {
      const w = norm(c.name).split(" ").filter((x) => x.length >= 4 && !["gmbh", "allianz", "generalvertretung", "hauptvertretung", "agentur", "versicherung"].includes(x));
      return w.length && w.some((x) => t.includes(x));
    });
    return k ? { id: k.id, name: k.name } : null;
  };
  return buchungen
    .filter((b) => b.amount > 0 && b.bookingDate >= von)
    .map((b) => ({
      id: b.id,
      datum: tag(b.bookingDate),
      betrag: b.amount,
      konto: b.accountKey.slice(0, 16),
      art: eingangsArt(b, { regeln, gegenbuchung: umb.has(b) }),
      gegenpartei: b.counterparty,
      zweck: b.purpose?.replace(/\s+/g, " ").slice(0, 140) ?? null,
      kunde: kundeZu(`${b.counterparty ?? ""} ${b.purpose ?? ""}`),
    }));
}

async function ohneKostenart() {
  const rows = await prisma.bankTransaction.findMany({
    where: { status: "neu", amount: { lt: 0 }, bookingDate: { gte: new Date("2026-01-01T00:00:00Z") } },
    orderBy: { bookingDate: "asc" },
    select: { id: true, accountKey: true, bookingDate: true, amount: true, counterparty: true, purpose: true, beleg: { select: { firma: true, nummer: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    datum: tag(r.bookingDate),
    betrag: Number(r.amount),
    konto: r.accountKey.slice(0, 16),
    gegenpartei: r.counterparty,
    zweck: r.purpose?.replace(/\s+/g, " ").slice(0, 140) ?? null,
    beleg: r.beleg ? `${r.beleg.firma ?? ""} ${r.beleg.nummer ?? ""}`.trim() : null,
  }));
}
