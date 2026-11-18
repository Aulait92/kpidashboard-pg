// Investoren-Kennzahlen (Geld › Auswertung, Plan docs/plan-mailstrecke-dsgvo-investoren.md K1): Rechenkern ohne
// Datenbank, getestet (tests/unit/investoren-kennzahlen.test.ts). Rechnet nur aus dem Umsatzbuch (revenue-ledger.ts)
// und den Kosten je Monat (zahlen.ts loadCosts), mit denselben Definitionen wie die Übersicht (zahlen.ts), damit die
// Gegenprobe (K5) aufgeht:
// - MRR = wiederkehrender Umsatz im laufenden Monat (Verträge voll, Pay-per-Lead hochgerechnet), ARR = MRR × 12.
// - Bindung, Kohorten, Marge, CAC und Kundenwert rechnen nur mit abgeschlossenen Monaten.
// - Kunden-Bindung (3/6/12 Monate): Anteil der Kunden mit Umsatz im Basismonat, die im letzten abgeschlossenen Monat noch
//   Umsatz haben. Umsatzbindung netto (NRR): deren Umsatz heute ÷ damals (mit Ausbau). Brutto (GRR): ohne Ausbau, je
//   Kunde höchstens der damalige Betrag.
// - Kundenwert (CLV) = Rohertrag je Kunde und Monat × erwartete Laufzeit (1 ÷ monatliche Kündigungsquote, höchstens 24).
// - CAC = Kosten der Kundengewinnung ÷ neue Kunden der letzten 3 abgeschlossenen Monate; Amortisation = CAC ÷ Rohertrag
//   je Kunde und Monat. Kundenwert : CAC mit Gründerzeit (wie Übersicht).
// - Kohorten erst ab MIN_KOHORTE Kunden je Startmonat (kleinere sind Zufall, nicht Aussage).
// Nie Zahlen erfinden: fehlt die Grundlage, ist der Wert null und `fehlt` sagt, ab wann es ihn gibt.

import {
  activeCustomers,
  addMonths,
  churnRate,
  cohorts,
  mrrMovement,
  newCustomers,
  recurringByCustomer,
  totalsByMonth,
  type Bridge,
  type Cohort,
  type LedgerRow,
  type MonthTotals,
} from "@/lib/revenue-ledger";

export const MIN_KOHORTE = 5;
export const BINDUNG_MONATE = [3, 6, 12] as const;
/** Höchste angenommene Laufzeit für den Kundenwert (wie zahlen.ts). */
export const MAX_LAUFZEIT = 24;
/** Fenster für CAC und Neukunden (abgeschlossene Monate). */
export const CAC_FENSTER = 3;

export type KostenMonat = { month: string; ppl: number; software: number; akquise: number; betrieb: number; ki?: number };

export type InvestorInput = {
  /** Umsatzbuch (bereits nach Sicht gefiltert) */
  rows: LedgerRow[];
  /** Umsatzbuch mit allen Strömen (für Abo vs. Pay-per-Lead) */
  rowsAlle?: LedgerRow[];
  /** Alle Monate des Umsatzbuchs (aufsteigend, letzter = laufender Monat) */
  months: string[];
  current: string;
  /** Kosten je Monat (nach Sicht) */
  kosten: KostenMonat[];
  /** Kosten je Monat mit allen Strömen (für Abo vs. Pay-per-Lead) */
  kostenAlle?: KostenMonat[];
  /** Gründerzeit je Monat in Euro (Stunden × Satz), für CAC mit Gründerzeit */
  gruenderMonat: number;
};

export type Bindung = {
  monate: number;
  basis: string;
  /** Kunden mit Umsatz im Basismonat */
  kunden: number;
  /** Davon im letzten abgeschlossenen Monat noch mit Umsatz */
  gehalten: number;
  kundenBindung: number | null;
  nrr: number | null;
  grr: number | null;
  /** Fehlt die Historie: erster Monat, ab dem die Zahl erscheint („YYYY-MM“) */
  ab: string | null;
};

export type MargeMonat = { month: string; umsatz: number; direkt: number; ki: number; marge: number | null };

export type StromVergleich = { mrr: number; kunden: number; marge: number | null; anteil: number | null };

export type InvestorKennzahlen = {
  current: string;
  lastComplete: string;
  /** Abgeschlossene Monate mit wiederkehrendem Umsatz */
  historie: number;
  totals: MonthTotals[];
  mrr: number;
  mrrVormonat: number;
  arr: number;
  wachstum: number | null;
  aktiveKunden: number;
  bindung: Bindung[];
  /** NRR für die Kachel: längste vorhandene Bindung (12, sonst 6, sonst 3 Monate) */
  nrrKachel: Bindung | null;
  kuendigung: { quote: number; gekuendigt: number; schnittAktiv: number } | null;
  cac: {
    fenster: string[];
    neukunden: number;
    kosten: number;
    cac: number | null;
    cacMitGruender: number | null;
    rohertragJeKunde: number | null;
    amortisation: number | null;
    amortisationMitGruender: number | null;
  };
  clv: { wert: number | null; laufzeit: number; laufzeitGedeckelt: boolean; zuCac: number | null };
  marge: { monate: MargeMonat[]; letzter: number | null; kiAnteil: number | null };
  bewegung: Bridge[];
  kohorten: { gezeigt: Cohort[]; ausgeblendet: number; groesste: { start: string; kunden: number } | null };
  stroeme: { abo: StromVergleich; ppl: StromVergleich; monat: string } | null;
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const val = (m: Map<string, number> | undefined, k: string) => m?.get(k) ?? 0;

/** Kunden- und Umsatzbindung über `monate` Monate bis `monat` (abgeschlossen). `erster` = erster Monat des Umsatzbuchs. */
export function bindung(rows: LedgerRow[], monat: string, monate: number, erster: string): Bindung {
  const basis = addMonths(monat, -monate);
  const leer: Bindung = { monate, basis, kunden: 0, gehalten: 0, kundenBindung: null, nrr: null, grr: null, ab: null };
  if (basis < erster) return { ...leer, ab: addMonths(erster, monate + 1) };
  let damals = 0;
  let heute = 0;
  let ohneAusbau = 0;
  let kunden = 0;
  let gehalten = 0;
  for (const m of recurringByCustomer(rows).values()) {
    const a = val(m, basis);
    if (a <= 0) continue;
    const c = val(m, monat);
    kunden++;
    if (c > 0) gehalten++;
    damals += a;
    heute += c;
    ohneAusbau += Math.min(a, c);
  }
  if (!kunden || damals <= 0) return { ...leer, ab: null };
  return { monate, basis, kunden, gehalten, kundenBindung: gehalten / kunden, nrr: heute / damals, grr: ohneAusbau / damals, ab: null };
}

/** Bruttomarge eines Monats: (wiederkehrender Umsatz − direkte Kosten) ÷ Umsatz. */
export function margeMonat(t: MonthTotals | undefined, k: KostenMonat | undefined): MargeMonat | null {
  if (!t) return null;
  const direkt = k ? k.ppl + k.software : 0;
  return { month: t.month, umsatz: t.recurring, direkt: r2(direkt), ki: r2(k?.ki ?? 0), marge: t.recurring > 0 ? (t.recurring - direkt) / t.recurring : null };
}

/** Kohorten nur ab `min` Kunden je Startmonat; kleinere werden gezählt, nicht gezeigt. */
export function kohortenAb(alle: Cohort[], min = MIN_KOHORTE) {
  const gezeigt = alle.filter((c) => c.customers >= min);
  const groesste = alle.reduce<{ start: string; kunden: number } | null>((g, c) => (!g || c.customers > g.kunden ? { start: c.start, kunden: c.customers } : g), null);
  return { gezeigt, ausgeblendet: alle.length - gezeigt.length, groesste };
}

/** Abo (Betreuung + Software) und Pay-per-Lead im Vergleich für einen abgeschlossenen Monat. */
export function stromVergleich(rows: LedgerRow[], kosten: KostenMonat | undefined, monat: string): { abo: StromVergleich; ppl: StromVergleich } {
  const t = totalsByMonth(rows, [monat])[0];
  const abo = t.service + t.software;
  const kundenAbo = new Set(rows.filter((r) => r.month === monat && r.recurring && r.amount > 0 && (r.stream === "service" || r.stream === "software")).map((r) => r.customerId)).size;
  const gesamt = abo + t.ppl;
  const m = (umsatz: number, k: number) => (umsatz > 0 ? (umsatz - k) / umsatz : null);
  return {
    abo: { mrr: r2(abo), kunden: kundenAbo, marge: m(abo, kosten?.software ?? 0), anteil: gesamt > 0 ? abo / gesamt : null },
    ppl: { mrr: r2(t.ppl), kunden: activeCustomers(rows, monat, "ppl"), marge: m(t.ppl, kosten?.ppl ?? 0), anteil: gesamt > 0 ? t.ppl / gesamt : null },
  };
}

export function investorKennzahlen(i: InvestorInput): InvestorKennzahlen {
  const { rows, months, current } = i;
  const lastComplete = addMonths(current, -1);
  const complete = months.filter((m) => m < current);
  const totals = totalsByMonth(rows, months);
  const tot = (m: string) => totals.find((t) => t.month === m);
  const kost = (m: string) => i.kosten.find((k) => k.month === m);
  const erster = months[0] ?? current;

  const mrr = tot(current)?.recurring ?? 0;
  const mrrVormonat = tot(lastComplete)?.recurring ?? 0;
  const historie = complete.filter((m) => (tot(m)?.recurring ?? 0) > 0).length;

  // ── Bindung ──
  const erstUmsatz = complete.find((m) => (tot(m)?.recurring ?? 0) > 0) ?? erster;
  const bind = BINDUNG_MONATE.map((n) => bindung(rows, lastComplete, n, erstUmsatz));
  const nrrKachel = [...bind].reverse().find((b) => b.nrr != null) ?? null;
  const k = churnRate(rows, complete);
  const kuendigung = k ? { quote: k.rate, gekuendigt: k.churned, schnittAktiv: k.avgActive } : null;

  // ── CAC, Rohertrag, Kundenwert ──
  const fenster = complete.slice(-CAC_FENSTER);
  const neukunden = fenster.reduce((s, m) => s + newCustomers(rows, m), 0);
  const akquise = fenster.reduce((s, m) => s + (kost(m)?.akquise ?? 0), 0);
  const aktiv = activeCustomers(rows, lastComplete);
  const tl = tot(lastComplete);
  const kl = kost(lastComplete);
  const rohertrag = tl && kl && aktiv ? (tl.recurring - kl.ppl - kl.software) / aktiv : null;
  const cac = neukunden ? akquise / neukunden : null;
  const cacG = neukunden ? (akquise + i.gruenderMonat * fenster.length) / neukunden : null;
  const laufzeitRoh = k && k.rate > 0 ? 1 / k.rate : Infinity;
  const laufzeit = Math.min(MAX_LAUFZEIT, laufzeitRoh);
  // Ohne gemessene Kündigungsquote (weniger als zwei Monate) keine Laufzeit, also kein Kundenwert
  const clv = rohertrag != null && kuendigung ? rohertrag * laufzeit : null;

  // ── Marge ──
  const margen = complete.map((m) => margeMonat(tot(m), kost(m))).filter((x): x is MargeMonat => !!x && x.umsatz > 0);
  const ml = margen.find((x) => x.month === lastComplete) ?? null;

  // ── Abo vs. Pay-per-Lead (immer mit allen Strömen) ──
  const alle = i.rowsAlle ?? rows;
  const kAlle = (i.kostenAlle ?? i.kosten).find((x) => x.month === lastComplete);
  const stroeme = complete.length ? { ...stromVergleich(alle, kAlle, lastComplete), monat: lastComplete } : null;

  return {
    current,
    lastComplete,
    historie,
    totals,
    mrr: r2(mrr),
    mrrVormonat: r2(mrrVormonat),
    arr: r2(mrr * 12),
    wachstum: mrrVormonat > 0 ? mrr / mrrVormonat - 1 : null,
    aktiveKunden: aktiv,
    bindung: bind,
    nrrKachel,
    kuendigung,
    cac: {
      fenster,
      neukunden,
      kosten: r2(akquise),
      cac: cac == null ? null : r2(cac),
      cacMitGruender: cacG == null ? null : r2(cacG),
      rohertragJeKunde: rohertrag == null ? null : r2(rohertrag),
      amortisation: cac != null && rohertrag && rohertrag > 0 ? cac / rohertrag : null,
      amortisationMitGruender: cacG != null && rohertrag && rohertrag > 0 ? cacG / rohertrag : null,
    },
    clv: { wert: clv == null ? null : r2(clv), laufzeit, laufzeitGedeckelt: laufzeitRoh > MAX_LAUFZEIT, zuCac: clv != null && cacG ? clv / cacG : null },
    marge: { monate: margen, letzter: ml?.marge ?? null, kiAnteil: ml && ml.umsatz > 0 ? ml.ki / ml.umsatz : null },
    bewegung: mrrMovement(rows, complete).slice(-6),
    kohorten: kohortenAb(cohorts(rows, complete)),
    stroeme,
  };
}

// ─── Gegenprobe (K5): gleiche Zahl in der Übersicht (zahlen.ts) ─────────

export type UebersichtWerte = {
  headline: { mrr: number; arr: number; active: number; grossMargin: number | null; retention: { pct: number; lag: number } | null };
  unit: { cac: number | null; cacFounder: number | null; payback: number | null; paybackFounder: number | null; ltv: number | null; ltvCac: number | null };
  churn: { rate: number } | null;
};

export type Abgleich = { name: string; auswertung: number | null; uebersicht: number | null; gleich: boolean; hinweis?: string };

/** Vergleicht die Kennzahlen der Auswertung mit denen der Übersicht (gleiche Sicht und Zeitpunkt). */
export function gegenprobe(k: InvestorKennzahlen, z: UebersichtWerte): Abgleich[] {
  const gleich = (a: number | null, b: number | null) => (a == null || b == null ? a == null && b == null : Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.001));
  const zeile = (name: string, a: number | null, b: number | null, hinweis?: string): Abgleich => ({ name, auswertung: a, uebersicht: b, gleich: gleich(a, b), ...(hinweis ? { hinweis } : {}) });
  const lag = z.headline.retention?.lag;
  const b = lag ? k.bindung.find((x) => x.monate === lag) : null;
  return [
    zeile("MRR", k.mrr, z.headline.mrr),
    zeile("ARR", k.arr, z.headline.arr),
    zeile("Aktive Kunden", k.aktiveKunden, z.headline.active),
    zeile("Bruttomarge", k.marge.letzter, z.headline.grossMargin),
    zeile(`Umsatzbindung ${lag ?? "–"} Monate (%)`, b?.nrr != null ? Math.round(b.nrr * 100) : null, z.headline.retention?.pct ?? null),
    zeile("Kündigungsquote", k.kuendigung?.quote ?? null, z.churn?.rate ?? null),
    zeile("CAC", k.cac.cac, z.unit.cac),
    zeile("CAC mit Gründerzeit", k.cac.cacMitGruender, z.unit.cacFounder),
    zeile("Amortisation (Monate)", k.cac.amortisation, z.unit.payback),
    zeile("Amortisation mit Gründerzeit", k.cac.amortisationMitGruender, z.unit.paybackFounder),
    // Übersicht nimmt ohne gemessene Kündigung 24 Monate an, die Auswertung zeigt dann keinen Kundenwert
    zeile("Kundenwert (CLV)", k.clv.wert, k.kuendigung ? z.unit.ltv : null, k.kuendigung ? undefined : "ohne Kündigungsquote kein Kundenwert (Übersicht nimmt 24 Monate an)"),
    zeile("Kundenwert : CAC", k.clv.zuCac, k.kuendigung ? z.unit.ltvCac : null),
  ];
}
