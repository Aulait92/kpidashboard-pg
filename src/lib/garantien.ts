// Garantien (AGB „Garantien“): Lead-Garantie (30 aktive Tage), für Vertreter
// die Break-even-Garantie und für Makler die Vertrags-Garantie (beide ab
// 90 aktiven Tagen, monatlich, längstens 6 Monate).
// Reine Bewertung ohne Datenbank – Laden, Cron und Gewähren stehen in
// lib/garantien-server.ts. Regeln und Annahmen: docs/garantien.md.
//
// Eckwerte kommen aus der Rechner-Konfiguration (Mindest-Leads je Produkt,
// Mindestbudget pro Tag, An/Aus) und GARANTIE_FRISTEN (rechner.ts).

import { GARANTIE_FRISTEN, VERTRAGS_GARANTIE_MIN_VERTRAEGE, type RechnerConfig } from "@/lib/rechner";
import { addMonths, dayKey, monthKey, monthRange, retainerRows, type RetainerInput } from "@/lib/revenue-ledger";

/** Ab diesem Datum erstellte Angebote zeigen die neuen Garantien (ältere behalten ihren Text). */
export const GUARANTEES_FROM = new Date("2026-11-11T00:00:00+01:00");
/** Garantien gelten für Katzenversicherung (TKV), siehe AGB „Garantien“. */
export const isGuaranteeProduct = (name: string) => /katze|\btkv\b|tierkranken/i.test(name);

export type GarantieArt = "lead" | "breakeven" | "vertrag";
export type GarantieStatus = "nicht_gestartet" | "laeuft" | "erfuellt" | "anspruch" | "bedingungen_fehlen" | "abgelaufen" | "nicht_anwendbar";
export type FallStatus = "offen" | "gewaehrt" | "abgelehnt";

export const GARANTIE_LABEL: Record<GarantieArt, string> = { lead: "Lead-Garantie", breakeven: "Break-even-Garantie", vertrag: "Vertrags-Garantie" };
/** Was im Garantiemonat kostenlos ist: Lead- und Vertrags-Garantie alles, Break-even nur Betreuung. */
export const GARANTIE_UMFANG: Record<GarantieArt, "all" | "service"> = { lead: "all", breakeven: "service", vertrag: "all" };
export const STATUS_LABEL: Record<GarantieStatus, string> = {
  nicht_gestartet: "Noch nicht gestartet",
  laeuft: "Läuft",
  erfuellt: "Erfüllt",
  anspruch: "Anspruch",
  bedingungen_fehlen: "Bedingungen fehlen",
  abgelaufen: "Abgelaufen",
  nicht_anwendbar: "Nicht anwendbar",
};
export const FALL_LABEL: Record<FallStatus, string> = { offen: "Offen", gewaehrt: "Gewährt", abgelehnt: "Abgelehnt" };

/** Leads jünger als so viele Tage zählen bei „Ergebnisse eingetragen“ nicht mit (noch in Bearbeitung). */
export const ERGEBNIS_KARENZ_TAGE = 3;

export type GarantieRegeln = {
  lead: { aktiv: boolean; minLeads: number; tage: number };
  breakeven: { aktiv: boolean; tage: number; quote: number; maxFreiMonate: number };
  /** Makler statt Break-even; gleicher Schalter wie Break-even (zweite Garantie) */
  vertrag: { aktiv: boolean; tage: number; minVertraege: number; quote: number; maxFreiMonate: number };
  minBudgetPerDay: number;
};

/** Regeln aus der Rechner-Konfiguration (Mindest-Leads: erstes Garantie-Produkt mit minLeads30). */
export function regelnAus(config: RechnerConfig): GarantieRegeln {
  const p = config.products.find((x) => x.minLeads30 != null && (isGuaranteeProduct(x.name) || isGuaranteeProduct(x.match)));
  return {
    lead: { aktiv: config.guarantees.leads.enabled && p?.minLeads30 != null, minLeads: p?.minLeads30 ?? 0, tage: GARANTIE_FRISTEN.leadTage },
    breakeven: {
      aktiv: config.guarantees.breakEven.enabled,
      tage: GARANTIE_FRISTEN.breakEvenTage,
      quote: GARANTIE_FRISTEN.quote,
      maxFreiMonate: GARANTIE_FRISTEN.maxFreiMonate,
    },
    vertrag: {
      aktiv: config.guarantees.breakEven.enabled,
      tage: GARANTIE_FRISTEN.breakEvenTage,
      minVertraege: VERTRAGS_GARANTIE_MIN_VERTRAEGE,
      quote: GARANTIE_FRISTEN.quote,
      maxFreiMonate: GARANTIE_FRISTEN.maxFreiMonate,
    },
    minBudgetPerDay: config.guarantees.leads.minBudgetPerDay,
  };
}

/** Gilt die Garantie für dieses Angebot? Angenommen, ab GUARANTEES_FROM erstellt, mit Katze/TKV. */
export function offerHasGuarantee(offer: { status: string; createdAt: Date; products: unknown } | null | undefined): boolean {
  if (!offer || offer.status !== "accepted" || offer.createdAt < GUARANTEES_FROM) return false;
  const products = Array.isArray(offer.products) ? (offer.products as { name?: unknown }[]) : [];
  return products.some((p) => typeof p?.name === "string" && isGuaranteeProduct(p.name));
}

// ─── Eingaben ────────────────────────────────────────────────────────────

export type GarantieInput = {
  now: Date;
  /** Kampagnenstart (erste Auslieferung) – siehe startDatum() */
  start: Date | null;
  startQuelle: "meta" | "live" | null;
  /** Meta-Kosten je Tag */
  spend: { date: Date; amount: number }[];
  /** Angewendete Pausen jeder Art (Urlaub, Krankheit, Zahlungsverzug): verlängern den Zeitraum */
  pausen: { from: Date; to: Date | null }[];
  /** Zum Prüfzeitpunkt offene Rechnung / laufender Zahlungsverzug */
  offeneRechnung: boolean;
  /** Leads seit Start (ohne anerkannte Reklamationen) */
  leads: { createdAt: Date; source: string | null; status: string | null }[];
  /** Abschlüsse seit Start mit geschätzter Provision (Sätze des Kunden) */
  abschluesse: { at: Date; provision: number }[];
  /** Über die Software gebuchte Termine seit Start (ohne abgesagte) */
  termine: { startsAt: Date; status: string }[];
  /** Eigene Provisionssätze unter „Meine Provisionen“ hinterlegt */
  provisionssaetze: boolean;
  /** Vertreter: Break-even-Garantie; Makler (nur Bestandsprovision): Vertrags-Garantie */
  vermittlerTyp: "vertreter" | "makler";
  /** Betreuung/Software des Kunden (Basis wie im Umsatzbuch); null = keine Vergütung */
  retainer: RetainerInput | null;
  /** Bereits angelegte Fälle des Kunden */
  faelle: { art: GarantieArt; monat: string; status: FallStatus }[];
};

/**
 * Kampagnenstart = erster Tag mit Meta-Kosten > 0 ab Annahme des Angebots
 * („Tag der ersten Auslieferung der Anzeigen“). Ohne Meta-Daten: Go-live aus
 * dem Onboarding. Sonst nicht gestartet.
 */
export function startDatum(
  spend: { date: Date; amount: number }[],
  acceptedAt: Date | null,
  liveAt: Date | null,
): { start: Date | null; quelle: "meta" | "live" | null } {
  const ab = acceptedAt ? dayKey(acceptedAt) : "";
  const first = spend
    .filter((s) => s.amount > 0 && dayKey(s.date) >= ab)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  if (first) return { start: first.date, quelle: "meta" };
  if (liveAt) return { start: liveAt, quelle: "live" };
  return { start: null, quelle: null };
}

// ─── Ergebnis ────────────────────────────────────────────────────────────

export type Bedingung = { key: "budget" | "rechnung" | "termine" | "ergebnisse" | "provisionssaetze"; ok: boolean; text: string };

export type Kennzahlen = {
  status: GarantieStatus;
  /** aktive Tage bis heute (inkl. heute) und Ziel */
  tag: number;
  tage: number;
  pausenTage: number;
  start: string | null;
  startQuelle: "meta" | "live" | null;
  /** letzter Tag des Prüfzeitraums (bei laufender Garantie voraussichtlich) */
  ende: string | null;
  budgetSchnitt: number | null;
  minBudget: number;
  leads?: number;
  minLeads?: number;
  provision?: number;
  /** Vertrags-Garantie: Abschlüsse seit Start und Mindestzahl */
  vertraege?: number;
  minVertraege?: number;
  kosten?: number;
  werbebudget?: number;
  betreuung?: number;
  termine?: number;
  terminQuote?: number | null;
  leadsGeprueft?: number;
  ergebnisQuote?: number | null;
  /** Monat, der kostenlos wird (YYYY-MM) */
  monat?: string | null;
  /** Break-even/Vertrags-Garantie: der wievielte kostenlose Monat (1–6) */
  freiMonatNr?: number;
  /** Nettobetrag der Gutschrift für `monat` */
  betrag?: number;
};

export type GarantieErgebnis = {
  art: GarantieArt;
  status: GarantieStatus;
  kennzahlen: Kennzahlen;
  bedingungen: Bedingung[];
  /** Texte der nicht erfüllten Bedingungen */
  fehlend: string[];
  periodeVon: Date | null;
  periodeBis: Date | null;
};

// ─── Tage ────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
/** Berliner Kalendertag als UTC-Mitternacht (ms) */
const dayNum = (d: Date) => Date.parse(`${dayKey(d)}T00:00:00Z`);
const keyOf = (n: number) => new Date(n).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (q: number) => `${Math.round(q * 100)} %`;
const eur0 = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

/** Pausentage bis heute (offene Pausen laufen bis heute). Zukünftige Tage gelten als aktiv. */
function pausedDays(pausen: GarantieInput["pausen"], today: number): Set<number> {
  const out = new Set<number>();
  for (const p of pausen) {
    const from = dayNum(p.from);
    const to = Math.min(p.to ? dayNum(p.to) : today, today);
    for (let d = from; d <= to; d += DAY) out.add(d);
  }
  return out;
}

/** Letzter Tag des Zeitraums: der n-te aktive Tag ab Start. */
function nthActiveDay(start: number, n: number, paused: Set<number>): number {
  let count = 0;
  let d = start;
  for (let guard = 0; guard < 5000; guard++, d += DAY) {
    if (!paused.has(d)) count++;
    if (count >= n) return d;
  }
  return d;
}

function activeBetween(from: number, to: number, paused: Set<number>): number[] {
  const out: number[] = [];
  for (let d = from; d <= to; d += DAY) if (!paused.has(d)) out.push(d);
  return out;
}

// ─── Bedingungen ─────────────────────────────────────────────────────────

function budgetBedingung(i: GarantieInput, tage: number[], min: number): { b: Bedingung; schnitt: number | null } {
  const set = new Set(tage);
  const sum = i.spend.filter((s) => set.has(dayNum(s.date))).reduce((n, s) => n + s.amount, 0);
  const schnitt = tage.length ? r2(sum / tage.length) : null;
  const ok = schnitt != null && schnitt >= min;
  const text =
    schnitt == null
      ? `Noch keine Meta-Kosten erfasst (mind. ${eur0(min)} pro Tag)`
      : ok
        ? `Ø ${eur0(schnitt)} Werbebudget pro aktivem Tag (mind. ${eur0(min)})`
        : `Werbebudget nur Ø ${eur0(schnitt)} pro Tag (mind. ${eur0(min)})`;
  return { b: { key: "budget", ok, text }, schnitt };
}

const rechnungBedingung = (offen: boolean): Bedingung =>
  offen ? { key: "rechnung", ok: false, text: "Offene Rechnung (Zahlungsverzug)" } : { key: "rechnung", ok: true, text: "Keine offene Rechnung" };

/** Wahrgenommen = erledigt; nicht erschienen und vergangene, nie abgeschlossene Termine zählen dagegen. */
export function terminQuote(termine: GarantieInput["termine"], now: Date): { n: number; quote: number | null } {
  const past = termine.filter((t) => t.status !== "cancelled" && t.startsAt < now);
  if (!past.length) return { n: 0, quote: null };
  return { n: past.length, quote: past.filter((t) => t.status === "completed").length / past.length };
}

/** Ergebnis eingetragen = Status gesetzt und nicht mehr „Neuer Lead“. Junge Leads (Karenz) zählen nicht mit. */
export function ergebnisQuote(leads: GarantieInput["leads"], now: Date): { n: number; quote: number | null } {
  const cutoff = now.getTime() - ERGEBNIS_KARENZ_TAGE * DAY;
  const rel = leads.filter((l) => l.createdAt.getTime() <= cutoff);
  if (!rel.length) return { n: 0, quote: null };
  return { n: rel.length, quote: rel.filter((l) => l.status && l.status !== "Neuer Lead").length / rel.length };
}

/** Bedingungen „Termine wahrgenommen“ und „Ergebnisse eingetragen“ (Break-even und Vertrags-Garantie). */
function quotenBedingungen(i: GarantieInput, start: number, q: number) {
  const termine = terminQuote(i.termine.filter((t) => dayNum(t.startsAt) >= start), i.now);
  const ergebnisse = ergebnisQuote(i.leads.filter((l) => dayNum(l.createdAt) >= start), i.now);
  const bedingungen: Bedingung[] = [
    termine.quote == null
      ? { key: "termine", ok: true, text: "Noch keine vergangenen Termine aus der Software" }
      : termine.quote >= q
        ? { key: "termine", ok: true, text: `${pct(termine.quote)} der Termine wahrgenommen (mind. ${pct(q)})` }
        : { key: "termine", ok: false, text: `Termine nur zu ${pct(termine.quote)} wahrgenommen (mind. ${pct(q)})` },
    ergebnisse.quote == null
      ? { key: "ergebnisse", ok: true, text: "Noch keine Leads zum Auswerten" }
      : ergebnisse.quote >= q
        ? { key: "ergebnisse", ok: true, text: `Ergebnisse bei ${pct(ergebnisse.quote)} der Leads eingetragen (mind. ${pct(q)})` }
        : { key: "ergebnisse", ok: false, text: `Ergebnisse nur bei ${pct(ergebnisse.quote)} der Leads eingetragen (mind. ${pct(q)})` },
  ];
  return { termine, ergebnisse, bedingungen };
}

// ─── Kosten ──────────────────────────────────────────────────────────────

/** Kostenlose Monate aus gewährten Fällen (Lead-/Vertrags-Garantie: alles, Break-even: Betreuung). */
export function freeMonthsOf(faelle: GarantieInput["faelle"]): Record<string, "all" | "service"> {
  const out: Record<string, "all" | "service"> = {};
  for (const f of faelle) {
    if (f.status !== "gewaehrt") continue;
    out[f.monat] = GARANTIE_UMFANG[f.art] === "all" || out[f.monat] === "all" ? "all" : "service";
  }
  return out;
}

/** Betreuung/Software (netto) im Zeitraum von–bis, ohne gewährte Monate. */
export function betreuungKosten(retainer: RetainerInput | null, von: Date, bis: Date, faelle: GarantieInput["faelle"]): number {
  if (!retainer) return 0;
  const end = retainer.end && retainer.end < bis ? retainer.end : bis;
  const rows = retainerRows({ ...retainer, countFrom: von, end, freeMonths: freeMonthsOf(faelle) }, monthRange(monthKey(von), monthKey(bis)), monthKey(bis));
  return r2(rows.reduce((n, r) => n + r.amount, 0));
}

/** Gutschrift netto für einen ganzen Monat: Lead-/Vertrags-Garantie Betreuung + Software, Break-even nur Betreuung. */
export function gutschriftBetrag(retainer: RetainerInput | null, monat: string, art: GarantieArt): number {
  if (!retainer) return 0;
  const rows = retainerRows({ ...retainer, end: null, pauses: [], countFrom: null, freeMonths: undefined }, [monat], monat);
  return r2(rows.filter((r) => GARANTIE_UMFANG[art] === "all" || r.stream === "service").reduce((n, r) => n + r.amount, 0));
}

// ─── Bewertung ───────────────────────────────────────────────────────────

function basis(i: GarantieInput, art: GarantieArt, tageZiel: number, min: number) {
  const today = dayNum(i.now);
  const start = dayNum(i.start!);
  const paused = pausedDays(i.pausen, today);
  const end = nthActiveDay(start, tageZiel, paused);
  const tag = activeBetween(start, Math.min(today, end), paused).length;
  const pausenTage = [...paused].filter((d) => d >= start && d <= Math.min(today, end)).length;
  const done = today > end;
  const kz: Kennzahlen = {
    status: "laeuft",
    tag,
    tage: tageZiel,
    pausenTage,
    start: keyOf(start),
    startQuelle: i.startQuelle,
    ende: keyOf(end),
    budgetSchnitt: null,
    minBudget: min,
  };
  return { art, today, start, end, paused, done, kz };
}

function finish(art: GarantieArt, status: GarantieStatus, kz: Kennzahlen, bedingungen: Bedingung[], von: Date | null, bis: Date | null): GarantieErgebnis {
  kz.status = status;
  return { art, status, kennzahlen: kz, bedingungen, fehlend: bedingungen.filter((b) => !b.ok).map((b) => b.text), periodeVon: von, periodeBis: bis };
}

function nichtGestartet(art: GarantieArt, tage: number, min: number): GarantieErgebnis {
  return finish(
    art,
    "nicht_gestartet",
    { status: "nicht_gestartet", tag: 0, tage, pausenTage: 0, start: null, startQuelle: null, ende: null, budgetSchnitt: null, minBudget: min },
    [],
    null,
    null,
  );
}

/**
 * Lead-Garantie: weniger als `minLeads` Leads in den ersten 30 aktiven Tagen
 * bei Ø ≥ Mindestbudget je aktivem Tag → Betreuung + Software im Folgemonat
 * kostenlos. Pausen verlängern den Zeitraum; laufender Zahlungsverzug zum
 * Prüfzeitpunkt verhindert die Gewährung.
 */
export function bewerteLeadGarantie(i: GarantieInput, r: GarantieRegeln): GarantieErgebnis {
  const min = r.minBudgetPerDay;
  if (!i.start) return nichtGestartet("lead", r.lead.tage, min);
  const b = basis(i, "lead", r.lead.tage, min);
  const von = new Date(b.start);
  const bis = new Date(b.end);
  const tage = activeBetween(b.start, Math.min(b.end, b.today - DAY), b.paused);
  const budget = budgetBedingung(i, tage, min);
  const leads = i.leads.filter((l) => {
    const d = dayNum(l.createdAt);
    return d >= b.start && d <= b.end && isGuaranteeProduct(l.source ?? "");
  }).length;
  Object.assign(b.kz, { leads, minLeads: r.lead.minLeads, budgetSchnitt: budget.schnitt });
  const bedingungen = [budget.b, rechnungBedingung(i.offeneRechnung)];
  if (!b.done) return finish("lead", "laeuft", b.kz, bedingungen, von, bis);
  if (leads >= r.lead.minLeads) return finish("lead", "erfuellt", b.kz, bedingungen, von, bis);
  const monat = addMonths(monthKey(bis), 1);
  Object.assign(b.kz, { monat, betrag: gutschriftBetrag(i.retainer, monat, "lead") });
  return finish("lead", bedingungen.every((x) => x.ok) ? "anspruch" : "bedingungen_fehlen", b.kz, bedingungen, von, bis);
}

/**
 * Break-even-Garantie: ab dem 90. aktiven Tag monatlich prüfen, ob die
 * Provision seit Start die Kosten (Meta + Betreuung/Software, netto) erreicht.
 * Wenn nicht und alle Bedingungen erfüllt: Betreuung im laufenden Monat
 * kostenlos – längstens 6 Monate ab dem Monat der ersten Prüfung.
 * Nur für Vertreter; Makler: „nicht anwendbar“ (dort gilt die Vertrags-Garantie).
 */
export function bewerteBreakEven(i: GarantieInput, r: GarantieRegeln): GarantieErgebnis {
  const min = r.minBudgetPerDay;
  const be = r.breakeven;
  // Makler bekommen nur Bestandsprovision und lägen nach 90 Tagen immer unter den Kosten
  if (i.vermittlerTyp === "makler") {
    const e = nichtGestartet("breakeven", be.tage, min);
    return finish("breakeven", "nicht_anwendbar", e.kennzahlen, [], null, null);
  }
  if (!i.start) return nichtGestartet("breakeven", be.tage, min);
  const b = basis(i, "breakeven", be.tage, min);
  const von = new Date(b.start);
  const bis = i.now;
  const aktiveTage = activeBetween(b.start, b.today - DAY, b.paused);
  const budget = budgetBedingung(i, aktiveTage, min);
  const werbebudget = r2(i.spend.filter((s) => dayNum(s.date) >= b.start && s.date <= i.now).reduce((n, s) => n + s.amount, 0));
  const betreuung = betreuungKosten(i.retainer, von, bis, i.faelle);
  const provision = r2(i.abschluesse.filter((a) => dayNum(a.at) >= b.start && a.at <= i.now).reduce((n, a) => n + a.provision, 0));
  const q = be.quote;
  const { termine, ergebnisse, bedingungen: quoten } = quotenBedingungen(i, b.start, q);
  Object.assign(b.kz, {
    budgetSchnitt: budget.schnitt,
    provision,
    werbebudget,
    betreuung,
    kosten: r2(werbebudget + betreuung),
    termine: termine.n,
    terminQuote: termine.quote,
    leadsGeprueft: ergebnisse.n,
    ergebnisQuote: ergebnisse.quote,
  });
  const bedingungen: Bedingung[] = [
    budget.b,
    ...quoten,
    i.provisionssaetze
      ? { key: "provisionssaetze", ok: true, text: "Provisionssätze hinterlegt" }
      : { key: "provisionssaetze", ok: false, text: "Keine eigenen Provisionssätze unter „Meine Provisionen“ hinterlegt" },
    rechnungBedingung(i.offeneRechnung),
  ];
  // Vor Tag 90: läuft (Fortschritt), Bedingungen als Vorschau
  if (!b.done) return finish("breakeven", "laeuft", b.kz, bedingungen, von, new Date(b.end));
  // Erster Garantiemonat = Monat der ersten Prüfung (Tag nach dem 90. aktiven Tag)
  const m0 = monthKey(new Date(b.end + DAY + 12 * 3_600_000));
  const last = addMonths(m0, be.maxFreiMonate - 1);
  const mc = monthKey(i.now);
  if (provision >= b.kz.kosten!) return finish("breakeven", "erfuellt", b.kz, bedingungen, von, bis);
  const gewaehrt = i.faelle.filter((f) => f.art === "breakeven" && f.status === "gewaehrt").length;
  if (mc > last || gewaehrt >= be.maxFreiMonate) return finish("breakeven", "abgelaufen", b.kz, bedingungen, von, bis);
  const nr = monthRange(m0, mc).length;
  Object.assign(b.kz, { monat: mc, freiMonatNr: nr, betrag: gutschriftBetrag(i.retainer, mc, "breakeven") });
  return finish("breakeven", bedingungen.every((x) => x.ok) ? "anspruch" : "bedingungen_fehlen", b.kz, bedingungen, von, bis);
}

/**
 * Vertrags-Garantie (nur Makler): ab dem 90. aktiven Tag monatlich prüfen,
 * ob seit Start mindestens `minVertraege` Verträge eingetragen sind (je Lead
 * mit Abschluss ein Vertrag). Wenn nicht und alle Bedingungen erfüllt:
 * Betreuung + Software im laufenden Monat kostenlos – bis die Zahl erreicht
 * ist, längstens 6 Monate ab dem Monat der ersten Prüfung.
 */
export function bewerteVertragsGarantie(i: GarantieInput, r: GarantieRegeln): GarantieErgebnis {
  const min = r.minBudgetPerDay;
  const vg = r.vertrag;
  if (i.vermittlerTyp !== "makler") {
    const e = nichtGestartet("vertrag", vg.tage, min);
    return finish("vertrag", "nicht_anwendbar", e.kennzahlen, [], null, null);
  }
  if (!i.start) return nichtGestartet("vertrag", vg.tage, min);
  const b = basis(i, "vertrag", vg.tage, min);
  const von = new Date(b.start);
  const bis = i.now;
  const budget = budgetBedingung(i, activeBetween(b.start, b.today - DAY, b.paused), min);
  const vertraege = i.abschluesse.filter((a) => dayNum(a.at) >= b.start && a.at <= i.now).length;
  const { termine, ergebnisse, bedingungen: quoten } = quotenBedingungen(i, b.start, vg.quote);
  Object.assign(b.kz, {
    budgetSchnitt: budget.schnitt,
    vertraege,
    minVertraege: vg.minVertraege,
    termine: termine.n,
    terminQuote: termine.quote,
    leadsGeprueft: ergebnisse.n,
    ergebnisQuote: ergebnisse.quote,
  });
  const bedingungen: Bedingung[] = [budget.b, ...quoten, rechnungBedingung(i.offeneRechnung)];
  if (vertraege >= vg.minVertraege) return finish("vertrag", "erfuellt", b.kz, bedingungen, von, bis);
  if (!b.done) return finish("vertrag", "laeuft", b.kz, bedingungen, von, new Date(b.end));
  // Erster Garantiemonat = Monat der ersten Prüfung (Tag nach dem 90. aktiven Tag)
  const m0 = monthKey(new Date(b.end + DAY + 12 * 3_600_000));
  const last = addMonths(m0, vg.maxFreiMonate - 1);
  const mc = monthKey(i.now);
  const gewaehrt = i.faelle.filter((f) => f.art === "vertrag" && f.status === "gewaehrt").length;
  if (mc > last || gewaehrt >= vg.maxFreiMonate) return finish("vertrag", "abgelaufen", b.kz, bedingungen, von, bis);
  const nr = monthRange(m0, mc).length;
  Object.assign(b.kz, { monat: mc, freiMonatNr: nr, betrag: gutschriftBetrag(i.retainer, mc, "vertrag") });
  return finish("vertrag", bedingungen.every((x) => x.ok) ? "anspruch" : "bedingungen_fehlen", b.kz, bedingungen, von, bis);
}

/** Lead-Garantie plus Break-even (Vertreter) bzw. Vertrags-Garantie (Makler) – nur die aktiven. */
export function bewerteGarantien(i: GarantieInput, r: GarantieRegeln): GarantieErgebnis[] {
  const zweite =
    i.vermittlerTyp === "makler" ? (r.vertrag.aktiv ? bewerteVertragsGarantie(i, r) : null) : r.breakeven.aktiv ? bewerteBreakEven(i, r) : null;
  return [r.lead.aktiv ? bewerteLeadGarantie(i, r) : null, zweite].filter((x): x is GarantieErgebnis => !!x);
}

// ─── Texte ───────────────────────────────────────────────────────────────

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const monatName = (key: string) => `${MONATE[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

/** Kurzer Fortschritt, z. B. „Tag 12 von 30 · 41 Leads“ oder „Provision 1.240 € / Kosten 3.100 €“. */
export function fortschritt(e: GarantieErgebnis): string {
  const k = e.kennzahlen;
  if (e.status === "nicht_anwendbar") return e.art === "vertrag" ? "Für Vertreter gilt die Break-even-Garantie" : "Für Makler gilt die Vertrags-Garantie";
  if (e.status === "nicht_gestartet") return "Startet mit der ersten Auslieferung der Anzeigen";
  const tag = `Tag ${Math.min(k.tag, k.tage)} von ${k.tage}${k.pausenTage ? ` (+${k.pausenTage} Pausentage)` : ""}`;
  if (e.art === "lead") return `${tag} · ${k.leads ?? 0} von ${k.minLeads} Leads`;
  if (e.art === "vertrag") {
    const v = `${k.vertraege ?? 0} von ${k.minVertraege} Verträgen`;
    return e.status === "laeuft" ? `${tag} · ${v}` : v;
  }
  const geld = `Provision ${eur0(k.provision ?? 0)} / Kosten ${eur0(k.kosten ?? 0)}`;
  return e.status === "laeuft" ? `${tag} · ${geld}` : geld;
}

/** Titel für Admin „Heute“, z. B. „Garantiefall: Muster – Lead-Garantie (82 von 100 Leads) → Betreuung im Dezember 2026 kostenlos“. */
export function heuteTitel(kunde: string, art: GarantieArt, k: Kennzahlen): string {
  const monat = k.monat ? monatName(k.monat) : "";
  if (art === "lead") return `Garantiefall: ${kunde} – Lead-Garantie (${k.leads ?? 0} von ${k.minLeads} Leads) → Betreuung + Software im ${monat} kostenlos`;
  if (art === "vertrag") return `Garantiefall: ${kunde} – Vertrags-Garantie (${k.vertraege ?? 0} von ${k.minVertraege} Verträgen) → Betreuung + Software im ${monat} kostenlos`;
  return `Garantiefall: ${kunde} – Break-even-Garantie (Provision ${eur0(k.provision ?? 0)} / Kosten ${eur0(k.kosten ?? 0)}) → Betreuung im ${monat} kostenlos`;
}
