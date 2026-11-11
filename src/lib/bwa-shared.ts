// BWA (vereinfachte betriebswirtschaftliche Auswertung) – Aggregation ohne
// Datenbank (getestet) und CSV-Export. Alle Beträge netto in EUR.
//
// Zeilen: Umsatzerlöse → Direkte Kosten → Rohertrag → Kundengewinnung →
// Sonstiger Betrieb → Betriebsergebnis (vor Steuern, ohne Unternehmerlohn).

export type BwaSection = "umsatz" | "direkt" | "akquise" | "betrieb";

/** Ein Posten (Buchung, Kunde, Kampagne …) für „Woraus besteht das?“. */
export type BwaItem = {
  month: string;
  /** Zeilenschlüssel, z. B. "umsatz:ppl" oder "betrieb:Steuerberater" */
  line: string;
  label: string;
  /** Datum (YYYY-MM-DD) bei Einzelbuchungen */
  date?: string | null;
  /** Netto-Betrag (positiv = Umsatz bzw. Kosten) */
  net: number;
  /** Brutto bei Bankbuchungen */
  gross?: number | null;
  detail?: string | null;
  href?: string | null;
};

export type BwaInput = {
  months: string[];
  current: string;
  items: BwaItem[];
  /** Feste Zeilen je Abschnitt in dieser Reihenfolge (auch ohne Werte anzeigen) */
  fixedLines: { section: BwaSection; line: string; label: string }[];
  /** Ab diesem Monat liegen Bankdaten vor; davor fehlen Betriebskosten */
  bankFrom: string | null;
  /** Kleine Betriebs-Posten (< share der Betriebskosten im Zeitraum) zu „Sonstiges“ zusammenfassen */
  smallShare?: number;
};

export type BwaRowKind = "header" | "line" | "sum" | "result" | "pct";
export type BwaRow = {
  key: string;
  label: string;
  kind: BwaRowKind;
  section?: BwaSection;
  /** Vorzeichen in der Anzeige: Kosten werden negativ dargestellt */
  values: (number | null)[];
  total: number | null;
  /** Für „Woraus besteht das?“: Zeilenschlüssel der Posten */
  lines?: string[];
};

export type Bwa = {
  months: string[];
  current: string;
  incomplete: string[];
  rows: BwaRow[];
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const sumBy = (items: BwaItem[], months: string[], lines: string[]) =>
  months.map((m) => r2(items.filter((i) => i.month === m && lines.includes(i.line)).reduce((s, i) => s + i.net, 0)));
const total = (v: (number | null)[]) => r2(v.reduce<number>((s, x) => s + (x ?? 0), 0));
const pctOf = (a: number, b: number) => (b > 0 ? r2((a / b) * 100) : null);

export const SECTION_LABEL: Record<BwaSection, string> = {
  umsatz: "Umsatzerlöse",
  direkt: "Direkte Kosten",
  akquise: "Kundengewinnung",
  betrieb: "Sonstiger Betrieb",
};

export function sectionOf(line: string): BwaSection {
  return line.split(":")[0] as BwaSection;
}

/**
 * Betriebs-Posten unter `smallShare` der Betriebskosten im Zeitraum werden zu
 * „Sonstiges“ (Zeile betrieb:Sonstiges) zusammengefasst.
 */
export function groupSmallBetrieb(items: BwaItem[], months: string[], smallShare = 0.01): BwaItem[] {
  const inRange = items.filter((i) => months.includes(i.month));
  const betrieb = inRange.filter((i) => sectionOf(i.line) === "betrieb");
  const sum = betrieb.reduce((s, i) => s + i.net, 0);
  if (sum <= 0) return inRange;
  const perLine = new Map<string, number>();
  for (const i of betrieb) perLine.set(i.line, (perLine.get(i.line) ?? 0) + i.net);
  const small = new Set([...perLine.entries()].filter(([, v]) => v < sum * smallShare).map(([k]) => k));
  // Nur zusammenfassen, wenn es mehr als einen kleinen Posten gibt
  if (small.size < 2) return inRange;
  return inRange.map((i) => {
    if (!small.has(i.line)) return i;
    const group = i.line.slice("betrieb:".length);
    return { ...i, line: "betrieb:Sonstiges", detail: i.detail ? `${group} · ${i.detail}` : group };
  });
}

export function buildBwa(input: BwaInput): Bwa {
  const { months, current } = input;
  const items = groupSmallBetrieb(input.items, months, input.smallShare ?? 0.01);
  const rows: BwaRow[] = [];
  const sectionLines = (section: BwaSection) => {
    const fixed = input.fixedLines.filter((l) => l.section === section);
    const seen = new Set(fixed.map((l) => l.line));
    const extra = new Map<string, number>();
    for (const i of items) {
      if (sectionOf(i.line) !== section || seen.has(i.line)) continue;
      extra.set(i.line, (extra.get(i.line) ?? 0) + i.net);
    }
    const dyn = [...extra.entries()]
      .sort((a, b) => (a[0] === "betrieb:Sonstiges" ? 1 : b[0] === "betrieb:Sonstiges" ? -1 : b[1] - a[1]))
      .map(([line]) => ({ section, line, label: line.slice(section.length + 1) }));
    return [...fixed, ...dyn];
  };

  const sections: BwaSection[] = ["umsatz", "direkt", "akquise", "betrieb"];
  const sums = {} as Record<BwaSection, number[]>;
  for (const section of sections) {
    const lines = sectionLines(section);
    rows.push({ key: `h:${section}`, label: SECTION_LABEL[section], kind: "header", section, values: months.map(() => null), total: null });
    for (const l of lines) {
      const v = sumBy(items, months, [l.line]);
      rows.push({ key: l.line, label: l.label, kind: "line", section, values: v, total: total(v), lines: [l.line] });
    }
    const all = lines.map((l) => l.line);
    sums[section] = sumBy(items, months, all);
    rows.push({
      key: `s:${section}`,
      label: section === "umsatz" ? "Summe Umsatz" : `Summe ${SECTION_LABEL[section]}`,
      kind: "sum",
      section,
      values: sums[section],
      total: total(sums[section]),
      lines: all,
    });
    if (section === "direkt") {
      const roh = months.map((_, i) => r2(sums.umsatz[i] - sums.direkt[i]));
      rows.push({ key: "r:rohertrag", label: "Rohertrag", kind: "result", values: roh, total: total(roh) });
      rows.push({
        key: "p:rohertrag",
        label: "Rohertragsquote",
        kind: "pct",
        values: months.map((_, i) => pctOf(roh[i], sums.umsatz[i])),
        total: pctOf(total(roh), total(sums.umsatz)),
      });
    }
  }
  const ergebnis = months.map((_, i) => r2(sums.umsatz[i] - sums.direkt[i] - sums.akquise[i] - sums.betrieb[i]));
  rows.push({ key: "r:ergebnis", label: "Betriebsergebnis", kind: "result", values: ergebnis, total: total(ergebnis) });
  rows.push({
    key: "p:ergebnis",
    label: "Ergebnismarge",
    kind: "pct",
    values: months.map((_, i) => pctOf(ergebnis[i], sums.umsatz[i])),
    total: pctOf(total(ergebnis), total(sums.umsatz)),
  });
  let run = 0;
  const kum = ergebnis.map((v) => (run = r2(run + v)));
  rows.push({ key: "r:kumuliert", label: "Ergebnis kumuliert", kind: "result", values: kum, total: kum.length ? kum[kum.length - 1] : 0 });

  const incomplete = input.bankFrom ? months.filter((m) => m < input.bankFrom!) : [...months];
  return { months, current, incomplete, rows };
}

/** Wie die Zeile angezeigt wird: Kosten negativ, Ergebnisse mit Vorzeichen. */
export function displaySign(row: BwaRow): 1 | -1 {
  return row.section && row.section !== "umsatz" && (row.kind === "line" || row.kind === "sum") ? -1 : 1;
}

const deNum = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const csvCell = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV für den Steuerberater: Semikolon, deutsche Zahlen, Kosten negativ. */
export function bwaCsv(bwa: Bwa, monthLabel: (m: string) => string): string {
  const head = ["Position", ...bwa.months.map((m) => `${monthLabel(m)}${m === bwa.current ? " (bisher)" : ""}`), "Summe"];
  const lines = [head.map(csvCell).join(";")];
  for (const r of bwa.rows) {
    if (r.kind === "header") {
      lines.push([r.label, ...bwa.months.map(() => ""), ""].map(csvCell).join(";"));
      continue;
    }
    const sign = displaySign(r);
    const fmt = (v: number | null) => (v == null ? "" : r.kind === "pct" ? `${deNum(v)} %` : deNum(sign * v));
    lines.push([r.kind === "line" ? `  ${r.label}` : r.label, ...r.values.map(fmt), fmt(r.total)].map(csvCell).join(";"));
  }
  return lines.join("\r\n") + "\r\n";
}
