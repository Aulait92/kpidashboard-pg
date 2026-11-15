// Halteangebote beim Kündigen (Ole, 15.11.2026): Einstellungen, Angebote je Kunde und Grund, Annahme mit Wirkung.
// Regeln und Texte: lib/halteangebote.ts, Auswahl je Grund: lib/anti-churn.offersFor.
//
// Annahme (acceptHalteOffer): Angebot gespeichert (RetentionOffer), Kündigungsabsicht abgeschlossen, Änderungsprotokoll,
// Push an Admins und Aufgabe in „Heute“. Stripe je Angebot:
// - rabatt: Gutschein „repeating“ (Prozent, Monate) am laufenden Abo (billing.applyRetentionCoupon), Bindung in
//   Customer.retentionCommitUntil (Konto und Kündigungstermin), Bestätigung per E-Mail. Sonst Aufgabe „von Hand“.
// - neustart: 100 % auf die Betreuungs-Position für 1 Monat (Gutschein mit applies_to), sonst Aufgabe „Gutschrift von Hand“.
// - neuausrichtung: keine Geldbewegung; Aufgabe mit den Leads mit falschen Daten der letzten 30 Tage zur Prüfung.
// - pause_gratis: vorhandene Pause (lib/pause.ts) mit free = true, die ganze Abrechnung ruht (pause_collection).
// - nur_bestand: Aufgabe „Stripe umstellen“ (kein fertiger Stripe-Preis im Code; Preis-ID optional aus
//   STRIPE_PRICE_NUR_BESTAND als Hinweis in der Aufgabe). produktwechsel, einrichtung: ohne Abrechnung.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { customerGreeting } from "@/lib/offer-links";
import { berlinTodayIso, PRICE_LIST } from "@/lib/offer-pricing";
import { berlinEndOfDay, fmtIso } from "@/lib/vertrag-laufzeit";
import { canonicalProductKey, displayProduct } from "@/lib/products";
import { CHURN_OFFERS, churnReasonLabel, isChurnReason, offersFor, type ChurnOffer, type ChurnReason, type HalteKind, isHalteKind } from "@/lib/anti-churn";
import {
  addMonthsIso,
  commitEndIso,
  discountEligibility,
  enabledKinds,
  HALTE_LABEL,
  halteOfferView,
  isDiscountOffer,
  normalizeHalteSettings,
  suggestSparte,
  type DiscountCheck,
  type HalteSettings,
  type OfferView,
  type SparteRate,
  type SparteSuggestion,
} from "@/lib/halteangebote";

const DAY = 86_400_000;
const berlinIso = (d: Date) => berlinTodayIso(d);
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

// ─── Einstellungen ───────────────────────────────────────────────────────

export async function loadHalteSettings(): Promise<HalteSettings> {
  const row = await prisma.retentionOfferSettings.findUnique({ where: { id: "default" } }).catch(() => null);
  return normalizeHalteSettings(row?.config ?? null);
}

export async function saveHalteSettings(input: Partial<Record<keyof HalteSettings, unknown>>): Promise<HalteSettings> {
  const next = normalizeHalteSettings({ ...(await loadHalteSettings()), ...input });
  const config = next as unknown as Prisma.InputJsonValue;
  await prisma.retentionOfferSettings.upsert({ where: { id: "default" }, create: { id: "default", config }, update: { config } });
  return next;
}

// ─── Kunde: Start, Rabatt-Regeln, Kontext ────────────────────────────────

async function customerFor(customerId: string) {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      plan: true,
      isTest: true,
      stripeCustomerId: true,
      retainerStart: true,
      retainerMonthly: true,
      billingInterval: true,
      cancelRequestedAt: true,
      retentionCommitUntil: true,
      existingCustomersEnabled: true,
      empfehlungEnabled: true,
      salesContact: { select: { id: true } },
      onboarding: { select: { offerId: true, salesContactId: true } },
    },
  });
  if (!c) return null;
  const offer = c.onboarding?.offerId ? await prisma.offer.findUnique({ where: { id: c.onboarding.offerId }, select: { startDate: true, contactName: true, softwareFee: true } }) : null;
  const start = c.retainerStart ?? offer?.startDate ?? null;
  return { c, offer, startIso: start ? berlinIso(start) : null, contactId: c.salesContact?.id ?? c.onboarding?.salesContactId ?? null };
}

/** Letzter angenommener Rabatt (YYYY-MM-DD) für die Regel „höchstens einmal in 12 Monaten“. */
export async function lastDiscountIso(customerId: string): Promise<string | null> {
  const last = await prisma.retentionOffer.findFirst({ where: { customerId, discount: true }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  return last ? berlinIso(last.createdAt) : null;
}

export type HalteCustomerContext = {
  s: HalteSettings;
  todayIso: string;
  startIso: string | null;
  annual: boolean;
  service: boolean;
  discount: DiscountCheck;
  commitIso: string;
  hasModules: boolean;
  canPause: boolean;
};

export async function halteContext(customerId: string, now = new Date()): Promise<HalteCustomerContext | null> {
  const r = await customerFor(customerId);
  if (!r) return null;
  const s = await loadHalteSettings();
  const todayIso = berlinIso(now);
  const annual = r.c.billingInterval === "year";
  const [last, pause] = await Promise.all([lastDiscountIso(customerId), prisma.customerPause.findFirst({ where: { customerId, status: { in: ["planned", "active"] } }, select: { id: true } })]);
  return {
    s,
    todayIso,
    startIso: r.startIso,
    annual,
    service: r.c.plan === "service",
    discount: discountEligibility({ startIso: r.startIso, todayIso, lastDiscountIso: last, annual, s }),
    commitIso: commitEndIso({ startIso: r.startIso, todayIso, months: s.rabattMonths, commitMonths: s.rabattCommitMonths }),
    hasModules: !!(r.c.existingCustomersEnabled || r.c.empfehlungEnabled),
    canPause: !pause,
  };
}

const offersCtx = (x: HalteCustomerContext) => ({
  hasModules: x.hasModules,
  canPause: x.canPause,
  discountOk: x.discount.ok,
  enabled: enabledKinds(x.s),
  service: x.service,
});

// ─── Spartenwechsel: Abschlussquote je Sparte über alle Kunden ───────────

/** Leads und Abschlüsse je Sparte (letzte 12 Monate, ohne Testkunden, ohne anerkannte Stornos). */
export async function sparteRates(now = new Date()): Promise<SparteRate[]> {
  const rows = await prisma.lead.groupBy({
    by: ["source", "status"],
    where: {
      createdAt: { gte: new Date(now.getTime() - 365 * DAY) },
      erasedAt: null,
      OR: [{ stornoState: null }, { stornoState: { not: "approved" } }],
      customer: { isTest: false, plan: { not: "internal" } },
    },
    _count: { _all: true },
  });
  const m = new Map<string, SparteRate>();
  for (const r of rows) {
    const raw = (r.source ?? "").trim();
    if (!raw) continue;
    const key = canonicalProductKey(raw);
    const x = m.get(key) ?? { key, label: displayProduct(key), leads: 0, closes: 0 };
    x.leads += r._count._all;
    if (r.status === "Abschluss") x.closes += r._count._all;
    m.set(key, x);
  }
  return [...m.values()];
}

async function customerSparten(customerId: string, now: Date): Promise<string[]> {
  const rows = await prisma.lead.groupBy({ by: ["source"], where: { customerId, createdAt: { gte: new Date(now.getTime() - 365 * DAY) } }, _count: { _all: true } });
  return [...new Set(rows.map((r) => (r.source ?? "").trim()).filter(Boolean).map(canonicalProductKey))];
}

export async function sparteSuggestion(customerId: string, s: HalteSettings, now = new Date()): Promise<{ suggestion: SparteSuggestion | null; rates: SparteRate[]; current: string[] }> {
  const [rates, current] = await Promise.all([sparteRates(now), customerSparten(customerId, now)]);
  return { suggestion: suggestSparte(rates, current, s.produktwechselMinLeads), rates, current };
}

// ─── Angebote für das Kündigungsfenster ──────────────────────────────────

/** Feste Alternativen (Pause, Budget, Module, Termin, Check, Rückruf) als Ansicht. */
function staticView(o: ChurnOffer): OfferView {
  const x = CHURN_OFFERS[o];
  return { key: o, title: x.title, text: x.text, cta: x.cta, ...(x.anchor ? { anchor: x.anchor } : {}), form: o === "termin" ? "termin" : "simple" };
}

export type ChurnOffersResult = { offers: OfferView[]; einrichtungSlots: { start: string }[] };

/** Angebote zum gewählten Grund mit den aktuellen Werten (nach dem Speichern der Absicht). */
export async function churnOfferViews(customerId: string, reason: ChurnReason | null, now = new Date()): Promise<ChurnOffersResult> {
  const x = await halteContext(customerId, now);
  if (!x) return { offers: [staticView("rueckruf")], einrichtungSlots: [] };
  const keys = offersFor(reason, offersCtx(x));
  let einrichtungSlots: { start: string }[] = [];
  if (keys.includes("einrichtung")) {
    const { helpCallSlots } = await import("@/lib/help-call");
    einrichtungSlots = (await helpCallSlots(x.s.einrichtungMinutes).catch(() => [])).map((sl) => ({ start: sl.start }));
  }
  const suggestion = keys.includes("produktwechsel") ? (await sparteSuggestion(customerId, x.s, now).catch(() => ({ suggestion: null }))).suggestion : null;
  let referralHint: string | null = null;
  if (keys.includes("nur_bestand")) {
    const { loadReferralSettings } = await import("@/lib/kollegen");
    const { referralIncentiveSentence } = await import("@/lib/kollegen-shared");
    const rs = await loadReferralSettings().catch(() => null);
    if (rs?.enabled) referralHint = `Übergeben Sie Ihren Bestand an einen Nachfolger? Empfehlen Sie uns weiter: ${referralIncentiveSentence(rs)}`;
  }
  const offers = keys.map((k) =>
    isHalteKind(k)
      ? halteOfferView(k, { s: x.s, discountOk: x.discount.ok, commitIso: x.commitIso, suggestion, todayIso: x.todayIso, einrichtungSlots: einrichtungSlots.length > 0, referralHint })
      : staticView(k),
  );
  return { offers, einrichtungSlots };
}

// ─── Annahme ─────────────────────────────────────────────────────────────

export type HalteInput = { intentId: string; kind: HalteKind; note?: string | null; start?: string | null; from?: string | null; until?: string | null; confirmed?: boolean };
export type HalteResult = { ok: true; message: string; offerId: string; already?: boolean } | { ok: false; error: string };

type Task = { title: string; note: string; type?: "ANRUF" | "SONSTIGES"; dueAt?: Date };

type Effect = {
  stripeStatus: "applied" | "manual" | "none";
  couponId?: string | null;
  percentOff?: number | null;
  months?: number | null;
  commitUntil?: Date | null;
  mrrSaved: number | null;
  discount: boolean;
  tasks: Task[];
  message: string;
  details: Record<string, unknown>;
};

async function ownerEmails(customerId: string): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { customerId, role: "BUYER", teamRole: "owner" }, select: { email: true } });
  return users.map((u) => u.email);
}

/** Leads mit falschen Daten bzw. Reklamation aus den letzten `days` Tagen (für die Gutschrift-Prüfung durch uns). */
export async function wrongDataLeads(customerId: string, days: number, now = new Date()) {
  return prisma.lead.findMany({
    where: {
      customerId,
      createdAt: { gte: new Date(now.getTime() - days * DAY) },
      erasedAt: null,
      OR: [{ lostReason: { in: ["falsche_daten", "nicht_angefragt"] } }, { disqualifyReason: { in: ["falsche_nummer", "fake", "doppelt"] } }, { stornoState: { not: null } }],
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, name: true, source: true, status: true, createdAt: true, lostReason: true, lostNote: true, disqualifyReason: true, stornoState: true, stornoReason: true, callAttempts: true, reached: true },
  });
}

/**
 * Halteangebot annehmen (Kunde im Kündigungsfenster). Prüft, ob das Angebot für Grund und Kunde gerade gilt (Einstellungen,
 * Rabatt-Regeln), setzt es um und meldet es uns. Idempotent je Kündigungsabsicht und Angebot.
 */
export async function acceptHalteOffer(customerId: string, input: HalteInput, actor: AuditActor, now = new Date()): Promise<HalteResult> {
  const intent = await prisma.churnIntent.findFirst({ where: { id: input.intentId, customerId }, select: { id: true, reason: true, note: true } });
  if (!intent) return { ok: false, error: "Bitte noch einmal von vorn beginnen." };
  const done = await prisma.retentionOffer.findFirst({ where: { customerId, intentId: intent.id, kind: input.kind }, select: { id: true, details: true } });
  if (done) {
    const msg = (done.details as { message?: unknown } | null)?.message;
    return { ok: true, offerId: done.id, already: true, message: typeof msg === "string" ? msg : "Schon angenommen." };
  }
  const r = await customerFor(customerId);
  const x = await halteContext(customerId, now);
  if (!r || !x) return { ok: false, error: "Konto nicht gefunden." };
  if (r.c.cancelRequestedAt) return { ok: false, error: "Ihr Vertrag ist bereits gekündigt. Bitte sprechen Sie uns an." };
  const reason: ChurnReason | null = isChurnReason(intent.reason) ? intent.reason : null;
  if (!offersFor(reason, offersCtx(x)).includes(input.kind)) return { ok: false, error: "Dieses Angebot ist gerade nicht verfügbar." };
  const discount = isDiscountOffer(input.kind, x.s, x.discount.ok);
  if (discount && !x.discount.ok) return { ok: false, error: "Dieses Angebot ist gerade nicht verfügbar." };

  const { customerMrr } = await import("@/lib/ruhend");
  const mrrBefore = await customerMrr(customerId).catch(() => null);
  const name = r.c.name;
  const who = actor.email ?? "unbekannt";
  const why = `Grund: ${churnReasonLabel(reason)}${intent.note ? `, ${intent.note}` : ""}.`;
  const canStripe = !r.c.isTest && !!r.c.stripeCustomerId;
  const stripeSkip = r.c.isTest ? "Testkunde: keine Abrechnung." : !r.c.stripeCustomerId ? "Kein Stripe-Kunde hinterlegt." : "";
  let fx: Effect;

  switch (input.kind) {
    case "rabatt": {
      if (x.s.rabattCommitMonths > 0 && !input.confirmed) return { ok: false, error: `Bitte bestätigen Sie die Mindestlaufzeit bis zum ${fmtIso(x.commitIso)}.` };
      const { rabattPercent: p, rabattMonths: m } = x.s;
      let couponId: string | null = null;
      let manualWhy = stripeSkip;
      if (canStripe) {
        const res = await import("@/lib/billing")
          .then((b) => b.applyRetentionCoupon(r.c.stripeCustomerId!, { percentOff: p, months: m, idempotencyKey: `halten-rabatt-${intent.id}` }))
          .catch((err) => {
            reportError(err, "halten-rabatt-stripe", { customer: customerId });
            return { ok: false as const, note: err instanceof Error ? err.message.slice(0, 200) : String(err) };
          });
        if (res.ok) couponId = res.couponId;
        else manualWhy = res.note;
      }
      const commitUntil = x.s.rabattCommitMonths > 0 ? berlinEndOfDay(x.commitIso) : null;
      if (commitUntil && (!r.c.retentionCommitUntil || r.c.retentionCommitUntil < commitUntil)) {
        await prisma.customer.update({ where: { id: customerId }, data: { retentionCommitUntil: commitUntil } });
      }
      const status = couponId ? "applied" : r.c.isTest ? "none" : "manual";
      fx = {
        stripeStatus: status,
        couponId,
        percentOff: p,
        months: m,
        commitUntil,
        mrrSaved: mrrBefore,
        discount: true,
        tasks: [
          {
            title: `Halteangebot ${name}: ${p} % Nachlass für ${m} Monate${status === "manual" ? " (Stripe von Hand)" : ""}`,
            note: [
              `Angenommen am ${fmtIso(x.todayIso)} von ${who}. ${why}`,
              commitUntil ? `Bedingung: Vertrag läuft mindestens bis ${fmtIso(x.commitIso)} (im Konto und beim Kündigungstermin hinterlegt).` : null,
              couponId ? `Stripe: Gutschein ${couponId} am Abo (gilt für die nächsten ${m} Monatsrechnungen).` : status === "manual" ? `Stripe bitte von Hand: ${p} % auf die nächsten ${m} Monatsrechnungen (Gutschein „repeating“). Grund: ${manualWhy}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
        message: `Angenommen: ${p} % Nachlass auf die nächsten ${m === 1 ? "Monatsrechnung" : `${m} Monatsrechnungen`}.${commitUntil ? ` Ihr Vertrag läuft mindestens bis zum ${fmtIso(x.commitIso)}.` : ""} Die Bestätigung ist per E-Mail unterwegs.`,
        details: { manualWhy: couponId ? null : manualWhy || null },
      };
      // Bestätigung per E-Mail mit der Bindung
      const to = [...new Set([...(await ownerEmails(customerId)), ...(actor.email ? [actor.email] : [])])];
      if (to.length) {
        let url: string | null = null;
        try {
          url = `${getAppUrl()}/buyer/konto`;
        } catch {
          url = null;
        }
        const res = await sendCustomerMail({
          to,
          subject: `Bestätigung: ${p} % Nachlass auf Ihre Monatsgebühr`,
          greeting: await customerGreeting({ salesContactId: r.contactId, contactName: r.offer?.contactName ?? null }),
          paragraphs: [
            "schön, dass Sie bleiben. Hiermit bestätigen wir Ihnen das angenommene Angebot:",
            `Nachlass: ${p} % auf die monatliche Vergütung für die nächsten ${m === 1 ? "Monatsrechnung" : `${m} Monatsrechnungen`}. Danach gilt wieder der vereinbarte Preis.`,
            commitUntil
              ? `Bedingung: Ihr Vertrag läuft danach mindestens ${x.s.rabattCommitMonths} weitere Monate, also mindestens bis zum ${fmtIso(x.commitIso)}. Eine Kündigung ist jederzeit möglich, sie wirkt aber frühestens zu diesem Tag.`
              : "Ihr Vertrag läuft ansonsten unverändert weiter.",
            "Sie finden das Angebot jederzeit im Kundenbereich unter „Konto & Rechnungen“. Fragen? Antworten Sie einfach auf diese E-Mail.",
          ],
          ...(url ? { button: { label: "Zum Kundenbereich", url } } : {}),
        }).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
        if (!res.ok) reportError(new Error(res.error), "halten-rabatt-mail", { customer: customerId });
      }
      break;
    }
    case "neustart": {
      const free = discount ? x.s.neustartFreeMonths : 0;
      let couponId: string | null = null;
      let manualWhy = stripeSkip;
      if (free > 0 && canStripe) {
        const res = await import("@/lib/billing")
          .then((b) => b.applyRetentionCoupon(r.c.stripeCustomerId!, { percentOff: 100, months: free, serviceOnly: true, idempotencyKey: `halten-neustart-${intent.id}` }))
          .catch((err) => {
            reportError(err, "halten-neustart-stripe", { customer: customerId });
            return { ok: false as const, note: err instanceof Error ? err.message.slice(0, 200) : String(err) };
          });
        if (res.ok) couponId = res.couponId;
        else manualWhy = res.note;
      }
      const softwareFee = Number(r.offer?.softwareFee ?? (r.c.plan === "service" ? 0 : 349));
      const serviceFee = Math.max(0, Number(r.c.retainerMonthly ?? 0) - softwareFee);
      const status = free > 0 ? (couponId ? "applied" : r.c.isTest ? "none" : "manual") : "none";
      const tasks: Task[] = [
        {
          title: `Halteangebot ${name}: Kampagne neu starten`,
          note: [`Angenommen am ${fmtIso(x.todayIso)} von ${who}. ${why}`, "Zugesagt: Neustart durch uns mit neuen Werbemitteln und neuen Zielgruppen, Rückmeldung innerhalb von zwei Werktagen."].join("\n"),
          dueAt: (await import("@/lib/anti-churn-server")).addWorkdays(now, 2),
        },
      ];
      if (status === "manual") {
        tasks.push({
          title: `Halteangebot ${name}: ${free} Monat Betreuung kostenlos (Gutschrift von Hand)`,
          note: `Stripe konnte den Gutschein nicht automatisch setzen (${manualWhy}). Bitte ${free === 1 ? "einen Monat" : `${free} Monate`} Betreuung${serviceFee ? ` (${eur(serviceFee)} netto im Monat)` : ""} als Gutschrift auf die nächste Rechnung.`,
        });
      }
      fx = {
        stripeStatus: status,
        couponId,
        percentOff: free > 0 ? 100 : null,
        months: free > 0 ? free : null,
        mrrSaved: mrrBefore,
        discount: free > 0,
        tasks,
        message: `Danke! Wir bauen Ihre Kampagne neu auf und melden uns innerhalb von zwei Werktagen.${free > 0 ? ` Ihre Betreuung ist ${free === 1 ? "einen Monat" : `${free} Monate`} kostenlos, das sehen Sie auf der nächsten Rechnung.` : ""}`,
        details: { freeMonths: free, serviceFee, manualWhy: status === "manual" ? manualWhy : null },
      };
      break;
    }
    case "neuausrichtung": {
      const credit = discount;
      const wish = input.note?.trim().slice(0, 1000) || null;
      const tasks: Task[] = [
        {
          title: `Halteangebot ${name}: Kampagne neu ausrichten`,
          note: [`Angenommen am ${fmtIso(x.todayIso)} von ${who}. ${why}`, wish ? `Wunsch des Kunden: ${wish}` : null, "Zugesagt: kostenlose Neuausrichtung (andere Sparte, Region oder Formularfragen), Vorschlag innerhalb von zwei Werktagen."]
            .filter(Boolean)
            .join("\n"),
          dueAt: (await import("@/lib/anti-churn-server")).addWorkdays(now, 2),
        },
      ];
      let count = 0;
      if (credit) {
        const leads = await wrongDataLeads(customerId, x.s.gutschriftDays, now);
        count = leads.length;
        const { lostReasonLabel } = await import("@/lib/lead-lost");
        const { disqualifyLabel } = await import("@/lib/lead-quality");
        const line = (l: (typeof leads)[number]) =>
          [
            `${fmtIso(berlinIso(l.createdAt))}`,
            l.name ?? "ohne Name",
            l.source ? displayProduct(l.source) : "ohne Sparte",
            `Status ${l.status ?? "offen"}`,
            l.lostReason ? `Grund ${lostReasonLabel(l.lostReason) ?? l.lostReason}${l.lostNote ? ` (${l.lostNote.slice(0, 80)})` : ""}` : l.disqualifyReason ? `Grund ${disqualifyLabel(l.disqualifyReason) ?? l.disqualifyReason}` : null,
            l.stornoState ? `Reklamation ${l.stornoState}${l.stornoReason ? ` (${l.stornoReason.slice(0, 80)})` : ""}` : null,
            `${l.callAttempts} Anrufversuche${l.reached ? ", erreicht" : ""}`,
            `Lead ${l.id}`,
          ]
            .filter(Boolean)
            .join(" · ");
        tasks.push({
          title: `Halteangebot ${name}: Gutschrift prüfen (${count} ${count === 1 ? "Lead" : "Leads"} mit falschen Daten)`,
          note: [
            `Leads mit falschen Daten oder Reklamation aus den letzten ${x.s.gutschriftDays} Tagen. Bitte prüfen und bestätigte Fälle gutschreiben (keine automatische Geldbewegung).`,
            ...(count ? leads.map((l) => `- ${line(l)}`) : ["Keine passenden Leads gefunden: kurz mit dem Kunden klären."]),
          ].join("\n"),
        });
      }
      fx = {
        stripeStatus: credit ? "manual" : "none",
        mrrSaved: mrrBefore,
        discount: credit,
        tasks,
        message: `Danke! Wir melden uns innerhalb von zwei Werktagen mit einem Vorschlag zur Neuausrichtung.${credit ? " Die Leads mit falschen Daten prüfen wir und melden uns zur Gutschrift." : ""}`,
        details: { wish, creditLeads: count, creditDays: credit ? x.s.gutschriftDays : null },
      };
      break;
    }
    case "produktwechsel": {
      const { suggestion, rates, current } = await sparteSuggestion(customerId, x.s, now);
      const top = [...rates]
        .filter((t) => t.leads >= x.s.produktwechselMinLeads)
        .sort((a, b) => b.closes / b.leads - a.closes / a.leads)
        .slice(0, 5)
        .map((t) => `${t.label}: ${Math.round((t.closes / t.leads) * 1000) / 10} % (${t.closes} von ${t.leads})`);
      fx = {
        stripeStatus: "none",
        mrrSaved: mrrBefore,
        discount: false,
        tasks: [
          {
            title: `Halteangebot ${name}: Sparte wechseln${suggestion ? ` auf ${suggestion.label}` : ""}`,
            note: [
              `Angenommen am ${fmtIso(x.todayIso)} von ${who}. ${why}`,
              suggestion ? `Vorschlag: ${suggestion.label} (${Math.round(suggestion.rate * 1000) / 10} % Abschlussquote über alle Kunden, ${suggestion.leads} Leads).` : "Kein Vorschlag mit genug Daten: bitte passende Sparte mit dem Kunden abstimmen.",
              current.length ? `Bisher: ${current.map((k) => displayProduct(k)).join(", ")}.` : null,
              top.length ? `Beste Abschlussquoten (12 Monate, mind. ${x.s.produktwechselMinLeads} Leads): ${top.join("; ")}.` : null,
              "Zugesagt: Kampagne kostenlos umstellen, ohne neue Einrichtungsgebühr, Rückmeldung innerhalb von zwei Werktagen.",
            ]
              .filter(Boolean)
              .join("\n"),
            dueAt: (await import("@/lib/anti-churn-server")).addWorkdays(now, 2),
          },
        ],
        message: `Danke! Wir melden uns innerhalb von zwei Werktagen und stellen Ihre Kampagne${suggestion ? ` auf ${suggestion.label}` : ""} um, ohne neue Einrichtungsgebühr.`,
        details: { suggestion, current },
      };
      break;
    }
    case "pause_gratis": {
      const from = (input.from ?? "").trim() || x.todayIso;
      const until = (input.until ?? "").trim();
      const maxUntil = addMonthsIso(from, x.s.pauseMaxMonths);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return { ok: false, error: "Bitte ein Ende der Pause wählen." };
      if (until > maxUntil) return { ok: false, error: `Die Pause ohne Kosten dauert höchstens ${x.s.pauseMaxMonths} Monate (bis ${fmtIso(maxUntil)}).` };
      const { planPause } = await import("@/lib/pause");
      const res = await planPause(customerId, { from, until, reason: "Halteangebot: Pause ohne Kosten" }, "customer", { free: true });
      if (!res.ok) return { ok: false, error: res.error };
      fx = {
        stripeStatus: canStripe ? "applied" : r.c.isTest ? "none" : "manual",
        months: x.s.pauseMaxMonths,
        percentOff: 100,
        mrrSaved: mrrBefore,
        discount: true,
        tasks: [
          {
            title: `Halteangebot ${name}: Pause ohne Kosten ${fmtIso(from)} bis ${fmtIso(until)}`,
            note: [
              `Angenommen am ${fmtIso(x.todayIso)} von ${who}. ${why}`,
              "Anzeigen pausieren und Abrechnung ruhen automatisch zum Start (Stripe: pause_collection), Neustart am Endtag.",
              canStripe ? null : `Abrechnung bitte von Hand aussetzen: ${stripeSkip}`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
        message: `Eingetragen: Pause vom ${fmtIso(from)} bis ${fmtIso(until)}, ohne Kosten. Danach laufen Ihre Anzeigen automatisch wieder.`,
        details: { pauseId: res.pauseId ?? null, from, until },
      };
      break;
    }
    case "einrichtung": {
      const minutes = x.s.einrichtungMinutes;
      let booked: { start: Date } | null = null;
      if (input.start) {
        const { bookHelpCall } = await import("@/lib/help-call");
        const res = await bookHelpCall(customerId, input.start, `Statt Kündigung: App einrichten (${churnReasonLabel(reason)})`, {
          minutes,
          summary: `performancegrowth: App gemeinsam einrichten (${name})`,
          description: `${minutes} Minuten per Video mit Bildschirmfreigabe: Wir stellen die App gemeinsam so ein, wie Sie arbeiten.`,
        });
        if (!res.ok) return { ok: false, error: res.error };
        booked = { start: res.start };
      }
      const when = booked
        ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(booked.start)
        : null;
      fx = {
        stripeStatus: "none",
        mrrSaved: mrrBefore,
        discount: false,
        tasks: [
          {
            title: booked ? `Halteangebot ${name}: App einrichten am ${when} Uhr` : `Halteangebot ${name}: Termin zum Einrichten vereinbaren`,
            note: [`Angenommen am ${fmtIso(x.todayIso)} von ${who}. ${why}`, `Zugesagt: ${minutes} Minuten per Bildschirmfreigabe, App gemeinsam einrichten.`, booked ? null : "Kein freier Termin im Teamkalender: bitte innerhalb eines Werktags anrufen und Termin vereinbaren."]
              .filter(Boolean)
              .join("\n"),
            type: booked ? "SONSTIGES" : "ANRUF",
            dueAt: booked ? booked.start : (await import("@/lib/anti-churn-server")).addWorkdays(now, 1),
          },
        ],
        message: booked ? `Gebucht: ${when} Uhr, ${minutes} Minuten per Video. Die Einladung kommt per E-Mail.` : "Danke! Wir melden uns innerhalb eines Werktags für einen Termin.",
        details: { minutes, start: booked?.start.toISOString() ?? null },
      };
      break;
    }
    case "nur_bestand": {
      const price = x.s.nurBestandPrice;
      const { contractCancelInfo } = await import("@/lib/vertrag-kuendigung");
      const info = await contractCancelInfo(customerId, now).catch(() => null);
      const priceId = process.env.STRIPE_PRICE_NUR_BESTAND?.trim() || null;
      fx = {
        stripeStatus: r.c.isTest ? "none" : "manual",
        mrrSaved: price,
        discount: false,
        tasks: [
          {
            title: `Halteangebot ${name}: Paket „Nur Bestand“ (${eur(price)}): Stripe umstellen`,
            note: [
              `Angenommen am ${fmtIso(x.todayIso)} von ${who}. ${why}`,
              `Neues Paket: „Nur Bestand“ für ${eur(price)} netto im Monat: Daten und Bestandskunden-Modul (gleiches Kontingent wie das Modul); keine Leads, keine Betreuung. Empfehlungen & Bewertungen nur auf Wunsch zusätzlich (${eur(PRICE_LIST.empfehlungModuleMonthly)} netto im Monat), bitte beim Anruf fragen.`,
              info ? `Umstellen zum nächstmöglichen Termin: ${fmtIso(info.next.effectiveIso)} (wie eine Kündigung des bisherigen Pakets).` : null,
              `Zu tun: Termin bestätigen, Kampagnen zum Termin stoppen, Abo in Stripe auf ${eur(price)} umstellen${priceId ? ` (Preis ${priceId})` : ""} (Betreuung und Software raus, Bestandskunden-Modul bleibt bzw. wird freigeschaltet, Empfehlungen nur auf Wunsch), Monatspreis in der Abrechnung anpassen.`,
              `Bisher: ${mrrBefore != null ? `${eur(mrrBefore)} netto im Monat` : "unbekannt"}.`,
            ]
              .filter(Boolean)
              .join("\n"),
            type: "ANRUF",
          },
        ],
        message: "Danke! Wir stellen Ihren Vertrag zum nächstmöglichen Termin auf „Nur Bestand“ um und bestätigen Ihnen das per E-Mail.",
        details: { price, effective: info?.next.effectiveIso ?? null, priceId },
      };
      break;
    }
  }

  const row = await prisma.retentionOffer
    .create({
    data: {
      customerId,
      intentId: intent.id,
      userId: actor.id ?? null,
      reason,
      kind: input.kind,
      discount: fx.discount,
      stripeStatus: fx.stripeStatus,
      stripeCouponId: fx.couponId ?? null,
      percentOff: fx.percentOff ?? null,
      months: fx.months ?? null,
      commitUntil: fx.commitUntil ?? null,
      mrrBefore: mrrBefore == null ? null : new Prisma.Decimal(mrrBefore),
      mrrSaved: fx.mrrSaved == null ? null : new Prisma.Decimal(fx.mrrSaved),
      details: { ...fx.details, message: fx.message } as Prisma.InputJsonValue,
      createdAt: now,
    },
    select: { id: true },
    })
    .catch(async (err) => {
      // Doppelklick: dieselbe Absicht und dasselbe Angebot (eindeutig) ist schon gespeichert
      if ((err as { code?: string })?.code !== "P2002") throw err;
      return null;
    });
  if (!row) {
    const again = await prisma.retentionOffer.findFirst({ where: { customerId, intentId: intent.id, kind: input.kind }, select: { id: true } });
    return { ok: true, message: fx.message, offerId: again?.id ?? "", already: true };
  }
  await prisma.churnIntent.update({ where: { id: intent.id }, data: { offer: input.kind, outcome: "alternative", decidedAt: now } });
  await audit("contract.retention_offer", {
    entity: "Customer",
    entityId: customerId,
    customerId,
    details: { offer: input.kind, reason, offerId: row.id, discount: fx.discount, stripe: fx.stripeStatus, couponId: fx.couponId ?? null, percentOff: fx.percentOff ?? null, months: fx.months ?? null, commitUntil: fx.commitUntil?.toISOString() ?? null, mrrBefore, mrrSaved: fx.mrrSaved },
    actor,
  });
  if (!r.c.isTest) {
    for (const t of fx.tasks) {
      await prisma.salesTask
        .create({ data: { contactId: r.contactId, type: t.type ?? "SONSTIGES", title: t.title.slice(0, 300), note: t.note, dueAt: t.dueAt ?? now } })
        .catch((err) => reportError(err, "halten-task", { customer: customerId }));
    }
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({
      title: `Halteangebot angenommen: ${name}`,
      body: `${HALTE_LABEL[input.kind]} · ${churnReasonLabel(reason)}${fx.stripeStatus === "manual" ? " · bitte von Hand" : ""}`,
      url: `/admin/kunden/${customerId}/abrechnung`,
      tag: `halten:${customerId}`,
    }).catch(() => {});
  }
  return { ok: true, message: fx.message, offerId: row.id };
}

// ─── Nach der Kündigung, Konto, Statistik ────────────────────────────────

/** Kündigung trotz Angebot: offene Angebote des Kunden markieren (Statistik). */
export async function markOffersCancelled(customerId: string, now = new Date()): Promise<number> {
  const r = await prisma.retentionOffer.updateMany({ where: { customerId, cancelledLaterAt: null, createdAt: { lte: now } }, data: { cancelledLaterAt: now } });
  return r.count;
}

/** Für die Karte „Ihr Vertrag“: laufender Nachlass und Bindung. */
export async function loadHalteKonto(customerId: string, now = new Date()) {
  const [c, last] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { retentionCommitUntil: true } }),
    prisma.retentionOffer.findFirst({ where: { customerId, kind: "rabatt" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, percentOff: true, months: true, commitUntil: true } }),
  ]);
  const commit = c?.retentionCommitUntil && c.retentionCommitUntil > now ? c.retentionCommitUntil : null;
  if (!commit) return null;
  return {
    commitIso: berlinIso(new Date(commit.getTime() - 1)),
    percentOff: last?.percentOff ?? null,
    months: last?.months ?? null,
    acceptedIso: last ? berlinIso(last.createdAt) : null,
  };
}

