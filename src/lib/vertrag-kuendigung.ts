// „Vertrag hier kündigen“ im Kundenbereich (Konto & Rechnungen; Anwalts-Memo, Ole 15.11.2026).
// Freiwillig nach dem Vorbild von § 312k BGB, obwohl wir nur mit Unternehmern abschließen: Knopf ohne Umwege,
// Bestätigungsseite mit Termin, Knopf „Jetzt kündigen“, sofortige Bestätigung in Textform (E-Mail) mit
// Eingang und Vertragsende. Termin nach AGB „Laufzeit und Kündigung“ (lib/vertrag-laufzeit.cancelDate).
// Stripe: alle Abos des Kunden enden automatisch zum Ende des letzten Vertragstags (cancel_at, Ole 15.11.2026);
// klappt das nicht, bleibt die Kündigung bestehen und die Aufgabe sagt „Stripe bitte von Hand prüfen“.
// Ole bekommt Aufgabe und Push. Aufbewahrung nach Vertragsende (Ole, 15.11.2026): 24 Monate (Standard), 3 Monate oder
// sofort; danach endgültige Löschung, bis dahin ruht das Konto (lib/ruhend.ts). Lebenszyklus „cancelled“ für die Statistik.

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { customerGreeting } from "@/lib/offer-links";
import { berlinTodayIso, normalizeTerm, type OfferTerm } from "@/lib/offer-pricing";
import { berlinEndOfDay, cancelDate, cancelDateText, fmtIso, type CancelDate } from "@/lib/vertrag-laufzeit";
import { billingEnabled, endSubscriptionsAt } from "@/lib/billing";
import { normalizeRetention, retentionText, type RetentionChoice } from "@/lib/ruhend-shared";
import { customerMrr, recordLifecycle, retentionFields } from "@/lib/ruhend";

const TZ = "Europe/Berlin";
const berlinIso = (d: Date) => berlinTodayIso(d);
const fmtTime = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);

export type ContractCancelInfo = {
  startIso: string | null;
  term: OfferTerm;
  annual: boolean;
  /** Nächstmöglicher Termin, wenn heute gekündigt wird */
  next: CancelDate;
  nextText: string;
  /** Schon gekündigt */
  requested: { atIso: string; at: Date; effectiveIso: string; by: string | null } | null;
  /** Vertrag schon beendet (Ende in der Vergangenheit) */
  ended: boolean;
};

async function load(customerId: string) {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      isTest: true,
      stripeCustomerId: true,
      retainerStart: true,
      retainerEnd: true,
      billingInterval: true,
      cancelRequestedAt: true,
      cancelEffectiveAt: true,
      cancelRequestedBy: true,
      salesContact: { select: { id: true } },
      onboarding: { select: { offerId: true, salesContactId: true } },
      users: { where: { role: "BUYER", teamRole: "owner" }, select: { email: true } },
    },
  });
  if (!c) return null;
  const offer = c.onboarding?.offerId
    ? await prisma.offer.findUnique({ where: { id: c.onboarding.offerId }, select: { term: true, startDate: true, number: true, contactName: true, annualPrepay: true } })
    : null;
  return { c, offer };
}

export async function contractCancelInfo(customerId: string, now = new Date()): Promise<ContractCancelInfo | null> {
  const r = await load(customerId);
  if (!r) return null;
  const { c, offer } = r;
  const start = c.retainerStart ?? offer?.startDate ?? null;
  const startIso = start ? berlinIso(start) : null;
  const term = normalizeTerm(offer?.term);
  const annual = c.billingInterval === "year";
  const todayIso = berlinIso(now);
  const next = cancelDate({ startIso, term, annual, todayIso });
  return {
    startIso,
    term,
    annual,
    next,
    nextText: cancelDateText(next, startIso),
    requested:
      c.cancelRequestedAt && c.cancelEffectiveAt
        ? { atIso: berlinIso(c.cancelRequestedAt), at: c.cancelRequestedAt, effectiveIso: berlinIso(c.cancelEffectiveAt), by: c.cancelRequestedBy }
        : null,
    ended: !!c.retainerEnd && berlinIso(c.retainerEnd) < todayIso,
  };
}

export type CancelResult = { ok: true; effectiveIso: string; receivedAt: Date; already: boolean } | { ok: false; error: string };

/** Kündigung zum nächstmöglichen Termin. Idempotent: eine zweite Kündigung ändert nichts. */
export async function cancelContract(
  customerId: string,
  opts: { actor: AuditActor; reason?: string | null; now?: Date; retention?: RetentionChoice | null },
): Promise<CancelResult> {
  const now = opts.now ?? new Date();
  const info = await contractCancelInfo(customerId, now);
  if (!info) return { ok: false, error: "Konto nicht gefunden." };
  if (info.requested) return { ok: true, effectiveIso: info.requested.effectiveIso, receivedAt: info.requested.at, already: true };
  if (info.ended) return { ok: false, error: "Ihr Vertrag ist bereits beendet." };
  const reason = opts.reason?.trim().slice(0, 1000) || null;
  const effectiveIso = info.next.effectiveIso;
  const retention = normalizeRetention(opts.retention);
  const claimed = await prisma.customer.updateMany({
    where: { id: customerId, cancelRequestedAt: null },
    data: {
      cancelRequestedAt: now,
      cancelEffectiveAt: new Date(`${effectiveIso}T12:00:00Z`),
      cancelRequestedBy: opts.actor.email ?? null,
      cancelReason: reason,
      ...retentionFields(effectiveIso, retention),
    },
  });
  if (claimed.count === 0) {
    const again = await contractCancelInfo(customerId, now);
    return again?.requested ? { ok: true, effectiveIso: again.requested.effectiveIso, receivedAt: again.requested.at, already: true } : { ok: false, error: "Das hat gerade nicht geklappt. Bitte versuchen Sie es noch einmal." };
  }
  // Anti-Churn: offene Kündigungsabsichten als „gekündigt“ abschließen
  await import("@/lib/anti-churn-server").then((m) => m.closeChurnIntents(customerId, now)).catch(() => {});
  await audit("contract.cancel", {
    entity: "Customer",
    entityId: customerId,
    customerId,
    details: { effective: effectiveIso, reason: info.next.reason, term: info.term, annual: info.annual, start: info.startIso, note: reason, retention },
    actor: opts.actor,
  });
  await audit("customer.retention", { entity: "Customer", entityId: customerId, customerId, details: { from: null, to: retention, contractEnd: effectiveIso }, actor: opts.actor });
  // Lebenszyklus: Hauptgrund aus dem Anti-Churn-Schritt (letzte Absicht der letzten 30 Tage)
  const intent = await prisma.churnIntent.findFirst({ where: { customerId, outcome: "gekuendigt", decidedAt: now }, orderBy: { createdAt: "desc" }, select: { reason: true } }).catch(() => null);
  await recordLifecycle(customerId, "cancelled", { at: now, mrr: await customerMrr(customerId).catch(() => null), reason, churnReason: intent?.reason ?? null, details: { effective: effectiveIso, retention } });

  const r = await load(customerId);
  const name = r?.c.name ?? "Kunde";
  const contactId = r?.c.salesContact?.id ?? r?.c.onboarding?.salesContactId ?? null;
  const end = fmtIso(effectiveIso);

  // Stripe: Abo(s) enden zum Ende des letzten Vertragstags (keine sofortige Kündigung, keine Gutschrift)
  const stripe = await endStripe(customerId, r?.c ?? null, effectiveIso, opts.actor);
  // Ole: Aufgabe in „Heute“ und Push
  await prisma.salesTask
    .create({
      data: {
        contactId,
        type: "SONSTIGES",
        title: `Kündigung ${name} zum ${end}${stripe.manual ? " (Stripe bitte von Hand prüfen)" : ""}`,
        note: [
          `Im Kundenbereich gekündigt am ${fmtIso(berlinIso(now))} ${fmtTime(now)} von ${opts.actor.email ?? "unbekannt"}.`,
          reason ? `Grund: ${reason}` : null,
          `Termin laut AGB: ${end} (${info.next.reason}${info.startIso ? `, Start ${fmtIso(info.startIso)}` : ""}).`,
          stripe.note,
          `Zu tun: ${stripe.manual ? "Stripe bitte von Hand prüfen und das Abo zum Termin beenden, " : ""}Abrechnung → Betreuungsgebühr Ende setzen (vorbelegt). Danach ruht das Konto automatisch (Kampagnen werden pausiert), Löschung nach der gewählten Aufbewahrung (${retention === "24m" ? "24 Monate" : retention === "3m" ? "3 Monate" : "sofort nach Vertragsende"}).`,
        ]
          .filter(Boolean)
          .join("\n"),
        dueAt: now,
      },
    })
    .catch((err) => reportError(err, "contract-cancel-task", { customer: customerId }));
  const { sendToAdmins } = await import("@/lib/push");
  await sendToAdmins({ title: `Kündigung: ${name}`, body: `Zum ${end}${stripe.manual ? " · Stripe bitte von Hand prüfen" : ""}${reason ? ` · ${reason.slice(0, 80)}` : ""}`, url: `/admin/kunden/${customerId}/abrechnung`, tag: `kuendigung:${customerId}` }).catch(() => {});

  // Bestätigung in Textform an Inhaber und die kündigende Person
  const to = [...new Set([...(r?.c.users.map((u) => u.email) ?? []), ...(opts.actor.email ? [opts.actor.email] : [])])];
  if (to.length) {
    let url: string | null = null;
    try {
      url = `${getAppUrl()}/buyer/konto`;
    } catch {
      url = null;
    }
    const res = await sendCustomerMail({
      to,
      subject: `Bestätigung Ihrer Kündigung zum ${end}`,
      greeting: await customerGreeting({ salesContactId: contactId, contactName: r?.offer?.contactName ?? null }),
      paragraphs: [
        `wir bestätigen den Eingang Ihrer Kündigung am ${fmtIso(berlinIso(now))} um ${fmtTime(now)} Uhr.`,
        cancelDateText(info.next, info.startIso),
        "Bis dahin laufen Kampagnen, Leads und Software wie gewohnt weiter. Zusatzmodule enden mit dem Vertrag.",
        retention === "24m"
          ? `Ihre Daten bewahren wir 24 Monate auf, damit Sie jederzeit zurückkommen können. ${retentionText(effectiveIso, retention)} In dieser Zeit ruht Ihr Konto: Sie können sich anmelden, Ihre Daten herunterladen oder Ihr Konto reaktivieren.`
          : `Sie haben eine frühere Löschung gewählt. ${retentionText(effectiveIso, retention)}`,
        "Ihre Daten können Sie jederzeit im Konto unter „Ihre Daten herunterladen“ exportieren. Die Aufbewahrung können Sie dort bis zur Löschung ändern. Aufbewahren müssen wir nur, was das Gesetz verlangt, zum Beispiel Verträge und Rechnungen.",
        "Haben Sie es sich anders überlegt oder Fragen zum Vertrag? Antworten Sie einfach auf diese E-Mail.",
      ],
      ...(url ? { button: { label: "Zum Kundenbereich", url } } : {}),
    }).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
    if (!res.ok) reportError(new Error(res.error), "contract-cancel-mail", { customer: customerId });
  }
  return { ok: true, effectiveIso, receivedAt: now, already: false };
}

/** Stripe-Abos zum Vertragsende beenden; Ergebnis für Aufgabe, Push und Änderungsprotokoll. */
async function endStripe(
  customerId: string,
  c: { isTest: boolean; stripeCustomerId: string | null } | null,
  effectiveIso: string,
  actor: AuditActor,
): Promise<{ manual: boolean; note: string }> {
  const endAt = berlinEndOfDay(effectiveIso);
  let result: { manual: boolean; note: string; details: Record<string, unknown> };
  if (c?.isTest) {
    result = { manual: false, note: "Testkunde: kein Stripe-Abo.", details: { skipped: "test" } };
  } else if (!billingEnabled()) {
    result = { manual: true, note: "Stripe bitte von Hand prüfen: Online-Abrechnung ist nicht eingerichtet.", details: { skipped: "billing_disabled" } };
  } else if (!c?.stripeCustomerId) {
    result = { manual: true, note: "Stripe bitte von Hand prüfen: kein Stripe-Kunde hinterlegt (Abrechnung von Hand?).", details: { skipped: "no_stripe_customer" } };
  } else {
    const res = await endSubscriptionsAt(c.stripeCustomerId, endAt);
    result = res.ok
      ? {
          manual: false,
          note: `Stripe: Abo endet automatisch zum Ende des ${fmtIso(effectiveIso)} (cancel_at ${endAt.toISOString()}${res.changed.length ? `, geändert: ${res.changed.join(", ")}` : ", stand schon so"}).`,
          details: { ok: true, changed: res.changed, unchanged: res.unchanged },
        }
      : {
          manual: true,
          note: `Stripe bitte von Hand prüfen: ${res.error}${res.changed.length ? ` (schon geändert: ${res.changed.join(", ")})` : ""}`,
          details: { ok: false, error: res.error, changed: res.changed },
        };
    if (!res.ok) reportError(new Error(`Vertragsende in Stripe: ${res.error}`), "contract-cancel-stripe", { customer: customerId });
  }
  await audit("contract.cancel_stripe", {
    entity: "Customer",
    entityId: customerId,
    customerId,
    details: { endAt: endAt.toISOString(), effective: effectiveIso, manual: result.manual, ...result.details },
    actor,
  });
  return { manual: result.manual, note: result.note };
}
