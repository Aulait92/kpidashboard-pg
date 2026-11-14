// Monatsbericht neu (Ole, 14.11.2026): Aufbau, Betreff, E-Mail-HTML (Outlook/Gmail-tauglich, nur
// Tabellen und Inline-Stile, keine Bilder) und Textfassung. Rein, ohne Datenbank: die Zahlen sammelt
// lib/monatsbericht/server mit denselben Funktionen wie /buyer/zahlen. Sie-Form, keine Gedankenstriche.
//
// Abschnitte ohne Daten sind null bzw. leer und entfallen in E-Mail und Ansicht.

import { formatEUR, formatNumber, formatPercent } from "@/lib/format";
import { MONTHS_DE } from "@/lib/monatsbericht/shared";

export { hasDash } from "@/lib/monatsbericht/shared";

export type FunnelStep = {
  key: "leads" | "erreicht" | "termine" | "abschluesse";
  label: string;
  value: number;
  /** Quote 0..1 wie auf /buyer/zahlen (Erreichbarkeit, Termin aus Erreicht, Abschlussquote) */
  rate: number | null;
  rateLabel: string | null;
  previous: number | null;
};

export type ResultLine = { key: "paid" | "empfehlung" | "bestand" | "rueckbelastung" | "leadkosten" | "betreuung"; label: string; amount: number; sign: "+" | "-" };

/**
 * Ergebnis im Monat: Gewinn „Nur jetzt“ und immer auch mit künftigem Bestand (künftige Bestandsprovision der
 * Verträge dieses Monats über 5 Jahre, Prognose). Ältere gespeicherte Berichte haben nur gewinn.
 */
export type ReportResult = { lines: ResultLine[]; gewinn: number; gewinnMitBestand?: number; kuenftigerBestand?: number };

export type ReportBestand = {
  label: string;
  perYear: number;
  contracts: number;
  fromYear2: boolean;
  inYears: number;
  storno: number;
  /** Tatsächliche Stornoquote (erst ab 20 Verträgen, sonst null = zu wenig Daten). Fehlt in älteren Berichten. */
  stornoReal?: number | null;
  perMonth: number;
  years: { year: number; existing: number; added: number; total: number }[];
};

export type ReportEmpfehlungen = { asked: number; empfehlungen: number; abschluesse: number; provision: number };
export type ReportBestandskampagnen = { leads: number; abschluesse: number; provision: number };
export type ReportTip = { key: string; title: string; text: string; href: string; cta: string };

/** Rohe Maßnahme (intern, Grundlage für die KI-Zusammenfassung). */
export type RawMeasure = { source: "optimierung" | "manuell" | "meta" | "mediabuyer" | "kampagne" | "budget"; at: string; text: string };

export type ReportModel = {
  version: 2;
  month: string;
  makler: boolean;
  /** Abschlüsse im Monat (Leads mit Vertrag im Monat, alle Herkünfte), wie „aus N Abschlüssen“ auf /buyer/zahlen */
  closings: number;
  funnel: { steps: FunnelStep[] } | null;
  result: ReportResult | null;
  bestand: ReportBestand | null;
  empfehlungen: ReportEmpfehlungen | null;
  bestandskampagnen: ReportBestandskampagnen | null;
  /** Kundentaugliche Sätze „Was wir für Sie getan haben“ (von der KI zusammengefasst und geprüft) */
  measures: string[];
  tips: ReportTip[];
  // gespraech: nur noch in älteren gespeicherten Berichten, wird nicht mehr angezeigt (Ole, 14.11.2026)
  links: { zahlen: string; gespraech?: string | null };
};

// ─── Betreff ─────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;
const eur0 = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const monthName = (month: string) => MONTHS_DE[Number(month.split("-")[1]) - 1];

/**
 * Betreff mit Ergebnis: „Ihr Oktober: 4 Abschlüsse und 490 € Gewinn“. Bei Gewinn ≤ 0 nie den
 * Verlust, sondern Abschlüsse bzw. Termine (ohne beides: Leads).
 */
export function reportSubject(m: Pick<ReportModel, "month" | "closings" | "result" | "funnel">): string {
  const name = monthName(m.month);
  const gewinn = m.result?.gewinn ?? null;
  if (gewinn != null && Math.round(gewinn) > 0) {
    return m.closings > 0 ? `Ihr ${name}: ${plural(m.closings, "Abschluss", "Abschlüsse")} und ${eur0(gewinn)} Gewinn` : `Ihr ${name}: ${eur0(gewinn)} Gewinn`;
  }
  const step = (k: FunnelStep["key"]) => m.funnel?.steps.find((s) => s.key === k)?.value ?? 0;
  const parts: string[] = [];
  if (m.closings > 0) parts.push(plural(m.closings, "Abschluss", "Abschlüsse"));
  if (step("termine") > 0) parts.push(plural(step("termine"), "Termin", "Termine"));
  if (!parts.length && step("leads") > 0) parts.push(plural(step("leads"), "neuer Lead", "neue Leads"));
  return parts.length ? `Ihr ${name}: ${parts.join(" und ")}` : `Ihr Monatsbericht für ${name}`;
}

// ─── Hilfen ──────────────────────────────────────────────────────────────

/** Betrag mit Vorzeichen (Minuszeichen U+2212, kein Gedankenstrich). */
export const signedEur = (amount: number, sign: "+" | "-") => `${sign === "+" ? "+" : "−"} ${formatEUR(Math.abs(amount))}`;

export const SECTION_TITLES = {
  funnel: "Ihr Vertriebstrichter",
  result: "Ihr Ergebnis im Monat",
  bestand: "Ihr Bestand wächst",
  empfehlungen: "Empfehlungen",
  bestandskampagnen: "Bestandskampagnen",
  measures: "Was wir für Sie getan haben",
  tips: "Unsere Tipps für den nächsten Monat",
} as const;

export const FUNNEL_NOTE = "Nur bezahlte Leads, damit die Quoten stimmen.";
export const BUTTON_ZAHLEN = "Alle Zahlen ansehen";

export function bestandIntro(b: ReportBestand): string {
  return `${b.label} pro Jahr aus allen bisherigen Verträgen: + ${formatEUR(b.perYear)} pro Jahr (aus ${plural(b.contracts, "Vertrag", "Verträgen")}, ${b.fromYear2 ? "ab dem 2. Jahr" : "ab sofort"}).`;
}

const pct1 = (r: number) => `${(Math.round(r * 1000) / 10).toLocaleString("de-DE")} %`;

export function bestandForecastNote(b: ReportBestand): string {
  const real =
    b.stornoReal === undefined ? "" : b.stornoReal != null ? ` Ihre tatsächliche Stornoquote: ${pct1(b.stornoReal)} pro Jahr.` : " Ihre tatsächliche Stornoquote: zu wenig Daten.";
  return `Prognose für 5 Jahre bei gleichem Tempo: ${b.perMonth.toLocaleString("de-DE")} ${b.perMonth === 1 ? "Vertrag" : "Verträge"} pro Monat wie in den letzten 3 Monaten, ${pct1(b.storno)} Storno pro Jahr.${real}`;
}

/** „Gewinn: 490 €, mit künftigem Bestand: 2.590 €“ (beide Zahlen, sobald der Bericht sie hat). */
export function gewinnPairText(r: ReportResult): string {
  return r.gewinnMitBestand != null ? `Gewinn: ${eur0(r.gewinn)}, mit künftigem Bestand: ${eur0(r.gewinnMitBestand)}` : `Gewinn: ${eur0(r.gewinn)}`;
}

export const KUENFTIG_NOTE =
  "Mit künftigem Bestand: plus die künftige Bestandsprovision der Verträge aus diesem Monat über 5 Jahre. Eine Prognose mit Ihrer Stornoquote, ohne Abzinsung.";

export const empfehlungCells = (e: ReportEmpfehlungen) => [
  { label: "Kunden gefragt", value: formatNumber(e.asked) },
  { label: "Empfehlungen", value: formatNumber(e.empfehlungen) },
  { label: "Abschlüsse", value: formatNumber(e.abschluesse) },
  { label: "Provision", value: eur0(e.provision) },
];

export const bestandskampagnenCells = (b: ReportBestandskampagnen) => [
  { label: "Interessenten", value: formatNumber(b.leads) },
  { label: "Abschlüsse", value: formatNumber(b.abschluesse) },
  { label: "Provision", value: eur0(b.provision) },
];

export const rateText = (s: FunnelStep) => (s.rate != null && s.rateLabel ? `${formatPercent(s.rate)} ${s.rateLabel}` : null);

/** Balkenbreite in % des größten Jahreswerts (mindestens 2 %, damit kleine Werte sichtbar bleiben). */
export function barWidths(years: ReportBestand["years"]): { existing: number; added: number }[] {
  const max = Math.max(1, ...years.map((y) => y.total));
  return years.map((y) => {
    const existing = y.existing > 0 ? Math.max(2, Math.round((y.existing / max) * 100)) : 0;
    const added = y.added > 0 ? Math.max(2, Math.round((y.added / max) * 100)) : 0;
    const over = existing + added - 100;
    return over > 0 ? { existing, added: Math.max(0, added - over) } : { existing, added };
  });
}

// ─── E-Mail (HTML) ───────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

const C = { text: "#0b1220", muted: "#64748b", light: "#94a3b8", border: "#e2e8f0", box: "#f8fafc", brand: "#2563eb", brandDark: "#1e3a8a", brandLight: "#93c5fd", plus: "#047857", minus: "#b91c1c" };

const h2 = (t: string) => `<h2 style="margin:28px 0 10px;font-size:17px;line-height:1.3;font-weight:700;color:${C.text}">${esc(t)}</h2>`;
const small = (t: string) => `<p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:${C.muted}">${esc(t)}</p>`;

function cellsTable(cells: { label: string; value: string; sub?: (string | null)[] }[]): string {
  const w = Math.floor(100 / Math.max(1, cells.length));
  const tds = cells
    .map(
      (c) => `<td width="${w}%" valign="top" style="padding:3px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:10px;background:${C.box}"><tr><td style="padding:9px 8px 8px">
    <div style="font-size:12px;line-height:1.3;color:${C.muted}">${esc(c.label)}</div>
    <div style="font-size:18px;line-height:1.3;font-weight:700;color:${C.text};margin-top:2px;white-space:nowrap">${esc(c.value)}</div>
    ${(c.sub ?? [])
      .filter((s): s is string => !!s)
      .map((s) => `<div style="font-size:11px;line-height:1.4;color:${C.muted};margin-top:2px">${esc(s)}</div>`)
      .join("")}
  </td></tr></table>
</td>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr>${tds}</tr></table>`;
}

function funnelHtml(f: NonNullable<ReportModel["funnel"]>): string {
  return (
    h2(SECTION_TITLES.funnel) +
    cellsTable(
      f.steps.map((s) => ({
        label: s.label,
        value: formatNumber(s.value),
        sub: [rateText(s), s.previous != null ? `Vormonat ${formatNumber(s.previous)}` : null],
      })),
    ) +
    small(FUNNEL_NOTE)
  );
}

function resultHtml(r: NonNullable<ReportModel["result"]>): string {
  const row = (label: string, value: string, color: string, strong = false, top = false) =>
    `<tr><td style="padding:7px 0;font-size:14px;line-height:1.4;color:${C.text};${strong ? "font-weight:700;" : ""}${top ? `border-top:2px solid ${C.text};` : `border-bottom:1px solid ${C.border};`}">${esc(label)}</td><td align="right" style="padding:7px 0 7px 12px;font-size:14px;line-height:1.4;white-space:nowrap;color:${color};${strong ? "font-weight:700;" : ""}${top ? `border-top:2px solid ${C.text};` : `border-bottom:1px solid ${C.border};`}">${esc(value)}</td></tr>`;
  const lines = r.lines.map((l) => row(l.label, signedEur(l.amount, l.sign), l.sign === "+" ? C.plus : C.text)).join("");
  const total = row("= Gewinn", formatEUR(r.gewinn), r.gewinn >= 0 ? C.plus : C.minus, true, true);
  const mit =
    r.gewinnMitBestand != null
      ? row(`+ künftige Bestandsprovision (5 Jahre)`, signedEur(r.kuenftigerBestand ?? 0, "+"), C.plus) +
        row("= Gewinn mit künftigem Bestand", formatEUR(r.gewinnMitBestand), r.gewinnMitBestand >= 0 ? C.plus : C.minus, true, true)
      : "";
  return `${h2(SECTION_TITLES.result)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lines}${total}${mit}</table>${small(`Gleiche Rechnung wie in Ihren Zahlen. Betreuung & Software inklusive USt., Gutschriften sind abgezogen, die Einrichtung ist über die Mindestlaufzeit verteilt.${r.gewinnMitBestand != null ? ` ${KUENFTIG_NOTE}` : ""}`)}`;
}

function bestandHtml(b: ReportBestand): string {
  const widths = barWidths(b.years);
  const bar = (w: { existing: number; added: number }) => {
    const rest = Math.max(0, 100 - w.existing - w.added);
    const td = (pct: number, color: string | null) =>
      pct > 0 ? `<td width="${pct}%" height="16"${color ? ` bgcolor="${color}"` : ""} style="height:16px;font-size:0;line-height:0;${color ? `background:${color};` : ""}">&nbsp;</td>` : "";
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${td(w.existing, C.brandDark)}${td(w.added, C.brandLight)}${td(rest, null)}</tr></table>`;
  };
  const rows = b.years
    .map(
      (y, i) =>
        `<tr><td width="58" style="padding:4px 8px 4px 0;font-size:13px;color:${C.muted};white-space:nowrap">${y.year}. Jahr</td><td style="padding:4px 0">${bar(widths[i])}</td><td width="96" align="right" style="padding:4px 0 4px 8px;font-size:13px;font-weight:700;color:${C.text};white-space:nowrap">${esc(formatEUR(Math.round(y.total)))}</td></tr>`,
    )
    .join("");
  const legend = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:6px"><tr>
<td width="10" height="10" bgcolor="${C.brandDark}" style="background:${C.brandDark};font-size:0;line-height:0">&nbsp;</td><td style="padding:0 12px 0 6px;font-size:11px;color:${C.muted}">aus bisherigen Verträgen</td>
<td width="10" height="10" bgcolor="${C.brandLight}" style="background:${C.brandLight};font-size:0;line-height:0">&nbsp;</td><td style="padding:0 0 0 6px;font-size:11px;color:${C.muted}">aus neuen Verträgen im gleichen Tempo</td>
</tr></table>`;
  return `${h2(SECTION_TITLES.bestand)}<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:${C.text}">${esc(bestandIntro(b))}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>${legend}${small(bestandForecastNote(b))}`;
}

function listHtml(items: string[]): string {
  return `<ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6;color:${C.text}">${items.map((t) => `<li style="margin:0 0 6px">${esc(t)}</li>`).join("")}</ul>`;
}

function tipsHtml(tips: ReportTip[], appUrl: string): string {
  const items = tips
    .map(
      (t) =>
        `<li style="margin:0 0 10px"><strong>${esc(t.title)}.</strong> ${esc(t.text)} <a href="${esc(absolute(t.href, appUrl))}" style="color:${C.brand};font-weight:600;text-decoration:none">${esc(t.cta)}</a></li>`,
    )
    .join("");
  return `${h2(SECTION_TITLES.tips)}<ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6;color:${C.text}">${items}</ul>`;
}

function buttonsHtml(links: ReportModel["links"]): string {
  const primary = `<td style="padding:0 8px 8px 0"><a href="${esc(links.zahlen)}" style="display:inline-block;background:${C.brand};color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;border:1px solid ${C.brand}">${BUTTON_ZAHLEN}</a></td>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px"><tr>${primary}</tr></table>`;
}

const absolute = (href: string, appUrl: string) => (/^https?:\/\//.test(href) ? href : `${appUrl}${href.startsWith("/") ? "" : "/"}${href}`);

/** Alle Abschnitte nach dem KI-Einstieg als E-Mail-HTML (Abschnitte ohne Daten entfallen). */
export function reportSectionsHtml(m: ReportModel, appUrl: string): string {
  const parts: string[] = [];
  if (m.funnel) parts.push(funnelHtml(m.funnel));
  if (m.result) parts.push(resultHtml(m.result));
  if (m.bestand) parts.push(bestandHtml(m.bestand));
  if (m.empfehlungen) parts.push(h2(SECTION_TITLES.empfehlungen) + cellsTable(empfehlungCells(m.empfehlungen)));
  if (m.bestandskampagnen) parts.push(h2(SECTION_TITLES.bestandskampagnen) + cellsTable(bestandskampagnenCells(m.bestandskampagnen)));
  if (m.measures.length) parts.push(h2(SECTION_TITLES.measures) + listHtml(m.measures));
  if (m.tips.length) parts.push(tipsHtml(m.tips, appUrl));
  parts.push(buttonsHtml(m.links));
  return `<div data-monatsbericht="2">${parts.join("\n")}</div>`;
}

/** Textfassung derselben Abschnitte (für E-Mail-Programme ohne HTML). */
export function reportSectionsText(m: ReportModel, appUrl: string): string[] {
  const out: string[] = [];
  const head = (t: string) => out.push("", t.toUpperCase());
  if (m.funnel) {
    head(SECTION_TITLES.funnel);
    for (const s of m.funnel.steps) out.push(`${s.label}: ${formatNumber(s.value)}${rateText(s) ? ` (${rateText(s)})` : ""}${s.previous != null ? `, Vormonat ${formatNumber(s.previous)}` : ""}`);
    out.push(FUNNEL_NOTE);
  }
  if (m.result) {
    head(SECTION_TITLES.result);
    for (const l of m.result.lines) out.push(`${signedEur(l.amount, l.sign)}  ${l.label}`);
    out.push(`= ${formatEUR(m.result.gewinn)}  Gewinn`);
    if (m.result.gewinnMitBestand != null) {
      out.push(`${signedEur(m.result.kuenftigerBestand ?? 0, "+")}  künftige Bestandsprovision (5 Jahre)`);
      out.push(`= ${formatEUR(m.result.gewinnMitBestand)}  Gewinn mit künftigem Bestand`);
      out.push(gewinnPairText(m.result));
      out.push(KUENFTIG_NOTE);
    }
  }
  if (m.bestand) {
    head(SECTION_TITLES.bestand);
    out.push(bestandIntro(m.bestand));
    for (const y of m.bestand.years) out.push(`${y.year}. Jahr: ${formatEUR(Math.round(y.total))}`);
    out.push(bestandForecastNote(m.bestand));
  }
  if (m.empfehlungen) {
    head(SECTION_TITLES.empfehlungen);
    out.push(empfehlungCells(m.empfehlungen).map((c) => `${c.label}: ${c.value}`).join(", "));
  }
  if (m.bestandskampagnen) {
    head(SECTION_TITLES.bestandskampagnen);
    out.push(bestandskampagnenCells(m.bestandskampagnen).map((c) => `${c.label}: ${c.value}`).join(", "));
  }
  if (m.measures.length) {
    head(SECTION_TITLES.measures);
    for (const t of m.measures) out.push(`• ${t}`);
  }
  if (m.tips.length) {
    head(SECTION_TITLES.tips);
    for (const t of m.tips) out.push(`• ${t.title}. ${t.text} ${absolute(t.href, appUrl)}`);
  }
  out.push("", `${BUTTON_ZAHLEN}: ${m.links.zahlen}`);
  return out;
}

// ─── Prüfung ─────────────────────────────────────────────────────────────

const norm = (n: number) => String(Math.round(n * 100) / 100);

/** Zahlen, die der KI-Text nennen darf: alle Werte des Berichts (auch gerundet, Vormonat, Differenzen, Prozent). */
export function reportNumbers(m: ReportModel): Set<string> {
  const out = new Set<string>();
  const add = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return;
    for (const v of [n, Math.round(n), Math.round(n * 10) / 10, Math.round(n * 100) / 100, Math.abs(n), Math.abs(Math.round(n))]) out.add(norm(v));
  };
  add(m.closings);
  for (const s of m.funnel?.steps ?? []) {
    add(s.value);
    add(s.previous);
    if (s.previous != null) {
      add(s.value - s.previous);
      if (s.previous !== 0) add(((s.value - s.previous) / s.previous) * 100);
    }
    if (s.rate != null) {
      add(s.rate * 100);
      add(Math.round(s.rate * 1000) / 10);
    }
  }
  for (const l of m.result?.lines ?? []) add(l.amount);
  add(m.result?.gewinn);
  add(m.result?.gewinnMitBestand);
  add(m.result?.kuenftigerBestand);
  if (m.bestand) {
    const b = m.bestand;
    for (const n of [b.perYear, b.contracts, b.inYears, b.storno * 100, b.perMonth]) add(n);
    if (b.stornoReal != null) add(b.stornoReal * 100);
    for (const y of b.years) for (const n of [y.year, y.total, y.existing, y.added]) add(n);
  }
  for (const n of Object.values(m.empfehlungen ?? {})) add(n);
  for (const n of Object.values(m.bestandskampagnen ?? {})) add(n);
  const [y, mo] = m.month.split("-").map(Number);
  add(y);
  add(mo);
  // feste Werte für Einstieg/Abschluss („in 5 Jahren“, „15 Minuten“)
  for (const n of [1, 2, 3, 5, 15]) add(n);
  return out;
}

const eurPattern = (n: number) => {
  const r = Math.round(n);
  const plain = Math.abs(r).toLocaleString("de-DE");
  return [plain, plain.replace(/\./g, ""), formatEUR(Math.abs(n)).replace(/\s*€$/, "").replace(/\u00a0/g, " ").trim()];
};

/**
 * Nennt der Text den Gewinn, dann immer beide Zahlen (Ole, 14.11.2026): „Gewinn: 490 €, mit künftigem
 * Bestand: 2.590 €“. Gibt eine Beanstandung zurück oder null.
 */
export function checkGewinnPair(text: string, r: ReportResult | null): string | null {
  if (!r || r.gewinnMitBestand == null || !/gewinn/i.test(text)) return null;
  const has = (n: number) => eurPattern(n).some((p) => p && text.includes(p));
  const nowShown = has(r.gewinn);
  const mitShown = has(r.gewinnMitBestand);
  if (nowShown === mitShown) return null;
  return `Gewinn bitte immer mit beiden Zahlen nennen: ${gewinnPairText(r)}.`;
}
