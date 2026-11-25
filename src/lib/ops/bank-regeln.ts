// Diagnose „bank-regeln“ (Ole, 25.11.2026): nur lesend, keine Klardaten wie IBAN.
//   GET /api/ops/diagnose?q=bank-regeln                    alle Regeln (DB und Standard) mit USt-Verdacht, Steuerberater-Prüfung, Rücklastschriften
//   GET /api/ops/diagnose?q=bank-regeln&regel=<muster>     zusätzlich die einzelnen Buchungen der Regel (mit Beleg, BWA-Zeile, Netto)
import { prisma } from "@/lib/prisma";
import { DEFAULT_RULES, bankNetto, ustVerdacht } from "@/lib/bank/rules";

const r2 = (x: number) => Math.round(x * 100) / 100;
const tag = (d: Date) => d.toISOString().slice(0, 10);
const AB_2026 = new Date("2026-01-01T00:00:00Z");
const BIS_2026 = new Date("2027-01-01T00:00:00Z");

const belegInfo = (b: { nummer: string | null; datum: Date | null; brutto: unknown; netto: unknown; firma: string | null } | null) =>
  b ? { nummer: b.nummer, rechnungsdatum: b.datum ? tag(b.datum) : null, brutto: b.brutto != null ? Number(b.brutto) : null, netto: b.netto != null ? Number(b.netto) : null, firma: b.firma } : null;

const belegSel = { select: { nummer: true, datum: true, brutto: true, netto: true, firma: true, waehrung: true } } as const;

export async function bankRegeln(p: URLSearchParams) {
  const { bwaZeile, istSteuerberater } = await import("@/lib/bwa");
  const [regeln, stats, summen] = await Promise.all([
    prisma.costRule.findMany({ select: { id: true, pattern: true, label: true, action: true, vatIncluded: true, counterpartyOnly: true }, orderBy: { pattern: "asc" } }),
    prisma.bankTransaction.groupBy({ by: ["ruleId"], where: { ruleId: { not: null } }, _count: { _all: true } }),
    prisma.bankTransaction.findMany({
      where: { ruleId: { not: null }, status: "zugeordnet", amount: { lt: 0 }, bookingDate: { gte: AB_2026, lt: BIS_2026 } },
      select: { ruleId: true, amount: true, vatIncluded: true, beleg: belegSel },
    }),
  ]);
  const anzahl = new Map(stats.map((s) => [s.ruleId!, s._count._all]));
  const summe = new Map<string, { brutto: number; netto: number }>();
  for (const t of summen) {
    const e = summe.get(t.ruleId!) ?? { brutto: 0, netto: 0 };
    e.brutto = r2(e.brutto - Number(t.amount));
    e.netto = r2(e.netto + bankNetto(Number(t.amount), t.vatIncluded, t.beleg).netto);
    summe.set(t.ruleId!, e);
  }
  // Beispiel-Gegenparteien je Regel (max. 3 verschiedene)
  const beispiele = new Map<string, string[]>();
  const cps = await prisma.bankTransaction.findMany({ where: { ruleId: { not: null } }, select: { ruleId: true, counterparty: true }, distinct: ["ruleId", "counterparty"], take: 5000 });
  for (const c of cps) {
    const l = beispiele.get(c.ruleId!) ?? [];
    const name = (c.counterparty ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (name && l.length < 3 && !l.includes(name)) l.push(name);
    beispiele.set(c.ruleId!, l);
  }
  const db = regeln.map((r) => {
    const bsp = beispiele.get(r.id) ?? [];
    const v = ustVerdacht(r, bsp);
    return {
      quelle: "db" as const,
      muster: r.pattern,
      bezeichnung: r.label,
      kostenart: r.action,
      inklUst: r.vatIncluded,
      nurGegenpartei: r.counterpartyOnly,
      buchungen: anzahl.get(r.id) ?? 0,
      summe2026: summe.get(r.id) ?? { brutto: 0, netto: 0 },
      beispiele: bsp,
      verdacht: v.verdacht,
      grund: v.grund,
    };
  });
  const inDb = new Set(regeln.map((r) => r.pattern.toLowerCase()));
  const standard = DEFAULT_RULES.filter((r) => !inDb.has(r.pattern.toLowerCase())).map((r) => {
    const v = ustVerdacht({ action: r.action, vatIncluded: !!r.vatIncluded, pattern: r.pattern, label: r.label });
    return { quelle: "standard" as const, muster: r.pattern, bezeichnung: r.label ?? null, kostenart: r.action, inklUst: !!r.vatIncluded, nurGegenpartei: !!r.counterpartyOnly, buchungen: 0, summe2026: { brutto: 0, netto: 0 }, beispiele: [], verdacht: v.verdacht, grund: v.grund };
  });

  // Steuerberater: alle Buchungen (Lastschrift und Überweisung) mit ihrer BWA-Zeile
  const stbRows = await prisma.bankTransaction.findMany({
    where: {
      amount: { lt: 0 },
      bookingDate: { gte: AB_2026 },
      OR: ["steuerberat", "phdr", "mueller treuhand", "müller treuhand", "muellertreuhand", "stbg"].flatMap((t) => [
        { counterparty: { contains: t, mode: "insensitive" as const } },
        { purpose: { contains: t, mode: "insensitive" as const } },
      ]),
    },
    orderBy: { bookingDate: "asc" },
    select: { bookingDate: true, amount: true, status: true, costPurpose: true, vatIncluded: true, counterparty: true, purpose: true, note: true, rule: { select: { pattern: true, label: true } }, beleg: belegSel },
  });
  const steuerberater = stbRows
    .filter((t) => istSteuerberater(t.counterparty, t.purpose, t.rule?.label))
    .map((t) => {
      const zaehlt = t.status === "zugeordnet" && !!t.costPurpose;
      return {
        datum: tag(t.bookingDate),
        brutto: -Number(t.amount),
        status: t.status,
        kostenart: t.costPurpose,
        inklUst: t.vatIncluded,
        netto: zaehlt ? bankNetto(Number(t.amount), t.vatIncluded, t.beleg).netto : 0,
        bwaZeile: zaehlt ? bwaZeile({ costPurpose: t.costPurpose, counterparty: t.counterparty, purpose: t.purpose, ruleLabel: t.rule?.label }) : null,
        regel: t.rule?.pattern ?? null,
        notiz: t.note,
        gegenpartei: t.counterparty,
        beleg: belegInfo(t.beleg),
      };
    });
  const manuell = (
    await prisma.$queryRaw<{ month: string; note: string | null; amount: number }[]>`
      SELECT to_char(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS month, note, SUM(amount)::float8 AS amount
      FROM "Cost" WHERE kind = 'OTHER' AND "occurredAt" >= ${AB_2026} GROUP BY 1, 2`
  ).filter((c) => istSteuerberater(c.note));

  const { ruecklastschriftenVerrechnen } = await import("@/lib/bank/ruecklastschriften");
  const rl = await ruecklastschriftenVerrechnen({ vorschau: true });

  const muster = (p.get("regel") ?? "").trim().toLowerCase();
  let einzeln: unknown;
  if (muster) {
    const r = regeln.filter((x) => x.pattern.toLowerCase().includes(muster));
    einzeln = (
      await prisma.bankTransaction.findMany({
        where: { ruleId: { in: r.map((x) => x.id) } },
        orderBy: { bookingDate: "asc" },
        select: { bookingDate: true, amount: true, status: true, costPurpose: true, vatIncluded: true, counterparty: true, purpose: true, note: true, rule: { select: { pattern: true, label: true } }, beleg: belegSel },
      })
    ).map((t) => ({
      datum: tag(t.bookingDate),
      betrag: Number(t.amount),
      status: t.status,
      kostenart: t.costPurpose,
      inklUst: t.vatIncluded,
      netto: t.status === "zugeordnet" ? bankNetto(Number(t.amount), t.vatIncluded, t.beleg).netto : 0,
      bwaZeile: t.status === "zugeordnet" && t.costPurpose ? bwaZeile({ costPurpose: t.costPurpose, counterparty: t.counterparty, purpose: t.purpose, ruleLabel: t.rule?.label }) : null,
      regel: t.rule?.pattern ?? null,
      gegenpartei: t.counterparty,
      zweck: t.purpose?.replace(/\s+/g, " ").slice(0, 140) ?? null,
      notiz: t.note,
      beleg: belegInfo(t.beleg),
    }));
  }

  const alle = [...db, ...standard];
  return {
    hinweis: "Nur lesend. Netto: laut Beleg, wenn er zum Betrag passt, sonst aus „inkl. USt“ geschätzt. Verdacht ist eine Heuristik.",
    regeln: alle,
    verdacht: alle.filter((r) => r.verdacht).map((r) => ({ muster: r.muster, grund: r.grund, buchungen: r.buchungen, summe2026: r.summe2026 })),
    steuerberater: {
      buchungen: steuerberater,
      nichtInZeile: steuerberater.filter((s) => s.bwaZeile && s.bwaZeile !== "betrieb:Steuerberater").length,
      nichtGezaehlt: steuerberater.filter((s) => !s.bwaZeile).map((s) => ({ datum: s.datum, brutto: s.brutto, status: s.status, notiz: s.notiz })),
      summeNetto2026: r2(steuerberater.reduce((s, t) => s + t.netto, 0)),
      manuell: manuell.map((c) => ({ monat: c.month, notiz: c.note, betrag: r2(c.amount), bwaZeile: "betrieb:Steuerberater" })),
    },
    ruecklastschriften: { paare: rl.paare, nochZuVerrechnen: rl.neuVerrechnet, ohneLastschrift: rl.ohneLastschrift, summeBrutto: rl.summeBrutto, nettoBisherAlsKosten: rl.summeNettoBisher, jeMonat2026: rl.jeMonat2026, liste: rl.liste },
    ...(einzeln ? { einzeln } : {}),
  };
}
