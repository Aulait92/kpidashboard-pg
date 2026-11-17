// HvK-Abrechnung (Ole, 16.11.2026): Heinrich von Kleist kauft unsere PKV-Tarifoptimierung-Leads über Lead-Production
// (Pivacom). Jede Woche kommt die Mail „Neue Gutschrift“ mit einem PDF „RECHNUNG“ (Rechnungsnummer, Zeitraum Mo–So,
// Broker ID). Darin:
//   - gekaufte Leads:  „Lead ID: 4595123, KVV-Opt, 41239 Mönchengladbach 1 -45,00 € 19 % -45,00 €“
//   - Reklamationen:   „Reklamation (100.00% des Kaufpreises) Lead ID: 4596925, KVV-Opt, 2026-07-19, 84032 Landshut 1 45,00 € …“
// Die Lead ID ist die Nummer von HvK, nicht unsere. Zuordnung daher über Lieferdatum + PLZ (Reklamation) bzw.
// PLZ + Ort (gekaufte Leads der Woche).
//
// Diese Datei ist rein (ohne Datenbank): Text auslesen, zuordnen, abgleichen und der Ablauf je Rechnung mit
// austauschbarem Speicher (HvkStore), damit Idempotenz und Zuordnung ohne Datenbank testbar sind.
// Datenbank, Mail und PDF: lib/ppl/hvk-abrechnung-server.ts, lib/ppl/hvk-mail.ts, lib/ppl/hvk-pdf-text.ts.

import type { Prisma } from "@/generated/prisma/client";
import { canonicalProductKey } from "@/lib/products";

export const HVK_CUSTOMER_NAME = () => process.env.HVK_CUSTOMER_NAME?.trim() || "Heinrich von Kleist";
export const HVK_PRODUCT = () => process.env.HVK_PRODUCT?.trim() || "PKV-Tarifoptimierung";
export const HVK_SENDER = "info@lead-production.de";
export const HVK_SUBJECT = "Neue Gutschrift";
/** Rückwirkend prüfen ab (Airtable-Zeit, Leads über den Abgleich in der App) */
export const HVK_BACKFILL_FROM = "2026-07-01";

export type HvkBoughtLine = { kind: "gekauft"; pos: number | null; hvkLeadId: string; product: string; plz: string; ort: string; cents: number };
export type HvkReklamationLine = {
  kind: "reklamation";
  pos: number | null;
  hvkLeadId: string;
  product: string;
  /** Lieferdatum laut HvK (YYYY-MM-DD) */
  date: string;
  plz: string;
  ort: string;
  cents: number;
  percent: number;
};
export type HvkLine = HvkBoughtLine | HvkReklamationLine;

export type HvkParsedInvoice = {
  invoiceNo: string;
  /** YYYY-MM-DD */
  periodStart: string;
  periodEnd: string;
  invoiceDate: string | null;
  brokerId: string | null;
  lines: HvkLine[];
  /** Endsumme Netto in Cent (Vorzeichen wie im PDF), null = nicht gefunden */
  netCents: number | null;
  vatCents: number | null;
  grossCents: number | null;
  warnings: string[];
};

// ─── Text auslesen ─────────────────────────────────────────────────────────

const AMOUNT = String.raw`([+\-\u2212\u2013]?\s?[\d.]+,\d{2})\s*€`;

/** „-1.045,00“ / „−45,00“ / „45,00“ → Cent */
export function centsOf(raw: string): number {
  const s = raw.replace(/\s/g, "").replace(/[\u2212\u2013]/g, "-");
  const neg = s.startsWith("-");
  const n = Number(s.replace(/^[+-]/, "").replace(/\./g, "").replace(",", "."));
  const c = Math.round(n * 100);
  return neg ? -c : c;
}

const isoOf = (de: string) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(de);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/**
 * Text des PDFs (beliebige Zeilenumbrüche/Abstände) in die Rechnung übersetzen. Wirft nicht: ohne Rechnungsnummer oder
 * Zeitraum kommt null zurück; Unstimmigkeiten (Zeilensumme ≠ Endsumme) stehen in warnings.
 */
export function parseHvkInvoiceText(raw: string): HvkParsedInvoice | null {
  const text = raw.replace(/ /g, " ").replace(/\s+/g, " ").trim();
  const invoiceNo = /Rechnungsnummer:?\s*([0-9]+-[A-Z]+-[0-9]+)/i.exec(text)?.[1];
  const period = /Zeitraum:?\s*(\d{2}\.\d{2}\.\d{4})\s*(?:-|\u2013|\u2014|bis)\s*(\d{2}\.\d{2}\.\d{4})/i.exec(text);
  const periodStart = period ? isoOf(period[1]) : null;
  const periodEnd = period ? isoOf(period[2]) : null;
  if (!invoiceNo || !periodStart || !periodEnd) return null;
  const invoiceDate = isoOf(/,\s*(\d{2}\.\d{2}\.\d{4})\s+RECHNUNG/i.exec(text)?.[1] ?? "");
  const brokerId = /Broker\s*ID:?\s*(\d+)/i.exec(text)?.[1] ?? null;

  const lines: HvkLine[] = [];
  // Reklamationen zuerst (tragen das Lieferdatum), danach aus dem Text nehmen, damit sie nicht als Kauf zählen
  const rekRe = new RegExp(
    String.raw`(?:(\d+)\s+)?Reklamation\s*\(\s*([\d.,]+)\s*%[^)]*\)\s*Lead\s*ID:?\s*(\d+),\s*([^,]+?),\s*(\d{4}-\d{2}-\d{2}),\s*(\d{5})\s+(.+?)\s+(\d+)\s+${AMOUNT}\s+[\d.,]+\s*%\s+${AMOUNT}`,
    "gi",
  );
  let rest = text;
  for (const m of text.matchAll(rekRe)) {
    lines.push({
      kind: "reklamation",
      pos: m[1] ? Number(m[1]) : null,
      percent: Number(m[2].replace(",", ".")),
      hvkLeadId: m[3],
      product: m[4].trim(),
      date: m[5],
      plz: m[6],
      ort: m[7].trim(),
      cents: centsOf(m[10]),
    });
    rest = rest.replace(m[0], " ");
  }
  const buyRe = new RegExp(String.raw`(?:(\d+)\s+)?Lead\s*ID:?\s*(\d+),\s*([^,]+?),\s*(\d{5})\s+(.+?)\s+(\d+)\s+${AMOUNT}\s+[\d.,]+\s*%\s+${AMOUNT}`, "gi");
  for (const m of rest.matchAll(buyRe)) {
    lines.push({ kind: "gekauft", pos: m[1] ? Number(m[1]) : null, hvkLeadId: m[2], product: m[3].trim(), plz: m[4], ort: m[5].trim(), cents: centsOf(m[8]) });
  }
  lines.sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));

  const amount = (label: string) => {
    const m = new RegExp(String.raw`${label}[^:€]*:\s*${AMOUNT}`, "i").exec(text);
    return m ? centsOf(m[1]) : null;
  };
  const netCents = amount("Endsumme Netto");
  const vatCents = amount("zzgl\\.? MwSt");
  const grossCents = amount("Endsumme Brutto");

  const warnings: string[] = [];
  const sum = lines.reduce((n, l) => n + l.cents, 0);
  if (netCents == null) warnings.push("Endsumme Netto nicht gefunden.");
  else if (sum !== netCents) warnings.push(`Summe der Zeilen (${euro(sum)}) passt nicht zur Endsumme Netto (${euro(netCents)}). Bitte das PDF prüfen.`);
  if (!lines.length && netCents) warnings.push("Keine Lead-Zeilen erkannt.");
  return { invoiceNo, periodStart, periodEnd, invoiceDate, brokerId, lines, netCents, vatCents, grossCents, warnings };
}

export const euro = (cents: number) => (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

// ─── Unsere gelieferten Leads ───────────────────────────────────────────────

export type HvkDeliveredLead = {
  id: string;
  /** Lieferdatum in Berlin (YYYY-MM-DD): deliveredAt, bei Airtable-Leads Zuweisungsdatum (createdAt) */
  date: string;
  plz: string | null;
  ort: string | null;
  name: string | null;
  stornoState: string | null;
};

/**
 * Welche Leads sind HvK-Leads (ohne Zeitraum)? Der Airtable-Abgleich speichert Lead.source als
 * canonicalProductKey(Produkt): aus „PKV-Tarifoptimierung“ wird dort „Wechsel“ (lib/products.ts). Bis 17.11.2026 suchte
 * der Abgleich nur nach „PKV-Tarifoptimierung“ und fand die Airtable-Leads nicht (Geliefert 0, Reklamationen offen).
 * Daher: Kunde HvK und (Produkt wie in der App ODER kanonischer Schlüssel ODER Bezug der App ODER Airtable-Bezug
 * eines HvK-Bezugs, Lead.bezugAirtableId = LeadSubscription.airtableId). HvK-Bezug = Bezug des Kunden mit diesem
 * Produkt (gleicher Name oder gleicher kanonischer Schlüssel). Testleads zählen nie.
 */
export function hvkLeadFilter(
  customerIds: string[],
  product: string,
  subscriptions: { id: string; airtableId: string | null; productKey: string }[],
): Prisma.LeadWhereInput {
  const key = canonicalProductKey(product);
  const subs = subscriptions.filter((s) => s.productKey.trim().toLowerCase() === product.toLowerCase() || canonicalProductKey(s.productKey) === key);
  const bezugIds = subs.flatMap((s) => (s.airtableId ? [s.airtableId] : []));
  return {
    customerId: { in: customerIds },
    isTest: false,
    OR: [
      { source: { equals: product, mode: "insensitive" } },
      ...(key.toLowerCase() !== product.toLowerCase() ? [{ source: { equals: key, mode: "insensitive" as const } }] : []),
      ...(subs.length ? [{ subscriptionId: { in: subs.map((s) => s.id) } }] : []),
      ...(bezugIds.length ? [{ bezugAirtableId: { in: bezugIds } }] : []),
    ],
  };
}

/** Datum in Berlin als YYYY-MM-DD */
export function berlinDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const normKey = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
const PLZ_KEYS = new Set(["plz", "postleitzahl", "zip", "zipcode", "postalcode"]);
const ORT_KEYS = new Set(["ort", "stadt", "city", "wohnort"]);

/** PLZ und Ort eines Leads: korrigierte Stammdaten vor Formularangaben vor Pool-Eingang. */
export function leadPlzOrt(l: { contactOverrides?: unknown; formData?: unknown; poolPlz?: string | null }): { plz: string | null; ort: string | null } {
  const o = l.contactOverrides && typeof l.contactOverrides === "object" ? (l.contactOverrides as { zip?: unknown; city?: unknown }) : {};
  let plz = typeof o.zip === "string" && o.zip.trim() ? o.zip : null;
  let ort = typeof o.city === "string" && o.city.trim() ? o.city : null;
  const answers = Array.isArray(l.formData) ? (l.formData as { label?: unknown; value?: unknown }[]) : [];
  for (const a of answers) {
    if (typeof a?.label !== "string" || typeof a.value !== "string" || !a.value.trim()) continue;
    const k = normKey(a.label);
    if (!plz && PLZ_KEYS.has(k)) plz = a.value;
    if (!ort && ORT_KEYS.has(k)) ort = a.value;
  }
  if (!plz && l.poolPlz) plz = l.poolPlz;
  const digits = plz?.replace(/\D/g, "").slice(0, 5) ?? "";
  return { plz: digits.length === 5 ? digits : null, ort: ort?.trim() || null };
}

/** Ort vergleichbar machen: „Mönchengladbach“ = „Moenchengladbach“, „Frankfurt am Main“ ≈ „Frankfurt“ */
export function ortKey(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
}
export function sameOrt(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = ortKey(a);
  const y = ortKey(b);
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
}

// ─── Reklamation → Lead (Lieferdatum + PLZ) ─────────────────────────────────

export type ReklamationMatch = { outcome: "eindeutig"; lead: HvkDeliveredLead } | { outcome: "keiner" | "mehrere"; candidates: HvkDeliveredLead[] };

/** Nur bei genau einem Lead mit gleichem Lieferdatum und gleicher PLZ wird zugeordnet. Sonst nicht raten. */
export function matchReklamation(r: Pick<HvkReklamationLine, "date" | "plz">, leads: HvkDeliveredLead[]): ReklamationMatch {
  const c = leads.filter((l) => l.date === r.date && l.plz === r.plz);
  if (c.length === 1) return { outcome: "eindeutig", lead: c[0] };
  return { outcome: c.length ? "mehrere" : "keiner", candidates: c };
}

// ─── Wochenabgleich: gekaufte Leads ↔ gelieferte Leads ──────────────────────

export type HvkReconcile = {
  matched: { hvkLeadId: string; leadId: string }[];
  /** geliefert, aber nicht abgerechnet */
  unbilled: HvkDeliveredLead[];
  /** abgerechnet, aber nicht von uns geliefert */
  foreign: HvkBoughtLine[];
};

/**
 * Jeder gekaufte Lead wird höchstens einem gelieferten Lead der Woche zugeordnet: zuerst PLZ und Ort gleich, dann nur PLZ,
 * zuletzt nur Ort (falls unser Lead keine PLZ hat).
 */
export function reconcileWeek(bought: HvkBoughtLine[], delivered: HvkDeliveredLead[]): HvkReconcile {
  const free = new Set(delivered.map((d) => d.id));
  const open = new Set(bought.map((_, i) => i));
  const matched: HvkReconcile["matched"] = [];
  const passes: ((b: HvkBoughtLine, d: HvkDeliveredLead) => boolean)[] = [
    (b, d) => d.plz === b.plz && sameOrt(d.ort, b.ort),
    (b, d) => d.plz === b.plz,
    (b, d) => !d.plz && sameOrt(d.ort, b.ort),
  ];
  for (const fits of passes) {
    for (const i of [...open]) {
      const b = bought[i];
      const d = delivered.find((x) => free.has(x.id) && fits(b, x));
      if (!d) continue;
      free.delete(d.id);
      open.delete(i);
      matched.push({ hvkLeadId: b.hvkLeadId, leadId: d.id });
    }
  }
  return { matched, unbilled: delivered.filter((d) => free.has(d.id)), foreign: [...open].map((i) => bought[i]) };
}

// ─── Ablauf je Rechnung (Speicher austauschbar) ─────────────────────────────

export type HvkStornoState = "eingetragen" | "schon storniert" | "würde eingetragen" | "fehler";

export type HvkReklamationResult = {
  hvkLeadId: string;
  date: string;
  plz: string;
  ort: string;
  cents: number;
  outcome: "eindeutig" | "keiner" | "mehrere";
  leadId: string | null;
  candidateIds: string[];
  storno: HvkStornoState | null;
  error?: string;
};

export type HvkProcessResult = {
  invoiceNo: string;
  periodStart: string;
  periodEnd: string;
  /** neu = übernommen, vorhanden = Rechnungsnummer schon da (nichts geändert), vorschau = Probelauf */
  status: "neu" | "vorhanden" | "vorschau";
  invoiceId?: string;
  delivered: number;
  billed: number;
  netCents: number | null;
  reklamationen: HvkReklamationResult[];
  stornoAuto: number;
  stornoReview: number;
  unbilled: { id: string; date: string; plz: string | null; ort: string | null; name: string | null }[];
  foreign: { hvkLeadId: string; plz: string; ort: string; product: string }[];
  matched: number;
  warnings: string[];
};

export type HvkInvoiceInput = {
  parsed: HvkParsedInvoice;
  pdf: Uint8Array;
  pdfName: string | null;
  mailMessageId: string | null;
  receivedAt: Date | null;
  source: "mail" | "backfill" | "upload";
};

export interface HvkStore {
  /** Rechnung schon übernommen? */
  findInvoice(invoiceNo: string): Promise<{ id: string } | null>;
  /** HvK-Leads (Produkt PKV-Tarifoptimierung) mit Lieferdatum im Bereich (Berlin, inklusive) */
  deliveredLeads(fromDate: string, toDate: string): Promise<HvkDeliveredLead[]>;
  /** Legt die Rechnung an; "exists", wenn die Rechnungsnummer gleichzeitig schon angelegt wurde */
  createInvoice(input: HvkInvoiceInput, result: HvkProcessResult): Promise<{ id: string } | "exists">;
  /** Storno wie „Storno eintragen“ (Admin) */
  recordStorno(leadId: string, reason: string, note: string): Promise<{ ok: true; already: boolean } | { ok: false; error: string }>;
  saveReklamationen(invoiceId: string, rows: HvkReklamationResult[]): Promise<void>;
}

const shiftDay = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export const hvkStornoReason = (invoiceNo: string) => `Reklamation HvK-Abrechnung ${invoiceNo}`;
/** Notiz am Storno (gleich bei Import und Neuabgleich) */
export const hvkStornoNote = (r: { hvkLeadId: string; plz: string; ort: string; date: string }) =>
  `HvK Lead ID ${r.hvkLeadId}, ${r.plz} ${r.ort}, geliefert ${r.date.split("-").reverse().join(".")}`;

/**
 * Eine Rechnung verarbeiten. Idempotent über die Rechnungsnummer: Ist sie schon da, passiert nichts (status „vorhanden“).
 * dryRun: nur zeigen, was passieren würde (keine Schreibzugriffe).
 */
export async function processHvkInvoice(input: HvkInvoiceInput, store: HvkStore, opts: { dryRun?: boolean } = {}): Promise<HvkProcessResult> {
  const p = input.parsed;
  const bought = p.lines.filter((l): l is HvkBoughtLine => l.kind === "gekauft");
  const reks = p.lines.filter((l): l is HvkReklamationLine => l.kind === "reklamation");
  const existing = await store.findInvoice(p.invoiceNo);

  const week = await store.deliveredLeads(p.periodStart, p.periodEnd);
  const inWeek = week.filter((l) => l.date >= p.periodStart && l.date <= p.periodEnd);
  const rec = reconcileWeek(bought, inWeek);

  // Reklamationen: Kandidaten am jeweiligen Lieferdatum (liegt meist in einer Vorwoche)
  const dates = reks.map((r) => r.date).sort();
  const around = dates.length ? await store.deliveredLeads(dates[0], dates[dates.length - 1]) : [];
  const reklamationen: HvkReklamationResult[] = reks.map((r) => {
    const m = matchReklamation(r, around);
    const base = { hvkLeadId: r.hvkLeadId, date: r.date, plz: r.plz, ort: r.ort, cents: r.cents };
    return m.outcome === "eindeutig"
      ? { ...base, outcome: m.outcome, leadId: m.lead.id, candidateIds: [m.lead.id], storno: m.lead.stornoState === "approved" ? "schon storniert" : "würde eingetragen" }
      : { ...base, outcome: m.outcome, leadId: null, candidateIds: m.candidates.map((c) => c.id), storno: null };
  });

  const result: HvkProcessResult = {
    invoiceNo: p.invoiceNo,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    status: existing ? "vorhanden" : opts.dryRun ? "vorschau" : "neu",
    ...(existing ? { invoiceId: existing.id } : {}),
    delivered: inWeek.length,
    billed: bought.length,
    netCents: p.netCents,
    reklamationen,
    stornoAuto: reklamationen.filter((r) => r.outcome === "eindeutig").length,
    stornoReview: reklamationen.filter((r) => r.outcome !== "eindeutig").length,
    unbilled: rec.unbilled.map((d) => ({ id: d.id, date: d.date, plz: d.plz, ort: d.ort, name: d.name })),
    foreign: rec.foreign.map((b) => ({ hvkLeadId: b.hvkLeadId, plz: b.plz, ort: b.ort, product: b.product })),
    matched: rec.matched.length,
    warnings: [...p.warnings],
  };
  if (existing || opts.dryRun) return result;

  // Erst die Rechnung anlegen (Rechnungsnummer eindeutig): ein zweiter, gleichzeitiger Lauf endet hier
  const created = await store.createInvoice(input, result);
  if (created === "exists") {
    const again = await store.findInvoice(p.invoiceNo);
    return { ...result, status: "vorhanden", ...(again ? { invoiceId: again.id } : {}) };
  }
  result.invoiceId = created.id;
  for (const r of result.reklamationen) {
    if (r.outcome !== "eindeutig" || !r.leadId) continue;
    const s = await store.recordStorno(r.leadId, hvkStornoReason(p.invoiceNo), hvkStornoNote(r)).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
    r.storno = s.ok ? (s.already ? "schon storniert" : "eingetragen") : "fehler";
    if (!s.ok) r.error = s.error;
  }
  await store.saveReklamationen(created.id, result.reklamationen);
  return result;
}

// ─── Zeitplan ───────────────────────────────────────────────────────────────

/**
 * Abruf im zentralen Cron: Montag bis Mittwoch, stündlich 7 bis 20 Uhr (Berlin). Die Mail kommt meist montags oder
 * dienstags früh; mehrfacher Abruf schadet nicht (idempotent je Rechnung, schon gelesene Mails werden übersprungen).
 */
export function hvkCronDue(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return ["Mon", "Tue", "Wed"].includes(get("weekday")) && hour >= 7 && hour <= 20 && minute < 5;
}

// ─── Neuabgleich übernommener Rechnungen (Ole, 17.11.2026) ──────────────────
// Bis 17.11.2026 fand der Abgleich die Leads aus dem Airtable-Abgleich nicht (Produktfilter, siehe loadHvkLeads):
// „Geliefert“ stand auf 0, Reklamationen blieben offen. Der Neuabgleich rechnet jede Rechnung aus den gespeicherten
// Zeilen neu (PDF, Zeilen und Rechnungsdaten bleiben) und ordnet offene Reklamationen erneut zu.

export type HvkReabgleichReklamation = {
  id: string;
  hvkLeadId: string;
  /** Lieferdatum laut HvK (YYYY-MM-DD) */
  date: string;
  plz: string;
  ort: string;
  /** auto | offen | erledigt | verworfen */
  status: string;
  leadId: string | null;
  candidateIds: string[];
};

export type HvkReabgleichInvoice = {
  id: string;
  invoiceNo: string;
  periodStart: string;
  periodEnd: string;
  lines: HvkLine[];
  result: Partial<HvkProcessResult>;
  deliveredCount: number;
  stornoAuto: number;
  stornoReview: number;
  reklamationen: HvkReabgleichReklamation[];
};

export interface HvkReabgleichStore {
  invoices(): Promise<HvkReabgleichInvoice[]>;
  deliveredLeads(fromDate: string, toDate: string): Promise<HvkDeliveredLead[]>;
  /** Storno wie „Storno eintragen“ (Admin), wie beim Import */
  recordStorno(leadId: string, reason: string, note: string): Promise<{ ok: true; already: boolean } | { ok: false; error: string }>;
  updateInvoice(id: string, data: { deliveredCount: number; stornoAuto: number; stornoReview: number; result: HvkProcessResult }): Promise<void>;
  /** Nur solange die Reklamation „offen“ ist (schon entschieden: nichts ändern) */
  updateReklamation(id: string, data: { status: "auto" | "offen"; leadId: string | null; candidateIds: string[]; decidedAt: Date | null }): Promise<void>;
}

export type HvkReabgleichWeek = {
  invoiceNo: string;
  periodStart: string;
  periodEnd: string;
  delivered: number;
  /** vorher gespeichert */
  deliveredBefore: number;
  billed: number;
  /** geliefert minus abgerechnet */
  diff: number;
  unbilled: number;
  foreign: number;
  /** Stornos aus offenen Reklamationen: jetzt eingetragen (Vorschau: würden eingetragen) */
  stornoNew: number;
  /** schon vorher eingetragen (auto oder von Hand) */
  stornoBefore: number;
  /** danach noch offen („Storno prüfen“) */
  open: number;
  /** Rechnung oder Reklamationen ändern sich */
  changed: boolean;
  errors: string[];
};

export type HvkReabgleichSummary = {
  dryRun: boolean;
  weeks: HvkReabgleichWeek[];
  totals: { invoices: number; changed: number; delivered: number; billed: number; stornoNew: number; stornoBefore: number; open: number; errors: number };
};

/** JSON mit sortierten Schlüsseln (jsonb ordnet Schlüssel um), für „hat sich etwas geändert?“ */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

const DONE = new Set(["auto", "erledigt"]);
type RekAfter = { status: "auto" | "offen"; outcome: HvkReklamationResult["outcome"]; leadId: string | null; candidateIds: string[]; storno: HvkStornoState | null; error?: string };

/**
 * Alle übernommenen Rechnungen neu abgleichen. Je Rechnung: geliefert (Woche), zugeordnet, nicht abgerechnet, nicht von
 * uns → deliveredCount und result. Je offener Reklamation: Kandidaten neu (Lieferdatum + PLZ, matchReklamation);
 * eindeutig → Storno wie beim Import und status „auto“, sonst Kandidaten aktualisieren und offen lassen.
 * auto/erledigt/verworfen bleiben unberührt. Geschrieben wird nur, was sich ändert (zweiter Lauf ändert nichts).
 * dryRun: dieselben Zahlen, nichts wird geschrieben.
 */
export async function reabgleichHvkInvoices(store: HvkReabgleichStore, opts: { dryRun?: boolean; now?: Date } = {}): Promise<HvkReabgleichSummary> {
  const dryRun = !!opts.dryRun;
  const invoices = await store.invoices();
  const weeks: HvkReabgleichWeek[] = [];
  const dates = invoices.flatMap((i) => [i.periodStart, i.periodEnd, ...i.reklamationen.filter((r) => r.status === "offen").map((r) => r.date)]).sort();
  const leads = dates.length ? await store.deliveredLeads(dates[0], dates[dates.length - 1]) : [];
  // Ein Lead deckt höchstens eine Reklamation: schon zugeordnete (auto/erledigt, auch aus diesem Lauf) nicht nochmal
  // automatisch eintragen, sondern zum Prüfen offen lassen
  const taken = new Set(invoices.flatMap((i) => i.reklamationen.filter((r) => DONE.has(r.status) && r.leadId).map((r) => r.leadId!)));

  for (const inv of invoices) {
    const bought = inv.lines.filter((l): l is HvkBoughtLine => l.kind === "gekauft");
    const inWeek = leads.filter((l) => l.date >= inv.periodStart && l.date <= inv.periodEnd);
    const rec = reconcileWeek(bought, inWeek);
    const errors: string[] = [];
    let stornoNew = 0;
    let rekChanged = false;
    const after = new Map<string, RekAfter>();

    for (const r of inv.reklamationen) {
      if (r.status !== "offen") continue;
      const m = matchReklamation(r, leads);
      if (m.outcome !== "eindeutig" || taken.has(m.lead.id)) {
        const ids = m.outcome === "eindeutig" ? [m.lead.id] : m.candidates.map((c) => c.id);
        if (stableJson(ids) !== stableJson(r.candidateIds) || r.leadId) {
          if (!dryRun) await store.updateReklamation(r.id, { status: "offen", leadId: null, candidateIds: ids, decidedAt: null });
          rekChanged = true;
        }
        after.set(r.id, {
          status: "offen",
          outcome: m.outcome,
          leadId: null,
          candidateIds: ids,
          storno: null,
          ...(m.outcome === "eindeutig" ? { error: "Lead gehört schon zu einer anderen Reklamation" } : {}),
        });
        continue;
      }
      const lead = m.lead;
      let storno: HvkStornoState = lead.stornoState === "approved" ? "schon storniert" : "würde eingetragen";
      if (!dryRun) {
        const s = await store
          .recordStorno(lead.id, hvkStornoReason(inv.invoiceNo), hvkStornoNote(r))
          .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
        if (!s.ok) {
          // Wie beim Import: offen lassen, Lead als einzigen Kandidaten zeigen
          errors.push(`Reklamation ${r.hvkLeadId}: ${s.error}`);
          if (stableJson([lead.id]) !== stableJson(r.candidateIds) || r.leadId !== lead.id) {
            await store.updateReklamation(r.id, { status: "offen", leadId: lead.id, candidateIds: [lead.id], decidedAt: null });
            rekChanged = true;
          }
          after.set(r.id, { status: "offen", outcome: "eindeutig", leadId: lead.id, candidateIds: [lead.id], storno: "fehler", error: s.error });
          continue;
        }
        storno = s.already ? "schon storniert" : "eingetragen";
        await store.updateReklamation(r.id, { status: "auto", leadId: lead.id, candidateIds: [lead.id], decidedAt: opts.now ?? new Date() });
      }
      taken.add(lead.id);
      stornoNew++;
      rekChanged = true;
      after.set(r.id, { status: "auto", outcome: "eindeutig", leadId: lead.id, candidateIds: [lead.id], storno });
    }

    const statusOf = (r: HvkReabgleichReklamation) => after.get(r.id)?.status ?? r.status;
    const open = inv.reklamationen.filter((r) => statusOf(r) === "offen").length;
    const stornoAuto = inv.reklamationen.filter((r) => DONE.has(statusOf(r))).length;
    // Reklamationen im gespeicherten Ergebnis nachziehen
    const reklamationen: HvkReklamationResult[] = (Array.isArray(inv.result.reklamationen) ? inv.result.reklamationen : []).map((x) => {
      const row = inv.reklamationen.find((r) => r.hvkLeadId === x.hvkLeadId);
      const a = row ? after.get(row.id) : undefined;
      if (!a) return x;
      const rest: HvkReklamationResult = { ...x };
      delete rest.error;
      return { ...rest, outcome: a.outcome, leadId: a.leadId, candidateIds: a.candidateIds, storno: a.storno, ...(a.error ? { error: a.error } : {}) };
    });
    const result: HvkProcessResult = {
      ...(inv.result as HvkProcessResult),
      invoiceNo: inv.invoiceNo,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      delivered: inWeek.length,
      billed: bought.length,
      matched: rec.matched.length,
      unbilled: rec.unbilled.map((d) => ({ id: d.id, date: d.date, plz: d.plz, ort: d.ort, name: d.name })),
      foreign: rec.foreign.map((b) => ({ hvkLeadId: b.hvkLeadId, plz: b.plz, ort: b.ort, product: b.product })),
      reklamationen,
      stornoAuto,
      stornoReview: open,
    };
    const invChanged = inv.deliveredCount !== result.delivered || inv.stornoAuto !== stornoAuto || inv.stornoReview !== open || stableJson(inv.result) !== stableJson(result);
    if (invChanged && !dryRun) await store.updateInvoice(inv.id, { deliveredCount: result.delivered, stornoAuto, stornoReview: open, result });
    weeks.push({
      invoiceNo: inv.invoiceNo,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      delivered: result.delivered,
      deliveredBefore: inv.deliveredCount,
      billed: result.billed,
      diff: result.delivered - result.billed,
      unbilled: result.unbilled.length,
      foreign: result.foreign.length,
      stornoNew,
      stornoBefore: inv.reklamationen.filter((r) => DONE.has(r.status)).length,
      open,
      changed: invChanged || rekChanged,
      errors,
    });
  }
  const sum = (k: "delivered" | "billed" | "stornoNew" | "stornoBefore" | "open") => weeks.reduce((n, w) => n + w[k], 0);
  return {
    dryRun,
    weeks,
    totals: {
      invoices: weeks.length,
      changed: weeks.filter((w) => w.changed).length,
      delivered: sum("delivered"),
      billed: sum("billed"),
      stornoNew: sum("stornoNew"),
      stornoBefore: sum("stornoBefore"),
      open: sum("open"),
      errors: weeks.reduce((n, w) => n + w.errors.length, 0),
    },
  };
}

export { shiftDay as hvkShiftDay };
