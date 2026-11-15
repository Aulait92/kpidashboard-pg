// Admin → Zahlen → Buchungen: alle Buchungen und Änderungen aller Kunden in einer Liste.
//
// Quellen (je Ereignis genau EINE Quelle, nie zugleich Tabelle und Änderungsprotokoll):
// - Angebote (Offer, angenommen): Annahme mit Einrichtung, Monatspreis und Zusätzen; ein
//   Empfehlungsrabatt auf die Einrichtung als eigene Rabattzeile (Einrichtung dann zum Listenpreis).
//   Gekündigtes Stripe-Abo (subscriptionStatus „canceled“) → Kündigung (Datum aus der Vertriebs-
//   Aktivität „Abo zu … beendet“, sonst updatedAt).
// - ProductBooking: gebuchte bzw. angefragte Produkte, „Produkt beenden“-Anfragen.
// - BudgetChange: Budgetänderungen und -anfragen (Monatspreis-Änderung = feeTo − feeFrom).
// - CustomerPause: Pause und Pausenende.
// - BestandMessagePack: Nachrichten-Pakete.
// - ColleagueReferral: Kollegen-Prämien (Gutschrift an den Empfehler).
// - Änderungsprotokoll (AuditLog) nur, wo es keine Tabelle gibt: Verkäufer-Plätze (billing.seats),
//   Module (billing.bestand, billing.empfehlung, empfehlung.book Testphase/bezahlt,
//   empfehlung.trial_end, bestand.request), Produkt-Anfragen außerhalb des Katalogs
//   (produkt.anfrage), große Nachrichtenpakete (bestand.paket_anfrage) und von Hand geänderte
//   Betreuungsgebühr bzw. Vertragsende (billing.retainer ohne source „budget“).
//   Alles, was eine Tabelle schon abbildet, steht in AUDIT_COVERED_BY_TABLES und wird übersprungen.
// - Lebenszyklus (CustomerLifecycleEvent, lib/ruhend.ts): „Reaktiviert“ mit Paket und Monatsbetrag; Vertragsende mit
//   Ruhephase, wenn die Betreuungsgebühr nach der Reaktivierung ohne Ende weiterläuft (sonst Zeile „Vertrag beendet“).
// - Offene Aufgabe: Vertriebsaufgabe (SalesTask) am Kontakt des Kunden, die die Aktion angelegt hat
//   (gleicher Zeitraum, passender Titel).
//
// Beträge netto. „monatlich“ = Änderung des wiederkehrenden Monatsbetrags (+ mehr, − weniger).
// Summen zählen nur aktive, geplante und beendete Zeilen (keine Anfragen, Abgelehntes, Zurückgenommenes).

import { prisma } from "@/lib/prisma";
import { filterRange } from "@/lib/admin-leads";
import { offerAddOns, offerSetupDiscount, PRICE_LIST } from "@/lib/offer-pricing";
import {
  ART_LABEL,
  COUNTED_STATUS,
  isOpen,
  statusText,
  type BuchungArt,
  type BuchungRow,
  type BuchungStatus,
  type BuchungSums,
  type BuchungTask,
} from "@/lib/admin-buchungen-shared";

export * from "@/lib/admin-buchungen-shared";

// ─── Eingaben (reine Daten, ohne Prisma-Decimal) ─────────────────────────

export type SrcCustomer = {
  id: string;
  name: string;
  contactId: string | null;
  retainerMonthly: number | null;
  retainerEnd: Date | null;
  seatMonthly: number | null;
  seatsBilled: number;
  bestandMonthly: number | null;
  empfehlungMonthly: number | null;
  bestandRequestedAt: Date | null;
  existingCustomersEnabled: boolean;
  bestandFreeUntil: Date | null;
};

export type SrcOffer = {
  id: string;
  number: string;
  customerId: string | null;
  company: string | null;
  contactName: string;
  salesContactId: string | null;
  acceptedAt: Date | null;
  startDate: Date | null;
  term: string;
  products: { name: string; dailyBudget: number }[];
  setupFee: number;
  setupListFee: number | null;
  setupDiscount: number | null;
  setupDiscountLabel: string | null;
  monthlyFee: number;
  introMonthlyFee: number | null;
  introMonths: number | null;
  seats: number | null;
  seatsIncluded: number | null;
  seatMonthly: number | null;
  bestandMonthly: number | null;
  empfehlungMonthly: number | null;
  annualPrepay: boolean;
  annualFreeMonths: number | null;
  subscriptionStatus: string | null;
  updatedAt: Date;
  /** Abo bei Stripe beendet (Vertriebs-Aktivität „Abo zu … beendet“) */
  canceledAt: Date | null;
};

export type SrcProductBooking = {
  id: string;
  customerId: string;
  catalogKey: string;
  product: string;
  dailyBudget: number;
  startWish: Date | null;
  status: string;
  feeFrom: number | null;
  feeTo: number | null;
  setupFee: number;
  setupStatus: string;
  pricing: string;
  startedAt: Date | null;
  endRequestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SrcBudgetChange = {
  id: string;
  customerId: string;
  changes: { product: string; from: number; to: number }[];
  effectiveFrom: Date;
  monthlyBudgetFrom: number;
  monthlyBudgetTo: number;
  feeFrom: number | null;
  feeTo: number | null;
  status: string;
  decidedAt: Date | null;
  feeAppliedAt: Date | null;
  createdAt: Date;
};

export type SrcPause = {
  id: string;
  customerId: string;
  startsAt: Date;
  endsAt: Date | null;
  status: string;
  kind: string;
  createdBy: string;
  resumedAt: Date | null;
  createdAt: Date;
};

export type SrcPack = {
  id: string;
  customerId: string;
  messages: number;
  amount: number;
  purchasedAt: Date;
  expiresAt: Date;
  source: string;
  stripeStatus: string;
};

export type SrcReferral = {
  id: string;
  referrerId: string;
  name: string | null;
  company: string | null;
  rewardStatus: string;
  rewardAmount: number | null;
  rewardNote: string | null;
  rewardedAt: Date | null;
  wonAt: Date | null;
  updatedAt: Date;
};

export type SrcAudit = { id: string; at: Date; action: string; customerId: string | null; actorRole: string | null; details: unknown };

export type SrcTask = { id: string; contactId: string | null; title: string; createdAt: Date; doneAt: Date | null };

export type SrcLifecycle = { id: string; customerId: string; kind: string; at: Date; mrr: number | null; details: unknown };

export type BuchungSources = {
  customers: SrcCustomer[];
  offers: SrcOffer[];
  productBookings: SrcProductBooking[];
  budgetChanges: SrcBudgetChange[];
  pauses: SrcPause[];
  packs: SrcPack[];
  referrals: SrcReferral[];
  audits: SrcAudit[];
  tasks: SrcTask[];
  /** Reaktivierungen und Vertragsenden aus dem Lebenszyklus */
  lifecycle?: SrcLifecycle[];
};

/** Aktionen im Änderungsprotokoll, aus denen Zeilen entstehen. */
export const AUDIT_ACTIONS = [
  "billing.seats",
  "billing.bestand",
  "billing.empfehlung",
  "billing.retainer",
  "empfehlung.book",
  "empfehlung.trial_end",
  "bestand.request",
  "bestand.paket_anfrage",
  "produkt.anfrage",
] as const;

/** Protokoll-Einträge zu Ereignissen, die schon eine Tabelle abbildet (nie zusätzlich als Zeile). */
export const AUDIT_COVERED_BY_TABLES = [
  "offer.accept", // Offer
  "offer.referral_discount", // Offer.setupDiscount
  "produkt.book", // ProductBooking
  "produkt.request",
  "produkt.decide",
  "produkt.start",
  "produkt.end_request",
  "budget.change", // BudgetChange
  "budget.request",
  "budget.decide",
  "budget.fee",
  "budget.meta",
  "pause.plan", // CustomerPause
  "pause.end",
  "bestand.paket", // BestandMessagePack
  "referral.reward", // ColleagueReferral
  "empfehlung.cancel", // gleiches Ereignis wie billing.empfehlung cancel_at_period_end
] as const;

// ─── Hilfen ──────────────────────────────────────────────────────────────

const MIN = 60_000;
const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
const fmtDay = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const date = (v: unknown): Date | null => {
  const s = str(v);
  if (!s) return null;
  // „JJJJ-MM-TT“ = Kalendertag (Mittag UTC, damit der Tag in Berlin stimmt)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const join = (parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ") || null;

const abrechnungHref = (customerId: string) => `/admin/kunden/${customerId}/abrechnung`;
const taskHref = (t: SrcTask) => (t.contactId ? `/admin/vertrieb/kontakte/${t.contactId}` : "/admin/vertrieb/aufgaben");

type TaskHint = { match: (title: string) => boolean; from: Date; to: Date };

// ─── Zeilen bauen (rein, ohne Datenbank) ─────────────────────────────────

export function buildBuchungen(src: BuchungSources, now: Date = new Date()): BuchungRow[] {
  const customers = new Map(src.customers.map((c) => [c.id, c]));
  const nameOf = (id: string | null) => (id ? (customers.get(id)?.name ?? "Unbekannter Kunde") : "Unbekannter Kunde");

  // Aufgaben je Kontakt (ohne Kontakt: über den Kundennamen im Titel)
  const tasksByContact = new Map<string, SrcTask[]>();
  const looseTasks: SrcTask[] = [];
  for (const t of src.tasks) {
    if (t.contactId) tasksByContact.set(t.contactId, [...(tasksByContact.get(t.contactId) ?? []), t]);
    else looseTasks.push(t);
  }
  const findTask = (customerId: string | null, hint: TaskHint): BuchungTask | null => {
    const c = customerId ? customers.get(customerId) : undefined;
    if (!c) return null;
    const pool = [...(c.contactId ? (tasksByContact.get(c.contactId) ?? []) : []), ...looseTasks.filter((t) => t.title.includes(c.name))];
    const hits = pool.filter((t) => t.createdAt >= hint.from && t.createdAt <= hint.to && hint.match(t.title));
    if (!hits.length) return null;
    const open = hits.find((t) => !t.doneAt);
    const t = open ?? hits.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return { open: !!open, title: t.title, href: taskHref(t) };
  };
  const around = (at: Date, after = 10 * MIN): { from: Date; to: Date } => ({ from: new Date(at.getTime() - 2 * MIN), to: new Date(at.getTime() + after) });

  const rows: BuchungRow[] = [];
  const add = (r: Omit<BuchungRow, "customerName" | "href" | "task" | "statusFrom" | "detail"> & Partial<Pick<BuchungRow, "customerName" | "href" | "task" | "statusFrom" | "detail">>): BuchungRow => {
    const row: BuchungRow = {
      customerName: nameOf(r.customerId),
      href: r.customerId ? abrechnungHref(r.customerId) : "/admin/vertrieb/angebote",
      task: null,
      statusFrom: null,
      detail: null,
      ...r,
      oneOff: r.oneOff == null ? null : r2(r.oneOff),
      monthly: r.monthly == null ? null : r2(r.monthly),
    };
    rows.push(row);
    return row;
  };
  const planned = (at: Date | null): { status: BuchungStatus; statusFrom: Date | null } =>
    at && at.getTime() > now.getTime() ? { status: "geplant", statusFrom: at } : { status: "aktiv", statusFrom: null };

  // ── Angebote ──
  const kuendigungByCustomer = new Map<string, BuchungRow>();
  for (const o of src.offers) {
    if (!o.acceptedAt) continue;
    const addOns = offerAddOns({
      monthlyFee: o.monthlyFee,
      seats: o.seats,
      seatsIncluded: o.seatsIncluded,
      seatMonthly: o.seatMonthly,
      bestandMonthly: o.bestandMonthly,
      empfehlungMonthly: o.empfehlungMonthly,
      annualPrepay: o.annualPrepay,
      annualFreeMonths: o.annualFreeMonths,
    });
    const discount = offerSetupDiscount(o);
    const canceled = o.subscriptionStatus === "canceled";
    const label = o.company || o.contactName;
    const href = o.customerId ? abrechnungHref(o.customerId) : o.salesContactId ? `/admin/vertrieb/kontakte/${o.salesContactId}` : "/admin/vertrieb/angebote";
    const name = o.customerId ? nameOf(o.customerId) : label;
    const st = canceled ? { status: "beendet" as const, statusFrom: null } : planned(o.startDate);
    add({
      id: `offer:${o.id}`,
      source: "offer",
      sourceId: o.id,
      at: o.acceptedAt,
      customerId: o.customerId,
      customerName: name,
      href,
      art: "angebot",
      title: `Angebot ${o.number} angenommen`,
      detail: join([
        o.products.length ? o.products.map((p) => p.name).join(", ") : null,
        o.term === "12m" ? "12 Monate" : o.term === "3m" ? "3 Monate" : "ohne Mindestlaufzeit",
        discount ? `Einrichtung ${eur(discount.list)}, Rabatt ${eur(discount.discount)}` : `Einrichtung ${eur(o.setupFee)}`,
        addOns.seatsFee ? (addOns.extraSeats === 1 ? "1 weiterer Platz" : `${addOns.extraSeats} weitere Plätze`) : null,
        addOns.bestandActive ? "Bestandskunden-Modul" : null,
        addOns.empfehlungActive ? "Empfehlungen & Bewertungen" : null,
        o.introMonthlyFee != null && o.introMonths ? `Startpreis ${eur(o.introMonthlyFee)} für ${o.introMonths} Monate` : null,
        o.annualPrepay ? "jährlich im Voraus" : null,
      ]),
      oneOff: discount ? discount.list : o.setupFee,
      monthly: addOns.monthlyTotal,
      ...st,
    });
    if (discount) {
      add({
        id: `offer-rabatt:${o.id}`,
        source: "offer",
        sourceId: o.id,
        at: o.acceptedAt,
        customerId: o.customerId,
        customerName: name,
        href,
        art: "rabatt",
        title: o.setupDiscountLabel || "Empfehlungsrabatt auf die Einrichtung",
        detail: `Angebot ${o.number}`,
        oneOff: -discount.discount,
        monthly: null,
        status: "aktiv",
      });
    }
  }

  // ── Produkte (Weiteres Produkt selbst buchen) ──
  for (const b of src.productBookings) {
    const productTask = (row: BuchungRow, from: Date, to: Date) => {
      const re = new RegExp(escapeRe(b.product), "i");
      row.task = findTask(b.customerId, { match: (t) => re.test(t) && !t.startsWith("Produkt beenden"), from, to });
    };
    if (b.catalogKey !== "angebot") {
      const requested = b.status === "requested";
      const status: BuchungStatus =
        b.status === "requested" ? "angefragt" : b.status === "rejected" ? "abgelehnt" : b.status === "ended" ? "beendet" : b.status === "live" ? "aktiv" : "geplant";
      const row = add({
        id: `productBooking:${b.id}`,
        source: "productBooking",
        sourceId: b.id,
        at: b.createdAt,
        customerId: b.customerId,
        art: "produkt",
        title: `${requested || (b.status === "rejected" && b.pricing === "individual") ? "Produkt angefragt" : "Produkt gebucht"}: ${b.product}`,
        detail: join([
          `${eur(b.dailyBudget)} pro Tag`,
          b.status === "setup" ? "in Einrichtung" : null,
          b.startedAt ? `gestartet ${fmtDay(b.startedAt)}` : null,
          b.pricing === "individual" ? "Preis individuell" : null,
          b.setupStatus === "removed" ? "Einrichtung zurückgenommen" : null,
        ]),
        oneOff: b.setupFee > 0 && b.setupStatus !== "removed" ? b.setupFee : null,
        monthly: b.feeFrom != null && b.feeTo != null ? b.feeTo - b.feeFrom : null,
        status,
        statusFrom: status === "geplant" && b.startWish && b.startWish > now ? b.startWish : null,
      });
      productTask(row, new Date(b.createdAt.getTime() - 2 * MIN), new Date(b.updatedAt.getTime() + 10 * MIN));
    }
    if (b.endRequestedAt) {
      const row = add({
        id: `productEnd:${b.id}`,
        source: "productBooking",
        sourceId: b.id,
        at: b.endRequestedAt,
        customerId: b.customerId,
        art: "produkt",
        title: `Produkt beenden: ${b.product}`,
        detail: b.catalogKey === "angebot" ? "Produkt aus dem Angebot" : null,
        oneOff: null,
        monthly: null,
        status: "angefragt",
      });
      const re = new RegExp(`^Produkt beenden .*${escapeRe(b.product)}`, "i");
      row.task = findTask(b.customerId, { match: (t) => re.test(t), ...around(b.endRequestedAt) });
      // Beendet: Buchung beendet bzw. Aufgabe erledigt
      if (b.status === "ended" || (row.task && !row.task.open)) row.status = "beendet";
    }
  }

  // ── Budget ──
  for (const ch of src.budgetChanges) {
    const status: BuchungStatus = ch.status === "pending" ? "angefragt" : ch.status === "rejected" ? "abgelehnt" : ch.effectiveFrom > now ? "geplant" : "aktiv";
    const row = add({
      id: `budgetChange:${ch.id}`,
      source: "budgetChange",
      sourceId: ch.id,
      at: ch.createdAt,
      customerId: ch.customerId,
      art: "budget",
      title: ch.status === "applied" ? "Werbebudget geändert" : "Budget-Anfrage (individuelles Angebot)",
      detail: join([
        `${eur(ch.monthlyBudgetFrom)} → ${eur(ch.monthlyBudgetTo)} Werbebudget im Monat`,
        `ab ${fmtDay(ch.effectiveFrom)}`,
        ch.changes.length ? ch.changes.map((c) => `${c.product} ${eur(c.from)} → ${eur(c.to)} pro Tag`).join(", ") : null,
      ]),
      oneOff: null,
      monthly: ch.status !== "pending" && ch.feeFrom != null && ch.feeTo != null ? ch.feeTo - ch.feeFrom : null,
      status,
      statusFrom: status === "geplant" ? ch.effectiveFrom : null,
    });
    const last = Math.max(ch.createdAt.getTime(), ch.effectiveFrom.getTime(), ch.decidedAt?.getTime() ?? 0, ch.feeAppliedAt?.getTime() ?? 0);
    row.task = findTask(ch.customerId, {
      match: (t) => /Budget|^Preis (prüfen|anpassen|bestätigen)/.test(t),
      from: new Date(ch.createdAt.getTime() - 2 * MIN),
      to: new Date(last + 2 * DAY),
    });
  }

  // ── Pausen ──
  for (const p of src.pauses) {
    const dunning = p.kind === "dunning";
    const status: BuchungStatus =
      p.status === "planned" ? "geplant" : p.status === "active" ? "aktiv" : p.status === "cancelled" ? "zurueckgenommen" : "beendet";
    const row = add({
      id: `pause:${p.id}`,
      source: "pause",
      sourceId: p.id,
      at: p.createdAt,
      customerId: p.customerId,
      art: "pause",
      title: dunning ? "Pause wegen Zahlungsverzug" : "Pause",
      detail: join([`${fmtDay(p.startsAt)} bis ${p.endsAt ? fmtDay(p.endsAt) : "auf Widerruf"}`, dunning ? "nur Anzeigen" : p.createdBy === "admin" ? "von uns eingetragen" : "vom Kunden eingetragen"]),
      oneOff: null,
      monthly: null,
      status,
      statusFrom: status === "geplant" ? p.startsAt : null,
    });
    row.task = findTask(p.customerId, { match: (t) => t.startsWith("Pause ") || t.startsWith("Zahlungsverzug"), from: new Date(p.createdAt.getTime() - 2 * MIN), to: new Date(Math.max(p.createdAt.getTime(), p.startsAt.getTime()) + 2 * DAY) });
    const endAt = p.status === "ended" ? (p.resumedAt ?? p.endsAt) : null;
    if (endAt) {
      const end = add({
        id: `pauseEnde:${p.id}`,
        source: "pause",
        sourceId: p.id,
        at: endAt,
        customerId: p.customerId,
        art: "pause",
        title: dunning ? "Pausenende (Zahlung eingegangen)" : "Pausenende",
        detail: `Pause seit ${fmtDay(p.startsAt)}`,
        oneOff: null,
        monthly: null,
        status: "beendet",
      });
      end.task = findTask(p.customerId, { match: (t) => t.startsWith("Pause-Ende"), ...around(endAt, 2 * DAY) });
    }
  }

  // ── Nachrichten-Pakete ──
  for (const k of src.packs) {
    const row = add({
      id: `pack:${k.id}`,
      source: "pack",
      sourceId: k.id,
      at: k.purchasedAt,
      customerId: k.customerId,
      art: "paket",
      title: `Nachrichten-Paket ${k.messages.toLocaleString("de-DE")} Nachrichten`,
      detail: join([k.source === "auto" ? "automatisch nachgebucht" : "vom Kunden gebucht", `gültig bis ${fmtDay(k.expiresAt)}`]),
      oneOff: k.amount,
      monthly: null,
      status: k.expiresAt > now ? "aktiv" : "beendet",
    });
    if (k.stripeStatus === "failed") row.task = { open: true, title: "Rechnungsposten bei Stripe fehlgeschlagen", href: abrechnungHref(k.customerId) };
  }

  // ── Kollegen-Prämien ──
  for (const f of src.referrals) {
    if (!["credited", "done_manual", "manual", "processing"].includes(f.rewardStatus)) continue;
    const done = f.rewardStatus === "credited" || f.rewardStatus === "done_manual";
    const at = done ? (f.rewardedAt ?? f.updatedAt) : (f.wonAt ?? f.updatedAt);
    const row = add({
      id: `referral:${f.id}`,
      source: "referral",
      sourceId: f.id,
      at,
      customerId: f.referrerId,
      art: "rabatt",
      title: done ? "Kollegen-Prämie gutgeschrieben" : "Kollegen-Prämie offen",
      detail: join([`Empfehlung: ${f.company || f.name || "ohne Namen"}`, f.rewardNote]),
      oneOff: f.rewardAmount != null ? -f.rewardAmount : null,
      monthly: null,
      status: done ? "aktiv" : "angefragt",
    });
    row.task = findTask(f.referrerId, { match: (t) => t.includes("Prämie"), from: new Date(Math.min(at.getTime(), f.updatedAt.getTime()) - 2 * MIN), to: new Date(f.updatedAt.getTime() + 10 * MIN) });
  }

  // ── Änderungsprotokoll (nur, wo keine Tabelle) ──
  const audits = src.audits.filter((a) => (AUDIT_ACTIONS as readonly string[]).includes(a.action)).sort((a, b) => a.at.getTime() - b.at.getTime());
  const byCustomer = new Map<string, SrcAudit[]>();
  for (const a of audits) {
    if (!a.customerId) continue;
    byCustomer.set(a.customerId, [...(byCustomer.get(a.customerId) ?? []), a]);
  }
  const auditRow = (a: SrcAudit, art: BuchungArt, title: string, rest: Partial<BuchungRow> = {}, suffix = "") =>
    add({ id: `audit:${a.id}${suffix}`, source: "audit", sourceId: a.id, at: a.at, customerId: a.customerId, art, title, oneOff: null, monthly: null, status: "aktiv", ...rest });

  for (const [customerId, list] of byCustomer) {
    const c = customers.get(customerId);
    // Kunde gelöscht (Datenschutz-Löschung): Protokoll bleibt, gehört aber in keine Buchungsliste
    if (!c) continue;
    // Module: Zustand je Modul (Preis im Abo, offene Kündigung)
    const mod = {
      bestand: { price: null as number | null, cancel: null as BuchungRow | null, request: null as BuchungRow | null },
      empfehlung: { price: null as number | null, cancel: null as BuchungRow | null, request: null as BuchungRow | null },
    };
    const fallback = { bestand: c.bestandMonthly || PRICE_LIST.bestandModuleMonthly, empfehlung: c.empfehlungMonthly || PRICE_LIST.empfehlungModuleMonthly };
    const modName = { bestand: "Bestandskunden-Modul", empfehlung: "Modul Empfehlungen & Bewertungen" };
    // Plätze: Preis je weiterem Platz, berechnete Plätze, letzte Konditionsänderung (zum Zusammenfassen)
    let seatPrice: number | null = null;
    let seatsBilled: number | null = null;
    let seatConfig: BuchungRow | null = null;
    let kuendigung: BuchungRow | null = null;

    for (const a of list) {
      const d = obj(a.details);
      const mode = str(d.mode);
      switch (a.action) {
        case "billing.bestand":
        case "billing.empfehlung":
        case "empfehlung.book":
        case "empfehlung.trial_end": {
          const key = a.action === "billing.bestand" ? "bestand" : "empfehlung";
          const m = mod[key];
          const name = modName[key];
          if (a.action === "empfehlung.book" && mode === "withdraw_cancel") break; // = billing.empfehlung cancel_withdrawn
          if (a.action === "empfehlung.book" && mode === "trial") {
            const until = date(d.until);
            auditRow(a, "modul", `${name}: Testphase`, { detail: until ? `kostenlos bis ${fmtDay(until)}` : "kostenlos", monthly: null });
            m.price = 0;
            break;
          }
          if (a.action === "empfehlung.trial_end") {
            const price = num(d.price) ?? fallback.empfehlung;
            auditRow(a, "modul", `${name}: kostenpflichtig nach Testphase`, { monthly: price - (m.price ?? 0) });
            m.price = price;
            break;
          }
          const bookMode = a.action === "empfehlung.book" ? "book" : mode; // empfehlung.book „paid“ = Buchung
          if (bookMode === "book") {
            const price = num(d.price) ?? fallback[key];
            if (m.cancel && m.cancel.status !== "zurueckgenommen" && (!m.cancel.statusFrom || m.cancel.statusFrom > a.at)) {
              // Kündigung vor Ablauf zurückgenommen: keine neue Buchung, die Kündigung zählt nicht
              m.cancel.status = "zurueckgenommen";
              m.cancel.statusFrom = null;
              m.cancel.detail = join([m.cancel.detail, `zurückgenommen am ${fmtDay(a.at)}`]);
              m.cancel = null;
              m.price = price;
              break;
            }
            const reward =
              key === "bestand" && a.actorRole === "system"
                ? src.referrals.find((f) => f.referrerId === customerId && Math.abs((f.rewardedAt ?? f.updatedAt).getTime() - a.at.getTime()) <= 10 * MIN)
                : undefined;
            const prev = num(d.from) ?? m.price ?? 0;
            auditRow(a, "modul", reward ? `${name} gebucht (Empfehlungsprämie)` : `${name} gebucht`, {
              monthly: price - prev,
              detail: reward ? join([`für Empfehlung: ${reward.company || reward.name || "ohne Namen"}`, c.bestandFreeUntil ? `gratis bis ${fmtDay(c.bestandFreeUntil)}` : "gratis als Gutschrift"]) : `${eur(price)} im Monat`,
            });
            if (m.request) {
              m.request.status = "aktiv";
              m.request.detail = `gebucht am ${fmtDay(a.at)}`;
              m.request = null;
            }
            m.price = price;
            m.cancel = null;
            break;
          }
          if (bookMode === "free") {
            const prev = num(d.from) ?? m.price ?? 0;
            auditRow(a, "modul", `${name} kostenlos freigeschaltet`, { monthly: prev ? -prev : null });
            if (m.request) {
              m.request.status = "aktiv";
              m.request.detail = `kostenlos freigeschaltet am ${fmtDay(a.at)}`;
              m.request = null;
            }
            m.price = 0;
            m.cancel = null;
            break;
          }
          if (bookMode === "cancel" || bookMode === "cancel_at_period_end") {
            const known = num(d.from) ?? (bookMode === "cancel_at_period_end" ? num(d.price) : null) ?? m.price;
            const prev = known ?? fallback[key];
            const until = bookMode === "cancel_at_period_end" ? date(d.until) : null;
            const row = auditRow(a, "modul", bookMode === "cancel" ? `${name} abbestellt` : `${name} gekündigt`, {
              monthly: prev ? -prev : null,
              detail: join([until ? `zum ${fmtDay(until)}` : "sofort", known == null ? "Betrag geschätzt" : null]),
              ...(until && until > now ? { status: "geplant" as const, statusFrom: until } : { status: "beendet" as const }),
            });
            m.cancel = bookMode === "cancel_at_period_end" ? row : null;
            m.price = 0;
            break;
          }
          if (bookMode === "cancel_withdrawn") {
            if (m.cancel) {
              m.cancel.status = "zurueckgenommen";
              m.cancel.statusFrom = null;
              m.cancel.detail = join([m.cancel.detail, `zurückgenommen am ${fmtDay(a.at)}`]);
              m.price = -(m.cancel.monthly ?? 0) || m.price;
              m.cancel = null;
            }
            break;
          }
          // „expired“: Ausführung der geplanten Kündigung, keine neue Zeile
          if (bookMode === "expired") {
            m.cancel = null;
            m.price = 0;
          }
          break;
        }
        case "bestand.request": {
          const open = !!c.bestandRequestedAt && !c.existingCustomersEnabled;
          mod.bestand.request = auditRow(a, "modul", "Bestandskunden-Modul angefragt", { status: open ? "angefragt" : "beendet" });
          break;
        }
        case "billing.seats": {
          const cfgPrice = obj(d.seatMonthly);
          if ("seatMonthly" in d || "seatsIncluded" in d) {
            // Konditionen (Kundenakte): inklusive Plätze bzw. Preis je weiterem Platz
            const inc = obj(d.seatsIncluded);
            const pFrom = num(cfgPrice.from);
            const pTo = num(cfgPrice.to);
            const billed = seatsBilled ?? c.seatsBilled ?? 0;
            seatConfig = auditRow(a, "plaetze", "Verkäufer-Plätze: Konditionen geändert", {
              detail: join([
                num(inc.from) !== num(inc.to) ? `inklusive ${num(inc.from) ?? "keine"} → ${num(inc.to) ?? "keine"}` : null,
                pFrom !== pTo ? `je weiterem Platz ${pFrom != null ? eur(pFrom) : "ohne"} → ${pTo != null ? eur(pTo) : "ohne"}` : null,
              ]),
              monthly: billed && pFrom != null && pTo != null && pFrom !== pTo ? billed * (pTo - pFrom) : null,
            });
            if (pTo != null) seatPrice = pTo;
            break;
          }
          const from = num(d.from);
          const to = num(d.to);
          if (from == null || to == null) break;
          const price = num(d.price) ?? seatPrice ?? c.seatMonthly ?? PRICE_LIST.seatMonthly;
          const delta = (to - from) * price;
          const task = findTask(customerId, { match: (t) => t.startsWith("Platz von Hand abrechnen"), ...around(a.at) });
          if (seatConfig && a.at.getTime() - seatConfig.at.getTime() <= 2 * MIN) {
            // gehört zur Konditionsänderung kurz davor: zusammenfassen
            seatConfig.monthly = r2((seatConfig.monthly ?? 0) + delta) || null;
            seatConfig.detail = join([seatConfig.detail, `berechnete weitere Plätze ${from} → ${to}`]);
            seatConfig.task = seatConfig.task ?? task;
          } else {
            const n = to - from;
            auditRow(a, "plaetze", n > 0 ? (n === 1 ? "1 weiterer Verkäufer-Platz" : `${n} weitere Verkäufer-Plätze`) : n < 0 ? "Verkäufer-Plätze reduziert" : "Verkäufer-Plätze abgeglichen", {
              detail: join([`berechnete weitere Plätze ${from} → ${to}`, `je ${eur(price)}`, num(d.active) != null ? `${num(d.active)} aktive Verkäufer` : null]),
              monthly: delta || null,
              task,
            });
          }
          seatConfig = null;
          seatsBilled = to;
          if (num(d.price) != null) seatPrice = num(d.price);
          break;
        }
        case "billing.retainer": {
          if (d.source) break; // aus Budgetänderung bzw. Produktstart: steht schon als BudgetChange/ProductBooking
          const monthly = obj(d.monthly);
          const mFrom = num(monthly.from);
          const mTo = num(monthly.to);
          const end = obj(d.end);
          const endFrom = str(end.from);
          const endTo = str(end.to);
          if (endTo && endTo !== endFrom) {
            const last = date(endTo)!;
            const base = mTo ?? mFrom ?? c.retainerMonthly ?? null;
            kuendigung = auditRow(a, "kuendigung", "Vertrag beendet (Betreuung)", {
              detail: `letzter Tag ${fmtDay(last)}`,
              monthly: base ? -base : null,
              ...(last > now ? { status: "geplant" as const, statusFrom: last } : { status: "beendet" as const }),
            });
            kuendigungByCustomer.set(customerId, kuendigung);
          } else if (endFrom && !endTo && kuendigung) {
            kuendigung.status = "zurueckgenommen";
            kuendigung.statusFrom = null;
            kuendigung.detail = join([kuendigung.detail, `zurückgenommen am ${fmtDay(a.at)}`]);
            kuendigungByCustomer.delete(customerId);
            kuendigung = null;
          }
          if (mFrom !== mTo && (mFrom != null || mTo != null)) {
            auditRow(
              a,
              "preis",
              mTo == null ? "Betreuungsgebühr entfernt" : mFrom == null ? "Betreuungsgebühr eingetragen" : "Betreuungsgebühr geändert",
              { detail: `${mFrom != null ? eur(mFrom) : "keine"} → ${mTo != null ? eur(mTo) : "keine"} im Monat`, monthly: (mTo ?? 0) - (mFrom ?? 0) },
              ":preis",
            );
          }
          break;
        }
        case "produkt.anfrage": {
          const wish = str(d.wish) ?? "";
          const row = auditRow(a, "produkt_anfrage", "Produkt-Anfrage außerhalb des Katalogs", { detail: wish || null, status: "angefragt" });
          const head = wish.slice(0, 40);
          row.task = findTask(customerId, { match: (t) => t.startsWith("Produkt-Anfrage") && (!head || t.includes(head)), ...around(a.at) });
          if (row.task && !row.task.open) row.status = "beendet";
          break;
        }
        case "bestand.paket_anfrage": {
          const n = num(d.messagesPerMonth);
          const row = auditRow(a, "paket", "Großes Nachrichtenpaket angefragt", {
            detail: join([n ? `${n.toLocaleString("de-DE")} Nachrichten im Monat` : null, str(d.note)]),
            status: "angefragt",
          });
          row.task = findTask(customerId, { match: (t) => t.includes("individuelles Nachrichtenpaket"), ...around(a.at) });
          if (row.task && !row.task.open) row.status = "beendet";
          break;
        }
      }
    }
  }

  // ── Kündigungen aus Stripe (Abo beendet) und Vertragsende ohne Protokoll ──
  for (const o of src.offers) {
    if (!o.acceptedAt || o.subscriptionStatus !== "canceled") continue;
    const at = o.canceledAt ?? o.updatedAt;
    const existing = o.customerId ? kuendigungByCustomer.get(o.customerId) : undefined;
    if (existing) {
      existing.detail = join([existing.detail, `Abo bei Stripe beendet am ${fmtDay(at)}`]);
      continue;
    }
    const c = o.customerId ? customers.get(o.customerId) : undefined;
    const base = c?.retainerMonthly ?? o.monthlyFee;
    const row = add({
      id: `offer-ende:${o.id}`,
      source: "offer",
      sourceId: o.id,
      at,
      customerId: o.customerId,
      customerName: o.customerId ? nameOf(o.customerId) : o.company || o.contactName,
      href: o.customerId ? abrechnungHref(o.customerId) : o.salesContactId ? `/admin/vertrieb/kontakte/${o.salesContactId}` : "/admin/vertrieb/angebote",
      art: "kuendigung",
      title: "Abo beendet (Stripe)",
      detail: `Angebot ${o.number}`,
      oneOff: null,
      monthly: base ? -base : null,
      status: "beendet",
    });
    if (o.customerId) kuendigungByCustomer.set(o.customerId, row);
  }
  for (const c of src.customers) {
    if (!c.retainerEnd || kuendigungByCustomer.has(c.id)) continue;
    add({
      id: `customer-ende:${c.id}`,
      source: "customer",
      sourceId: c.id,
      at: c.retainerEnd,
      customerId: c.id,
      art: "kuendigung",
      title: "Vertrag beendet (Betreuung)",
      detail: `letzter Tag ${fmtDay(c.retainerEnd)}`,
      oneOff: null,
      monthly: c.retainerMonthly ? -c.retainerMonthly : null,
      ...(c.retainerEnd > now ? { status: "geplant" as const, statusFrom: c.retainerEnd } : { status: "beendet" as const }),
    });
  }

  // ── Lebenszyklus: Reaktivierung, Vertragsende mit Ruhephase (lib/ruhend.ts) ──
  for (const e of src.lifecycle ?? []) {
    const d = obj(e.details);
    if (e.kind === "reactivated") {
      const days = num(d.dormantDays);
      const row = add({
        id: `lifecycle:${e.id}`,
        source: "lifecycle",
        sourceId: e.id,
        at: e.at,
        customerId: e.customerId,
        art: "reaktivierung",
        title: "Konto reaktiviert",
        detail: join([str(d.package), e.mrr ? `bisher ${eur(e.mrr)} im Monat` : null, days != null ? `ruhte ${days} Tage` : null, "Abrechnung startet Ole neu"]),
        oneOff: null,
        monthly: e.mrr ?? null,
        status: "aktiv",
      });
      row.task = findTask(e.customerId, { match: (t) => t.startsWith("Reaktivierung:"), ...around(e.at) });
    } else if (e.kind === "dormant") {
      const c = customers.get(e.customerId);
      const end = str(d.contractEnd);
      // Steht dasselbe Vertragsende noch als Betreuungsgebühr-Ende da, zeigt es schon die Zeile „Vertrag beendet“
      if (c?.retainerEnd && end && dayIso(c.retainerEnd) === end) continue;
      add({
        id: `lifecycle:${e.id}`,
        source: "lifecycle",
        sourceId: e.id,
        at: e.at,
        customerId: e.customerId,
        art: "kuendigung",
        title: "Vertrag beendet, Konto ruht",
        detail: end ? `letzter Tag ${fmtDay(date(end)!)}` : null,
        oneOff: null,
        monthly: e.mrr ? -e.mrr : null,
        status: "beendet",
      });
    }
  }

  return rows.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));
}

const dayIso = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);

// ─── Filter, Summen, CSV ─────────────────────────────────────────────────

export type BuchungFilter = { monat?: string; von?: string; bis?: string; art?: string; status?: string; kunde?: string; q?: string };

/** „JJJJ-MM“ in Berliner Zeit. */
export function berlinMonth(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
}

/** Zeitraum: Standard dieser Monat; monat „alle“ = ohne Grenze. */
export function buchungRange(f: BuchungFilter, now: Date = new Date()): { from: Date | null; to: Date | null } {
  if (f.monat === "alle") return { from: null, to: null };
  if (!f.monat && !f.von && !f.bis) return filterRange({ monat: berlinMonth(now) });
  return filterRange({ monat: f.monat, von: f.von, bis: f.bis });
}

export function filterBuchungen(rows: BuchungRow[], f: BuchungFilter, now: Date = new Date()): BuchungRow[] {
  const { from, to } = buchungRange(f, now);
  const q = f.q?.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!from || r.at >= from) &&
      (!to || r.at < to) &&
      (!f.art || r.art === f.art) &&
      (!f.kunde || r.customerId === f.kunde) &&
      (!f.status || (f.status === "offen" ? isOpen(r) : r.status === f.status)) &&
      (!q || `${r.customerName} ${r.title} ${r.detail ?? ""}`.toLowerCase().includes(q)),
  );
}

export function sumBuchungen(rows: BuchungRow[]): BuchungSums {
  let monthly = 0;
  let oneOff = 0;
  let open = 0;
  for (const r of rows) {
    if (COUNTED_STATUS.includes(r.status)) {
      monthly += r.monthly ?? 0;
      oneOff += r.oneOff ?? 0;
    }
    if (isOpen(r)) open++;
  }
  return { monthly: r2(monthly), oneOff: r2(oneOff), open, count: rows.length };
}

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (n: number | null) => (n == null ? "" : n.toFixed(2).replace(".", ","));

/** CSV (Semikolon, UTF-8 mit BOM, Excel-tauglich). baseUrl macht die Links absolut. */
export function buchungenCsv(rows: BuchungRow[], baseUrl = ""): string {
  const header = ["Datum", "Kunde", "Art", "Vorgang", "Details", "Einmalig netto", "Monatlich netto (Änderung)", "Status", "Offene Aufgabe", "Aufgabe", "Kundenakte"];
  const lines = rows.map((r) =>
    [
      fmtDay(r.at),
      r.customerName,
      ART_LABEL[r.art],
      r.title,
      r.detail ?? "",
      money(r.oneOff),
      money(r.monthly),
      statusText(r),
      r.task?.open ? "ja" : "nein",
      r.task?.open ? r.task.title : "",
      `${baseUrl}${r.href}`,
    ]
      .map(cell)
      .join(";"),
  );
  return "﻿" + [header.join(";"), ...lines].join("\r\n");
}

// ─── Laden ───────────────────────────────────────────────────────────────

const n = (v: unknown): number | null => (v == null ? null : Number(v));

/** Alle Quellen aus der Datenbank (Kundenzahl klein: alles laden, dann im Speicher filtern). */
export async function loadBuchungSources(now: Date = new Date()): Promise<BuchungSources> {
  const since = new Date(now.getTime() - 400 * DAY);
  const [customers, offers, onboardings, bookings, budgets, pauses, packs, referrals, audits, tasks, cancelActs, lifecycle] = await Promise.all([
    prisma.customer.findMany({
      // Testkunden zählen nicht (Ole, 15.11.2026)
      where: { isTest: false },
      select: {
        id: true,
        name: true,
        retainerMonthly: true,
        retainerEnd: true,
        seatMonthly: true,
        seatsBilled: true,
        bestandMonthly: true,
        empfehlungMonthly: true,
        bestandRequestedAt: true,
        existingCustomersEnabled: true,
        bestandFreeUntil: true,
        salesContact: { select: { id: true } },
        onboarding: { select: { salesContactId: true } },
      },
    }),
    prisma.offer.findMany({
      where: { status: "accepted", acceptedAt: { not: null }, isTest: false },
      select: {
        id: true,
        number: true,
        company: true,
        contactName: true,
        salesContactId: true,
        acceptedAt: true,
        startDate: true,
        term: true,
        products: true,
        setupFee: true,
        setupListFee: true,
        setupDiscount: true,
        setupDiscountLabel: true,
        monthlyFee: true,
        introMonthlyFee: true,
        introMonths: true,
        seats: true,
        seatsIncluded: true,
        seatMonthly: true,
        bestandMonthly: true,
        empfehlungMonthly: true,
        annualPrepay: true,
        annualFreeMonths: true,
        subscriptionStatus: true,
        updatedAt: true,
      },
    }),
    prisma.onboarding.findMany({ where: { offerId: { not: null } }, select: { customerId: true, offerId: true } }),
    prisma.productBooking.findMany(),
    prisma.budgetChange.findMany(),
    prisma.customerPause.findMany(),
    prisma.bestandMessagePack.findMany({ select: { id: true, customerId: true, messages: true, amount: true, purchasedAt: true, expiresAt: true, source: true, stripeStatus: true } }),
    prisma.colleagueReferral.findMany({
      where: { rewardStatus: { in: ["credited", "done_manual", "manual", "processing"] } },
      select: { id: true, referrerId: true, name: true, company: true, rewardStatus: true, rewardAmount: true, rewardNote: true, rewardedAt: true, wonAt: true, updatedAt: true },
    }),
    prisma.auditLog.findMany({ where: { action: { in: [...AUDIT_ACTIONS] } }, select: { id: true, at: true, action: true, customerId: true, actorRole: true, details: true }, orderBy: { at: "asc" } }),
    prisma.salesTask.findMany({ where: { createdAt: { gte: since }, type: "SONSTIGES" }, select: { id: true, contactId: true, title: true, createdAt: true, doneAt: true } }),
    prisma.salesActivity.findMany({ where: { outcome: { startsWith: "Abo zu " } }, select: { outcome: true, occurredAt: true } }),
    prisma.customerLifecycleEvent.findMany({ where: { kind: { in: ["reactivated", "dormant"] }, customer: { isTest: false } }, select: { id: true, customerId: true, kind: true, at: true, mrr: true, details: true } }),
  ]);
  const customerOfOffer = new Map(onboardings.map((o) => [o.offerId!, o.customerId]));
  const canceledAt = new Map<string, Date>();
  for (const a of cancelActs) {
    const m = /^Abo zu (\S+) beendet/.exec(a.outcome ?? "");
    if (m && (!canceledAt.has(m[1]) || canceledAt.get(m[1])! < a.occurredAt)) canceledAt.set(m[1], a.occurredAt);
  }
  return {
    customers: customers.map((c) => ({
      id: c.id,
      name: c.name,
      contactId: c.salesContact?.id ?? c.onboarding?.salesContactId ?? null,
      retainerMonthly: n(c.retainerMonthly),
      retainerEnd: c.retainerEnd,
      seatMonthly: n(c.seatMonthly),
      seatsBilled: c.seatsBilled,
      bestandMonthly: n(c.bestandMonthly),
      empfehlungMonthly: n(c.empfehlungMonthly),
      bestandRequestedAt: c.bestandRequestedAt,
      existingCustomersEnabled: c.existingCustomersEnabled,
      bestandFreeUntil: c.bestandFreeUntil,
    })),
    offers: offers.map((o) => ({
      ...o,
      customerId: customerOfOffer.get(o.id) ?? null,
      products: (Array.isArray(o.products) ? o.products : []).map((p) => ({ name: String(obj(p).name ?? ""), dailyBudget: Number(obj(p).dailyBudget ?? 0) })),
      setupFee: Number(o.setupFee),
      setupListFee: n(o.setupListFee),
      setupDiscount: n(o.setupDiscount),
      monthlyFee: Number(o.monthlyFee),
      introMonthlyFee: n(o.introMonthlyFee),
      seatMonthly: n(o.seatMonthly),
      bestandMonthly: n(o.bestandMonthly),
      empfehlungMonthly: n(o.empfehlungMonthly),
      canceledAt: canceledAt.get(o.number) ?? null,
    })),
    productBookings: bookings.map((b) => ({
      id: b.id,
      customerId: b.customerId,
      catalogKey: b.catalogKey,
      product: b.product,
      dailyBudget: Number(b.dailyBudget),
      startWish: b.startWish,
      status: b.status,
      feeFrom: n(b.feeFrom),
      feeTo: n(b.feeTo),
      setupFee: Number(b.setupFee),
      setupStatus: b.setupStatus,
      pricing: b.pricing,
      startedAt: b.startedAt,
      endRequestedAt: b.endRequestedAt,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
    budgetChanges: budgets.map((b) => ({
      id: b.id,
      customerId: b.customerId,
      changes: (Array.isArray(b.changes) ? b.changes : []).map((x) => ({ product: String(obj(x).product ?? ""), from: Number(obj(x).from ?? 0), to: Number(obj(x).to ?? 0) })),
      effectiveFrom: b.effectiveFrom,
      monthlyBudgetFrom: b.monthlyBudgetFrom,
      monthlyBudgetTo: b.monthlyBudgetTo,
      feeFrom: n(b.feeFrom),
      feeTo: n(b.feeTo),
      status: b.status,
      decidedAt: b.decidedAt,
      feeAppliedAt: b.feeAppliedAt,
      createdAt: b.createdAt,
    })),
    pauses: pauses.map((p) => ({
      id: p.id,
      customerId: p.customerId,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      status: p.status,
      kind: p.kind,
      createdBy: p.createdBy,
      resumedAt: p.resumedAt,
      createdAt: p.createdAt,
    })),
    packs: packs.map((k) => ({ ...k, amount: Number(k.amount) })),
    referrals: referrals.map((f) => ({ ...f, rewardAmount: n(f.rewardAmount) })),
    audits,
    tasks,
    lifecycle: lifecycle.map((e) => ({ ...e, mrr: n(e.mrr) })),
  };
}

export type BuchungenResult = {
  rows: BuchungRow[];
  sums: BuchungSums;
  range: { from: Date | null; to: Date | null };
  customers: { id: string; name: string }[];
};

/** Buchungen für die Seite bzw. den CSV-Export. */
export async function loadBuchungen(f: BuchungFilter, now: Date = new Date()): Promise<BuchungenResult> {
  const all = buildBuchungen(await loadBuchungSources(now), now);
  const rows = filterBuchungen(all, f, now);
  const seen = new Map<string, string>();
  for (const r of all) if (r.customerId && !seen.has(r.customerId)) seen.set(r.customerId, r.customerName);
  return {
    rows,
    sums: sumBuchungen(rows),
    range: buchungRange(f, now),
    customers: [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "de")),
  };
}
