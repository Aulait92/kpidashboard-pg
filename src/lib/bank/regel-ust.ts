// USt-Einstellung einer Bankregel nachträglich ändern (Ole, 25.11.2026: „GC RE PHDRMUELLERSTBG“ stand auf „ohne USt“).
// Setzt CostRule.vatIncluded und dieselbe Einstellung an allen Buchungen der Regel (Netto wird beim Auswerten aus
// vatIncluded bzw. dem Beleg berechnet, es gibt kein gespeichertes Netto). Kostenart und Status bleiben.
import { prisma } from "@/lib/prisma";
import { DEFAULT_RULES, bankNetto, matchRule, type CostAction, type Rule } from "@/lib/bank/rules";

const r2 = (x: number) => Math.round(x * 100) / 100;

export type RegelUstErgebnis = {
  vorschau: boolean;
  regel: { id: string | null; muster: string; bezeichnung: string | null; kostenart: string; inklUstVorher: boolean; inklUstNachher: boolean; standardregel: boolean; angelegt: boolean };
  buchungen: number;
  geaendert: number;
  nettoVorher: number;
  nettoNachher: number;
  differenz: number;
  jahr2026: { nettoVorher: number; nettoNachher: number; differenz: number };
  jeMonat: { monat: string; anzahl: number; brutto: number; nettoVorher: number; nettoNachher: number }[];
  hinweis?: string;
};

/** Regel zu einem Muster: genau gleiches Muster, sonst eindeutiger Teil (DB-Regeln, dann Standardregeln). */
export async function findeRegel(muster: string): Promise<{ ok: true; db: { id: string; pattern: string; action: string; vatIncluded: boolean; label: string | null; counterpartyOnly: boolean } | null; standard: Rule | null } | { ok: false; error: string }> {
  const m = muster.trim().toLowerCase();
  if (m.length < 3) return { ok: false, error: "muster zu kurz (mindestens 3 Zeichen)." };
  const alle = await prisma.costRule.findMany({ select: { id: true, pattern: true, action: true, vatIncluded: true, label: true, counterpartyOnly: true } });
  const exakt = alle.find((r) => r.pattern.toLowerCase() === m);
  if (exakt) return { ok: true, db: exakt, standard: null };
  const teil = alle.filter((r) => r.pattern.toLowerCase().includes(m));
  if (teil.length > 1) return { ok: false, error: `Muster nicht eindeutig: ${teil.map((r) => `„${r.pattern}“`).join(", ")}` };
  if (teil.length === 1) return { ok: true, db: teil[0], standard: null };
  const std = DEFAULT_RULES.filter((r) => r.pattern.toLowerCase() === m || r.pattern.toLowerCase().includes(m));
  const s = std.find((r) => r.pattern.toLowerCase() === m) ?? (std.length === 1 ? std[0] : null);
  if (std.length > 1 && !s) return { ok: false, error: `Muster nicht eindeutig (Standardregeln): ${std.map((r) => `„${r.pattern}“`).join(", ")}` };
  if (s) return { ok: true, db: null, standard: s };
  return { ok: false, error: "Keine Regel mit diesem Muster (q=bank-regeln listet alle)." };
}

export async function regelUstSetzen(opts: { muster: string; inklUst: boolean; vorschau: boolean }): Promise<{ ok: true; ergebnis: RegelUstErgebnis } | { ok: false; error: string }> {
  const f = await findeRegel(opts.muster);
  if (!f.ok) return f;
  let db = f.db;
  const std = f.standard;
  if (std?.action === "ignore") return { ok: false, error: `„${std.pattern}“ ist eine Ignorieren-Regel, USt spielt keine Rolle.` };
  if (db?.action === "ignore") return { ok: false, error: `„${db.pattern}“ ist eine Ignorieren-Regel, USt spielt keine Rolle.` };
  let angelegt = false;
  // Standardregel ohne eigene DB-Regel: als eigene Regel mit gleichem Muster anlegen (so wie der Import es auch tut)
  if (!db && std && !opts.vorschau) {
    db = await prisma.costRule.upsert({
      where: { pattern: std.pattern },
      create: { pattern: std.pattern, action: std.action, vatIncluded: opts.inklUst, label: std.label ?? "Standardregel" },
      update: {},
      select: { id: true, pattern: true, action: true, vatIncluded: true, label: true, counterpartyOnly: true },
    });
    angelegt = true;
  }
  const pattern = db?.pattern ?? std!.pattern;
  const inklVorher = db && !angelegt ? db.vatIncluded : !!std?.vatIncluded;
  // Buchungen dieser Regel; bei einer (noch) nicht gespeicherten Standardregel die zugeordneten Buchungen ohne Regel, die sie trifft
  const rows = db && !angelegt
    ? await prisma.bankTransaction.findMany({
        where: { ruleId: db.id, amount: { lt: 0 } },
        select: { id: true, bookingDate: true, amount: true, status: true, costPurpose: true, vatIncluded: true, counterparty: true, purpose: true, beleg: { select: { netto: true, brutto: true, waehrung: true } } },
      })
    : (
        await prisma.bankTransaction.findMany({
          where: { ruleId: null, status: "zugeordnet", amount: { lt: 0 } },
          select: { id: true, bookingDate: true, amount: true, status: true, costPurpose: true, vatIncluded: true, counterparty: true, purpose: true, beleg: { select: { netto: true, brutto: true, waehrung: true } } },
        })
      ).filter((t) => matchRule(t, [], [{ pattern, action: (std?.action ?? "betrieb") as CostAction }])?.pattern === pattern);

  const monate = new Map<string, { anzahl: number; brutto: number; nettoVorher: number; nettoNachher: number }>();
  let nv = 0;
  let nn = 0;
  let v26 = 0;
  let n26 = 0;
  let zaehlend = 0;
  const zuAendern: string[] = [];
  for (const t of rows) {
    if (t.vatIncluded !== opts.inklUst) zuAendern.push(t.id);
    // Summen nur für Buchungen, die als Kosten zählen (wie BWA)
    if (t.status !== "zugeordnet" || !t.costPurpose) continue;
    zaehlend++;
    const a = Number(t.amount);
    const vor = bankNetto(a, t.vatIncluded, t.beleg).netto;
    const nach = bankNetto(a, opts.inklUst, t.beleg).netto;
    nv = r2(nv + vor);
    nn = r2(nn + nach);
    const m = t.bookingDate.toISOString().slice(0, 7);
    if (m.startsWith("2026")) {
      v26 = r2(v26 + vor);
      n26 = r2(n26 + nach);
    }
    const e = monate.get(m) ?? { anzahl: 0, brutto: 0, nettoVorher: 0, nettoNachher: 0 };
    e.anzahl++;
    e.brutto = r2(e.brutto - a);
    e.nettoVorher = r2(e.nettoVorher + vor);
    e.nettoNachher = r2(e.nettoNachher + nach);
    monate.set(m, e);
  }

  if (!opts.vorschau) {
    if (db && !angelegt) await prisma.costRule.update({ where: { id: db.id }, data: { vatIncluded: opts.inklUst } });
    if (zuAendern.length) {
      await prisma.bankTransaction.updateMany({ where: { id: { in: zuAendern } }, data: { vatIncluded: opts.inklUst } });
      // bei neu angelegter Regel die getroffenen Buchungen mit ihr verknüpfen
      if (db && angelegt) await prisma.bankTransaction.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { ruleId: db.id } });
    }
  }

  const hinweise = [
    ...(std && !db ? ["Standardregel ohne eigene Regel in der Datenbank: beim echten Lauf wird sie mit gleichem Muster angelegt."] : []),
    ...(rows.some((t) => t.beleg) ? ["Buchungen mit passendem Beleg zählen weiter mit dem Netto laut Beleg."] : []),
  ];
  return {
    ok: true,
    ergebnis: {
      vorschau: opts.vorschau,
      regel: {
        id: db?.id ?? null,
        muster: pattern,
        bezeichnung: db?.label ?? std?.label ?? null,
        kostenart: db?.action ?? std!.action,
        inklUstVorher: inklVorher,
        inklUstNachher: opts.inklUst,
        standardregel: !!std,
        angelegt,
      },
      buchungen: zaehlend,
      geaendert: zuAendern.length,
      nettoVorher: nv,
      nettoNachher: nn,
      differenz: r2(nn - nv),
      jahr2026: { nettoVorher: v26, nettoNachher: n26, differenz: r2(n26 - v26) },
      jeMonat: [...monate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([monat, v]) => ({ monat, ...v })),
      ...(hinweise.length ? { hinweis: hinweise.join(" ") } : {}),
    },
  };
}
