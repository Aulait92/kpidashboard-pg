// Ruhendes Konto nach Vertragsende (Ole, 15.11.2026). Regeln und Texte: lib/ruhend-shared.ts.
//
// - Kündigung (lib/vertrag-kuendigung.ts) speichert die Aufbewahrung (Standard 24 Monate, sonst 3 Monate oder sofort)
//   und den Zeitpunkt der Löschung (Customer.deleteAfter).
// - Täglicher Cron (runRetentionCron): am Tag nach dem letzten Vertragstag ruht das Konto (dormantSince, archived,
//   Kampagnen bei Meta pausiert, Betreuungsgebühr endet), Erinnerungen 30 und 7 Tage vor der Löschung, danach die
//   endgültige Löschung (finalDeleteCustomer).
// - Ruhend heißt: kein Zugang außer Export und Reaktivierung (lib/buyer-context.getBuyerContext gibt null zurück,
//   /buyer/ruhend), keine Verarbeitung außer Speicherung (Crons, Assistent, Kampagnen und Abgleiche überspringen
//   ruhende Kunden über archived bzw. dormantSince).
// - Reaktivierung per Klick (Inhaber): Konto sofort wieder aktiv, alle Daten unverändert. Abrechnung und Kampagnen
//   startet Ole neu (Aufgabe + Push „Reaktivierung: …“), denn ein neuer Vertrag braucht Paket und Preis.
// - Lebenszyklus (CustomerLifecycleEvent: cancelled, dormant, reactivated, deleted) für Statistik und Kundenakte.
// - Rückkehrangebot (Halteangebote, Ole 15.11.2026): 30 Tage nach Vertragsende einmal je Kunde eine E-Mail „Konto
//   reaktivieren ohne neue Einrichtungsgebühr“ (Customer.winbackOfferAt); die Reaktivierungs-Aufgabe nennt es.
//
// Nach der endgültigen Löschung bleiben: die Kundenzeile mit Name und Abrechnungsfeldern, Angebote/Verträge,
// Umsatzzeilen (Revenue, ManualRevenue), Lebenszyklus-Ereignisse mit Beträgen, anonymisierte Lead-Zeilen (Produkt,
// Status, Datum, Umsatz) und die Sperrliste der Abmeldungen (nur Hashes). Rechnungen liegen bei Stripe.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { customerGreeting } from "@/lib/offer-links";
import { berlinTodayIso, annualMultiplier, PRICE_LIST } from "@/lib/offer-pricing";
import { fmtIso } from "@/lib/vertrag-laufzeit";
import { eraseCustomerData } from "@/lib/erasure";
import {
  contractEnded,
  deleteAfterFor,
  normalizeRetention,
  retentionLastDayIso,
  retentionReminderDue,
  type LifecycleKind,
  type RetentionChoice,
} from "@/lib/ruhend-shared";

const SYSTEM: AuditActor = { role: "system" };
const berlinIso = (d: Date) => berlinTodayIso(d);
const n = (v: unknown) => (v == null ? 0 : Number(v));
const r2 = (x: number) => Math.round(x * 100) / 100;

function appUrl(): string | null {
  try {
    return getAppUrl();
  } catch {
    return null;
  }
}

// ─── Wiederkehrender Monatsbetrag (für Lebenszyklus und Statistik) ──────

const MRR_SELECT = {
  retainerMonthly: true,
  seatsBilled: true,
  seatMonthly: true,
  bestandMonthly: true,
  empfehlungMonthly: true,
  billingInterval: true,
  onboarding: { select: { offerId: true } },
} satisfies Prisma.CustomerSelect;

/** Betreuung + Software + Zusätze netto je Monat (bei Jahreszahlung Jahresbetrag / 12), ohne Pay-per-Lead. */
export function mrrFromFields(
  c: { retainerMonthly: unknown; seatsBilled: number; seatMonthly: unknown; bestandMonthly: unknown; empfehlungMonthly: unknown; billingInterval: string },
  annualFreeMonths: number | null = null,
): number {
  const monthly = n(c.retainerMonthly) + c.seatsBilled * n(c.seatMonthly) + n(c.bestandMonthly) + n(c.empfehlungMonthly);
  const factor = c.billingInterval === "year" ? annualMultiplier(annualFreeMonths ?? PRICE_LIST.annualFreeMonths) / 12 : 1;
  return r2(monthly * factor);
}

export async function customerMrr(customerId: string): Promise<number> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: MRR_SELECT });
  if (!c) return 0;
  const offer = c.onboarding?.offerId ? await prisma.offer.findUnique({ where: { id: c.onboarding.offerId }, select: { annualFreeMonths: true } }) : null;
  return mrrFromFields(c, offer?.annualFreeMonths ?? null);
}

export async function recordLifecycle(
  customerId: string,
  kind: LifecycleKind,
  opts: { at: Date; mrr?: number | null; reason?: string | null; churnReason?: string | null; details?: Record<string, unknown> },
): Promise<void> {
  await prisma.customerLifecycleEvent
    .create({
      data: {
        customerId,
        kind,
        at: opts.at,
        mrr: opts.mrr == null ? null : new Prisma.Decimal(opts.mrr),
        reason: opts.reason ?? null,
        churnReason: opts.churnReason ?? null,
        details: (opts.details ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
    .catch((err) => reportError(err, "lifecycle-event", { customer: customerId, kind }));
}

// ─── Aufbewahrung wählen bzw. ändern ─────────────────────────────────────

/** Felder für die Kündigung: Wahl und Löschzeitpunkt aus dem letzten Vertragstag. */
export function retentionFields(contractEndIso: string, choice: RetentionChoice) {
  return {
    retentionChoice: choice,
    deleteAfter: deleteAfterFor(contractEndIso, choice),
    retentionReminder30At: null,
    retentionReminder7At: null,
  };
}

export type RetentionChangeResult =
  | { ok: true; choice: RetentionChoice; deleteAfter: Date; lastDayIso: string; deleteNow: boolean }
  | { ok: false; error: string };

/**
 * Aufbewahrung ändern (Konto bzw. Seite für ruhende Konten), jederzeit bis zur Löschung, auch zurück auf 24 Monate.
 * Ist das Konto ruhend und die neue Frist schon vorbei, löscht `confirmNow` sofort endgültig (sonst Rückfrage).
 */
export async function setRetentionChoice(
  customerId: string,
  choice: RetentionChoice,
  opts: { actor: AuditActor; now?: Date; confirmNow?: boolean },
): Promise<RetentionChangeResult> {
  const now = opts.now ?? new Date();
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { cancelEffectiveAt: true, dormantSince: true, dataDeletedAt: true, retentionChoice: true } });
  if (!c) return { ok: false, error: "Konto nicht gefunden." };
  if (c.dataDeletedAt) return { ok: false, error: "Ihre Daten sind bereits gelöscht." };
  if (!c.cancelEffectiveAt) return { ok: false, error: "Die Aufbewahrung wählen Sie bei der Kündigung." };
  const endIso = berlinIso(c.cancelEffectiveAt);
  const fields = retentionFields(endIso, choice);
  const deleteNow = !!c.dormantSince && fields.deleteAfter.getTime() <= now.getTime();
  if (deleteNow && !opts.confirmNow) {
    return { ok: false, error: "Mit dieser Wahl löschen wir Ihre Daten sofort endgültig. Bitte bestätigen Sie das unten." };
  }
  await prisma.customer.update({ where: { id: customerId }, data: fields });
  await audit("customer.retention", {
    entity: "Customer",
    entityId: customerId,
    customerId,
    details: { from: c.retentionChoice, to: choice, deleteAfter: fields.deleteAfter.toISOString(), contractEnd: endIso, deleteNow },
    actor: opts.actor,
  });
  if (deleteNow) await finalDeleteCustomer(customerId, { actor: opts.actor, reason: "Vom Kunden gewählt: sofort löschen", now });
  return { ok: true, choice, deleteAfter: fields.deleteAfter, lastDayIso: retentionLastDayIso(endIso, choice), deleteNow };
}

// ─── Täglicher Cron ──────────────────────────────────────────────────────

export type RetentionCronResult = { dormant: number; reminders: number; winback: number; deleted: number; errors: string[] };

/** `only`: nur diese Kunden (Tests auf einer geteilten Datenbank). */
export type RetentionScope = { only?: string[] };
const scoped = (s?: RetentionScope) => (s?.only ? { id: { in: s.only } } : {});

export async function runRetentionCron(now = new Date(), scope?: RetentionScope): Promise<RetentionCronResult> {
  const res: RetentionCronResult = { dormant: 0, reminders: 0, winback: 0, deleted: 0, errors: [] };
  res.dormant = await enterDormancy(now, res.errors, scope);
  res.reminders = await sendRetentionReminders(now, res.errors, scope);
  res.winback = await sendWinbackOffers(now, res.errors, scope);
  res.deleted = await runDueDeletions(now, res.errors, scope);
  return res;
}

/** Vertrag beendet → Konto ruht. Idempotent (nur Kunden ohne dormantSince). */
export async function enterDormancy(now = new Date(), errors: string[] = [], scope?: RetentionScope): Promise<number> {
  const candidates = await prisma.customer.findMany({
    where: { cancelEffectiveAt: { not: null }, dormantSince: null, dataDeletedAt: null, ...scoped(scope) },
    select: {
      id: true,
      name: true,
      isTest: true,
      cancelEffectiveAt: true,
      cancelRequestedAt: true,
      retentionChoice: true,
      deleteAfter: true,
      retainerEnd: true,
      metaAdAccountId: true,
      salesContact: { select: { id: true } },
      onboarding: { select: { salesContactId: true, offerId: true } },
    },
  });
  let count = 0;
  for (const c of candidates) {
    const endIso = berlinIso(c.cancelEffectiveAt!);
    if (!contractEnded(endIso, now)) continue;
    try {
      const choice = normalizeRetention(c.retentionChoice);
      const deleteAfter = c.deleteAfter ?? deleteAfterFor(endIso, choice);
      const mrr = await customerMrr(c.id);
      const claimed = await prisma.customer.updateMany({
        where: { id: c.id, dormantSince: null },
        data: { dormantSince: now, archived: true, retentionChoice: choice, deleteAfter, retainerEnd: c.retainerEnd ?? c.cancelEffectiveAt },
      });
      if (claimed.count === 0) continue;
      count++;
      // Anzeigen stoppen (Stripe endet schon zum Termin über cancel_at)
      let pausedCampaignIds: string[] = [];
      let adsNote: string;
      let manual = false;
      if (c.isTest) adsNote = "Testkunde: keine Kampagnen.";
      else if (!c.metaAdAccountId) {
        adsNote = "Kein Werbekonto hinterlegt: Kampagnen bitte von Hand prüfen und stoppen.";
        manual = true;
      } else {
        try {
          const { pauseActiveCampaigns } = await import("@/lib/meta-ads");
          pausedCampaignIds = await pauseActiveCampaigns(c.metaAdAccountId);
          adsNote = `${pausedCampaignIds.length} Kampagne(n) bei Meta pausiert.`;
        } catch (err) {
          reportError(err, "dormant-ads", { customer: c.id });
          adsNote = "Automatisches Pausieren fehlgeschlagen: Kampagnen im Werbekonto bitte von Hand stoppen.";
          manual = true;
        }
      }
      await recordLifecycle(c.id, "dormant", {
        at: now,
        mrr,
        details: { contractEnd: endIso, retention: choice, deleteAfter: deleteAfter.toISOString(), pausedCampaignIds, adsNote },
      });
      await audit("customer.dormant", {
        entity: "Customer",
        entityId: c.id,
        customerId: c.id,
        details: { contractEnd: endIso, retention: choice, deleteAfter: deleteAfter.toISOString(), pausedCampaignIds, manual },
        actor: SYSTEM,
      });
      const contactId = c.salesContact?.id ?? c.onboarding?.salesContactId ?? null;
      if (manual && !c.isTest) {
        await prisma.salesTask
          .create({ data: { contactId, type: "SONSTIGES", title: `Vertragsende ${c.name}: Kampagnen stoppen`, note: `Das Konto ruht seit heute (Vertragsende ${fmtIso(endIso)}). ${adsNote}`, dueAt: now } })
          .catch((err) => reportError(err, "dormant-task", { customer: c.id }));
      }
      if (!c.isTest) {
        const { sendToAdmins } = await import("@/lib/push");
        await sendToAdmins({
          title: `Konto ruht: ${c.name}`,
          body: `Vertragsende ${fmtIso(endIso)} · Löschung am ${fmtIso(berlinIso(deleteAfter))}${manual ? " · Kampagnen von Hand stoppen" : ""}`,
          url: `/admin/kunden/${c.id}/abrechnung`,
          tag: `ruhend:${c.id}`,
        }).catch(() => {});
      }
      // „sofort“: die Löschung folgt im selben Lauf, keine Mail über die Ruhephase
      if (deleteAfter.getTime() > now.getTime()) await mailDormant(c.id, contactId, endIso, deleteAfter);
    } catch (err) {
      reportError(err, "dormant-enter", { customer: c.id });
      errors.push(`ruhend ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return count;
}

async function ownerEmails(customerId: string): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { customerId, role: "BUYER", teamRole: "owner" }, select: { email: true } });
  return users.map((u) => u.email);
}

async function greetingFor(customerId: string, contactId: string | null): Promise<string> {
  const ob = await prisma.onboarding.findUnique({ where: { customerId }, select: { offerId: true } }).catch(() => null);
  const offer = ob?.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { contactName: true } }).catch(() => null) : null;
  return customerGreeting({ salesContactId: contactId, contactName: offer?.contactName ?? null });
}

/** Zwei Links in der Mail (HTML und Textfassung). */
function linkBlock(links: { label: string; url: string }[]): { html: string; textBlocks: string[] } {
  const a = (l: { label: string; url: string }) =>
    `<a href="${l.url}" style="display:inline-block;margin:0 8px 8px 0;background:#2563eb;color:#ffffff;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${l.label}</a>`;
  return { html: `<p style="margin:20px 0">${links.map(a).join("")}</p>`, textBlocks: links.map((l) => `${l.label}: ${l.url}`) };
}

async function mailDormant(customerId: string, contactId: string | null, endIso: string, deleteAfter: Date) {
  const to = await ownerEmails(customerId);
  if (!to.length) return;
  const base = appUrl();
  const res = await sendCustomerMail({
    to,
    subject: "Ihr Vertrag ist beendet, Ihr Konto ruht",
    greeting: await greetingFor(customerId, contactId),
    paragraphs: [
      `Ihr Vertrag mit uns endete am ${fmtIso(endIso)}. Ihre Kampagnen sind gestoppt und Ihr Konto ruht jetzt.`,
      `Ihre Daten bewahren wir bis zum ${fmtIso(berlinIso(new Date(deleteAfter.getTime() - 1)))} auf, damit Sie jederzeit zurückkommen können. In dieser Zeit speichern wir sie nur und verarbeiten sie nicht weiter. Danach löschen wir sie endgültig.`,
      "Nach der Anmeldung können Sie Ihre Daten herunterladen, Ihr Konto reaktivieren oder eine frühere Löschung wählen.",
      "Wir würden uns freuen, wieder von Ihnen zu hören. Antworten Sie einfach auf diese E-Mail.",
    ],
    ...(base ? linkBlock([{ label: "Daten exportieren", url: `${base}/buyer/konto/export` }, { label: "Konto reaktivieren", url: `${base}/buyer/ruhend#reaktivieren` }]) : {}),
  }).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
  if (!res.ok) reportError(new Error(res.error), "dormant-mail", { customer: customerId });
}

/** Erinnerungen 30 und 7 Tage vor der Löschung (je einmal, Zeitpunkt gespeichert). */
export async function sendRetentionReminders(now = new Date(), errors: string[] = [], scope?: RetentionScope): Promise<number> {
  const rows = await prisma.customer.findMany({
    where: { deleteAfter: { gt: now, lte: new Date(now.getTime() + 30 * 86_400_000) }, dataDeletedAt: null, isTest: false, ...scoped(scope) },
    select: {
      id: true,
      deleteAfter: true,
      dataDeletedAt: true,
      dormantSince: true,
      cancelEffectiveAt: true,
      retentionReminder30At: true,
      retentionReminder7At: true,
      salesContact: { select: { id: true } },
      onboarding: { select: { salesContactId: true } },
    },
  });
  let sent = 0;
  for (const c of rows) {
    const due = retentionReminderDue({ deleteAfter: c.deleteAfter, dataDeletedAt: c.dataDeletedAt, reminder30At: c.retentionReminder30At, reminder7At: c.retentionReminder7At }, now);
    if (!due) continue;
    // Sperre: nur wer den Zeitpunkt setzt, verschickt (zwei Läufe gleichzeitig schicken nicht doppelt)
    const claimed = await prisma.customer.updateMany({
      where: due === "7" ? { id: c.id, retentionReminder7At: null } : { id: c.id, retentionReminder30At: null, retentionReminder7At: null },
      data: due === "7" ? { retentionReminder7At: now, retentionReminder30At: c.retentionReminder30At ?? now } : { retentionReminder30At: now },
    });
    if (claimed.count === 0) continue;
    try {
      const ok = await mailReminder(c.id, c.salesContact?.id ?? c.onboarding?.salesContactId ?? null, c.deleteAfter!, !!c.dormantSince, due);
      if (ok) sent++;
      await audit("customer.retention_reminder", { entity: "Customer", entityId: c.id, customerId: c.id, details: { days: Number(due), deleteAfter: c.deleteAfter!.toISOString(), sent: ok }, actor: SYSTEM });
    } catch (err) {
      reportError(err, "retention-reminder", { customer: c.id });
      errors.push(`erinnerung ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return sent;
}

async function mailReminder(customerId: string, contactId: string | null, deleteAfter: Date, dormant: boolean, due: "30" | "7"): Promise<boolean> {
  const to = await ownerEmails(customerId);
  if (!to.length) return false;
  const base = appUrl();
  const day = fmtIso(berlinIso(deleteAfter));
  const links = base
    ? dormant
      ? [{ label: "Daten exportieren", url: `${base}/buyer/konto/export` }, { label: "Konto reaktivieren", url: `${base}/buyer/ruhend#reaktivieren` }]
      : [{ label: "Daten exportieren", url: `${base}/buyer/konto/export` }, { label: "Aufbewahrung ändern", url: `${base}/buyer/konto#aufbewahrung` }]
    : [];
  const res = await sendCustomerMail({
    to,
    subject: `In ${due} Tagen löschen wir Ihre Daten`,
    greeting: await greetingFor(customerId, contactId),
    paragraphs: [
      `am ${day} löschen wir Ihre Daten bei performancegrowth endgültig, so wie es nach Ihrer Kündigung vereinbart ist. Danach ist keine Wiederherstellung möglich.`,
      dormant
        ? "Möchten Sie Ihre Leads, Kunden und Termine behalten, laden Sie sie vorher herunter. Möchten Sie weitermachen, reaktivieren Sie Ihr Konto mit einem Klick: Alles ist noch so, wie Sie es verlassen haben."
        : "Möchten Sie Ihre Leads, Kunden und Termine behalten, laden Sie sie vorher herunter. Die Aufbewahrung können Sie im Konto jederzeit verlängern.",
      "Fragen? Antworten Sie einfach auf diese E-Mail.",
    ],
    ...(links.length ? linkBlock(links) : {}),
  }).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
  if (!res.ok) reportError(new Error(res.error), "retention-reminder-mail", { customer: customerId });
  return res.ok;
}

/**
 * Rückkehrangebot (Halteangebote, Ole 15.11.2026): `rueckkehrDays` (Standard 30) Tage nach Vertragsende eine E-Mail an
 * ruhende Konten: „Konto reaktivieren, ohne neue Einrichtungsgebühr“. Einmal je Kunde (winbackOfferAt bleibt auch nach
 * einer Reaktivierung gesetzt), nicht wenn die Löschung schon fällig ist. Abschaltbar unter Admin → Einstellungen →
 * Halteangebote.
 */
export async function sendWinbackOffers(now = new Date(), errors: string[] = [], scope?: RetentionScope): Promise<number> {
  const { loadHalteSettings } = await import("@/lib/halteangebote-server");
  const s = await loadHalteSettings();
  if (!s.rueckkehrOn) return 0;
  // Vertragsende (letzter Tag, 12:00 UTC gespeichert) mindestens `rueckkehrDays` Tage her
  const rows = await prisma.customer.findMany({
    where: {
      dormantSince: { not: null },
      dataDeletedAt: null,
      winbackOfferAt: null,
      isTest: false,
      cancelEffectiveAt: { lte: new Date(now.getTime() - s.rueckkehrDays * 86_400_000) },
      OR: [{ deleteAfter: null }, { deleteAfter: { gt: now } }],
      ...scoped(scope),
    },
    select: { id: true, cancelEffectiveAt: true, deleteAfter: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } },
  });
  let sent = 0;
  for (const c of rows) {
    const claimed = await prisma.customer.updateMany({ where: { id: c.id, winbackOfferAt: null }, data: { winbackOfferAt: now } });
    if (claimed.count === 0) continue;
    try {
      const to = await ownerEmails(c.id);
      let ok = false;
      if (to.length) {
        const base = appUrl();
        const endIso = berlinIso(c.cancelEffectiveAt!);
        const res = await sendCustomerMail({
          to,
          subject: "Ihr Rückkehrangebot: ohne neue Einrichtungsgebühr",
          greeting: await greetingFor(c.id, c.salesContact?.id ?? c.onboarding?.salesContactId ?? null),
          paragraphs: [
            `Ihr Vertrag mit uns endete am ${fmtIso(endIso)}. Ihre Leads, Kunden und Einstellungen sind noch so da, wie Sie sie verlassen haben.`,
            "Wenn Sie wieder neue Anfragen möchten: Reaktivieren Sie Ihr Konto mit einem Klick, ohne neue Einrichtungsgebühr. Wir melden uns danach, um Paket, Preis und den Start Ihrer Kampagnen mit Ihnen abzustimmen. Kosten entstehen erst, wenn Sie zugestimmt haben.",
            c.deleteAfter
              ? `Das Angebot gilt, solange wir Ihre Daten aufbewahren (bis ${fmtIso(berlinIso(new Date(c.deleteAfter.getTime() - 1)))}).`
              : "Das Angebot gilt, solange wir Ihre Daten aufbewahren.",
            "Fragen? Antworten Sie einfach auf diese E-Mail.",
          ],
          ...(base ? linkBlock([{ label: "Konto reaktivieren", url: `${base}/buyer/ruhend#reaktivieren` }]) : {}),
        }).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
        if (!res.ok) reportError(new Error(res.error), "winback-mail", { customer: c.id });
        ok = res.ok;
      }
      if (ok) sent++;
      await audit("customer.winback_offer", { entity: "Customer", entityId: c.id, customerId: c.id, details: { days: s.rueckkehrDays, sent: ok }, actor: SYSTEM });
    } catch (err) {
      reportError(err, "winback", { customer: c.id });
      errors.push(`rückkehr ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return sent;
}

/** Ende der Aufbewahrung erreicht → endgültig löschen (nur ruhende Konten, also nie vor Vertragsende). */
export async function runDueDeletions(now = new Date(), errors: string[] = [], scope?: RetentionScope): Promise<number> {
  const due = await prisma.customer.findMany({ where: { deleteAfter: { lte: now }, dormantSince: { not: null }, dataDeletedAt: null, ...scoped(scope) }, select: { id: true } });
  let count = 0;
  for (const c of due) {
    try {
      await finalDeleteCustomer(c.id, { actor: SYSTEM, reason: "Ende der Aufbewahrung nach Vertragsende", now });
      count++;
    } catch (err) {
      reportError(err, "final-erase", { customer: c.id });
      errors.push(`löschen ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return count;
}

// ─── Endgültige Löschung ─────────────────────────────────────────────────

export type FinalEraseResult = Awaited<ReturnType<typeof eraseCustomerData>> & { logins: number; settings: number };

/**
 * Endgültige Löschung (Ende der Aufbewahrung, Wunsch des Kunden oder Admin): Lead-Daten wie bei „Vertragsende: Daten
 * löschen“ (lib/erasure.eraseCustomerData) und zusätzlich Logins, WhatsApp-Zugang und Assistent, Vorlagen,
 * Leadformular-Zuordnungen, Kalender-Einstellungen, Monatsberichte, Kampagnenwünsche, Erstinformation, Rückmeldungen an
 * Meta und Freitexte der Kündigungsabsichten. Pay-per-Lead-Rohdaten der gelieferten Leads werden anonymisiert.
 * Bleiben: Kunde mit Name und Abrechnungsfeldern, Angebote, Umsätze, Lebenszyklus, anonyme Lead-Zeilen, Sperrliste.
 */
export async function finalDeleteCustomer(
  customerId: string,
  // ausLoeschprotokoll: erneute Anwendung nach einer Wiederherstellung (lib/loeschprotokoll.ts), ohne Mail und ohne neuen Eintrag
  opts: { actor?: AuditActor; reason?: string | null; now?: Date; ausLoeschprotokoll?: boolean } = {},
): Promise<FinalEraseResult> {
  const now = opts.now ?? new Date();
  const actor = opts.actor ?? SYSTEM;
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, isTest: true, dataDeletedAt: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } },
  });
  if (!c) throw new Error("Kunde nicht gefunden.");
  const contactId = c.salesContact?.id ?? c.onboarding?.salesContactId ?? null;
  // Vor dem Löschen: Empfänger der Bestätigung und Anrede
  const owners = c.dataDeletedAt || opts.ausLoeschprotokoll ? [] : await ownerEmails(customerId);
  const greeting = owners.length ? await greetingFor(customerId, contactId).catch(() => "Guten Tag,") : "";

  const erased = await eraseCustomerData(customerId, actor, { reason: opts.reason ?? null });
  const leadIds = (await prisma.lead.findMany({ where: { customerId }, select: { id: true } })).map((l) => l.id);
  const results = await prisma.$transaction([
    prisma.user.deleteMany({ where: { customerId, role: "BUYER" } }),
    prisma.agentConfig.deleteMany({ where: { customerId } }),
    prisma.whatsAppAccount.deleteMany({ where: { customerId } }),
    prisma.messageTemplate.deleteMany({ where: { customerId } }),
    prisma.mailTemplate.deleteMany({ where: { customerId } }),
    prisma.leadSource.deleteMany({ where: { customerId } }),
    prisma.calendarLeadTimes.deleteMany({ where: { customerId } }),
    prisma.calendarBlock.deleteMany({ where: { customerId } }),
    prisma.reviewSettings.deleteMany({ where: { customerId } }),
    prisma.monthlyReport.deleteMany({ where: { customerId } }),
    prisma.campaignWish.deleteMany({ where: { customerId } }),
    prisma.erstinformation.deleteMany({ where: { customerId } }),
    prisma.capiEvent.deleteMany({ where: { customerId } }),
    prisma.churnIntent.updateMany({ where: { customerId }, data: { note: null } }),
    prisma.poolLead.updateMany({ where: { leadId: { in: leadIds } }, data: { name: null, phone: null, email: null, answers: Prisma.DbNull } }),
    prisma.customer.update({ where: { id: customerId }, data: { dataDeletedAt: now, archived: true, bestandMailImprint: null, metaDatasetError: null } }),
  ]);
  const logins = (results[0] as { count: number }).count;
  const settings = results.slice(1, 13).reduce((s, r) => s + ((r as { count?: number }).count ?? 0), 0);
  const mrr = await customerMrr(customerId);
  await recordLifecycle(customerId, "deleted", { at: now, mrr, reason: opts.reason ?? null, details: { ...erased, logins, settings } });
  await audit("customer.final_erase", { entity: "Customer", entityId: customerId, customerId, details: { ...erased, logins, settings, reason: opts.reason ?? null }, actor });
  if (!opts.ausLoeschprotokoll) {
    const { protokolliereLoeschung } = await import("@/lib/loeschprotokoll");
    await protokolliereLoeschung([{ art: "kunde", entityId: customerId, customerId, grund: "vertragsende" }], now);
  }

  if (owners.length && !c.isTest) {
    const res = await sendCustomerMail({
      to: owners,
      subject: "Ihre Daten sind gelöscht",
      greeting,
      paragraphs: [
        `wir haben Ihre Daten bei performancegrowth am ${fmtIso(berlinIso(now))} endgültig gelöscht: Leads, Kunden, Chats, Termine, Einwilligungen und Ihre Zugänge.`,
        "Aufbewahren müssen wir nur, was das Gesetz verlangt, zum Beispiel Verträge und Rechnungen.",
        "Danke für die Zusammenarbeit. Wenn Sie später wieder Leads möchten, melden Sie sich gern.",
      ],
    }).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
    if (!res.ok) reportError(new Error(res.error), "final-erase-mail", { customer: customerId });
  }
  return { ...erased, logins, settings };
}

// ─── Reaktivierung ───────────────────────────────────────────────────────

export type ReactivateResult = { ok: true; already: boolean } | { ok: false; error: string };

/**
 * „Konto reaktivieren“ (Inhaber auf der Seite für ruhende Konten): Konto sofort wieder aktiv, alle Daten unverändert,
 * Kündigung und Löschtermin aufgehoben. Abrechnung und Kampagnen startet Ole neu (Aufgabe + Push), weil ein neuer Vertrag
 * Paket und Preis braucht; bis dahin entstehen keine Kosten. Lebenszyklus „reactivated“ mit dem bisherigen Monatsbetrag.
 */
export async function reactivateCustomer(customerId: string, opts: { actor: AuditActor; now?: Date }): Promise<ReactivateResult> {
  const now = opts.now ?? new Date();
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      isTest: true,
      dormantSince: true,
      dataDeletedAt: true,
      cancelRequestedAt: true,
      cancelEffectiveAt: true,
      cancelReason: true,
      retainerEnd: true,
      winbackOfferAt: true,
      salesContact: { select: { id: true } },
      onboarding: { select: { salesContactId: true } },
    },
  });
  if (!c) return { ok: false, error: "Konto nicht gefunden." };
  if (c.dataDeletedAt) return { ok: false, error: "Ihre Daten sind bereits gelöscht. Bitte sprechen Sie uns für einen Neustart an." };
  // Rückkehrangebot verschickt (vor dieser Reaktivierung): ohne neue Einrichtungsgebühr
  const winback = !!c.winbackOfferAt && !!c.dormantSince && c.winbackOfferAt >= c.dormantSince;
  if (!c.dormantSince) return { ok: true, already: true };
  const claimed = await prisma.customer.updateMany({
    where: { id: customerId, dormantSince: { not: null }, dataDeletedAt: null },
    data: {
      dormantSince: null,
      archived: false,
      cancelRequestedAt: null,
      cancelEffectiveAt: null,
      cancelRequestedBy: null,
      cancelReason: null,
      retentionChoice: null,
      deleteAfter: null,
      retentionReminder30At: null,
      retentionReminder7At: null,
    },
  });
  if (claimed.count === 0) return { ok: true, already: true };
  const mrr = await customerMrr(customerId);
  const lastCancel = await prisma.customerLifecycleEvent.findFirst({ where: { customerId, kind: "cancelled" }, orderBy: { at: "desc" }, select: { at: true, churnReason: true, reason: true } });
  const dormantDays = Math.max(0, Math.round((now.getTime() - c.dormantSince.getTime()) / 86_400_000));
  const pkg = await packageText(customerId);
  await recordLifecycle(customerId, "reactivated", {
    at: now,
    mrr,
    reason: lastCancel?.reason ?? c.cancelReason ?? null,
    churnReason: lastCancel?.churnReason ?? null,
    details: {
      dormantSince: c.dormantSince.toISOString(),
      dormantDays,
      cancelledAt: (lastCancel?.at ?? c.cancelRequestedAt)?.toISOString() ?? null,
      contractEnd: c.cancelEffectiveAt ? berlinIso(c.cancelEffectiveAt) : null,
      package: pkg,
      winback,
    },
  });
  await audit("customer.reactivate", { entity: "Customer", entityId: customerId, customerId, details: { dormantDays, mrr, package: pkg }, actor: opts.actor });

  const contactId = c.salesContact?.id ?? c.onboarding?.salesContactId ?? null;
  const eur = (x: number) => x.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  if (!c.isTest) {
    await prisma.salesTask
      .create({
        data: {
          contactId,
          type: "ANRUF",
          title: `Reaktivierung: ${c.name}: Abrechnung und Kampagnen neu starten`,
          note: [
            `Konto im Kundenbereich reaktiviert am ${fmtIso(berlinIso(now))} von ${opts.actor.email ?? "unbekannt"} (ruhte ${dormantDays} Tage).`,
            `Bisher: ${pkg}${mrr ? `, ${eur(mrr)} netto im Monat` : ""}.`,
            lastCancel?.churnReason || c.cancelReason ? `Kündigungsgrund damals: ${[lastCancel?.churnReason, c.cancelReason].filter(Boolean).join(", ")}.` : null,
            winback ? `Rückkehrangebot vom ${fmtIso(berlinIso(c.winbackOfferAt!))}: keine neue Einrichtungsgebühr berechnen.` : null,
            "Zu tun: anrufen, Paket und Preis abstimmen (neues Angebot oder Stripe-Abo), dann Abrechnung → Betreuungsgebühr (Ende entfernen bzw. neu setzen) und Kampagnen wieder starten. Das Konto ist schon aktiv, alle Daten sind da.",
          ]
            .filter(Boolean)
            .join("\n"),
          dueAt: now,
        },
      })
      .catch((err) => reportError(err, "reactivate-task", { customer: customerId }));
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({ title: `Reaktivierung: ${c.name}`, body: `${pkg}${mrr ? ` · ${eur(mrr)}/Monat` : ""} · ruhte ${dormantDays} Tage`, url: `/admin/kunden/${customerId}/abrechnung`, tag: `reaktivierung:${customerId}` }).catch(() => {});
  }
  const to = await ownerEmails(customerId);
  if (to.length) {
    const base = appUrl();
    const res = await sendCustomerMail({
      to,
      subject: "Willkommen zurück: Ihr Konto ist wieder aktiv",
      greeting: await greetingFor(customerId, contactId),
      paragraphs: [
        "schön, dass Sie wieder da sind. Ihr Konto ist ab sofort wieder aktiv, alle Leads, Kunden und Einstellungen sind unverändert da.",
        "Wir melden uns in Kürze, um Paket, Preis und den Start Ihrer Kampagnen mit Ihnen abzustimmen. Kosten entstehen erst, wenn Sie dem zugestimmt haben.",
      ],
      ...(base ? { button: { label: "Zum Kundenbereich", url: `${base}/buyer` } } : {}),
    }).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
    if (!res.ok) reportError(new Error(res.error), "reactivate-mail", { customer: customerId });
  }
  return { ok: true, already: false };
}

/** „Betreuung + Software, 2 Produkte“ für Aufgabe, Push und Buchungen. */
async function packageText(customerId: string): Promise<string> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { plan: true, existingCustomersEnabled: true, empfehlungEnabled: true, customerProducts: { select: { product: { select: { name: true } } } } },
  });
  if (!c) return "unbekannt";
  const base = c.plan === "service" ? "Nur Betreuung" : c.plan === "software" ? "Betreuung + Software" : c.plan;
  const products = c.customerProducts.map((p) => p.product.name).filter(Boolean);
  return [base, products.length ? products.join(", ") : null, c.existingCustomersEnabled ? "Bestandskunden-Modul" : null, c.empfehlungEnabled ? "Empfehlungen & Bewertungen" : null].filter(Boolean).join(", ");
}

// ─── Lesen (Kundenbereich, Kundenakte) ───────────────────────────────────

export async function loadRetentionView(customerId: string) {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, cancelRequestedAt: true, cancelEffectiveAt: true, dormantSince: true, dataDeletedAt: true, retentionChoice: true, deleteAfter: true },
  });
  if (!c) return null;
  const endIso = c.cancelEffectiveAt ? berlinIso(c.cancelEffectiveAt) : null;
  const choice = c.retentionChoice ? normalizeRetention(c.retentionChoice) : null;
  return {
    name: c.name,
    endIso,
    choice,
    dormantSince: c.dormantSince,
    dataDeletedAt: c.dataDeletedAt,
    deleteAfterIso: c.deleteAfter ? berlinIso(c.deleteAfter) : null,
    lastDayIso: endIso && choice ? retentionLastDayIso(endIso, choice) : null,
  };
}

export async function loadLifecycle(customerId: string) {
  return prisma.customerLifecycleEvent.findMany({ where: { customerId }, orderBy: { at: "asc" }, select: { id: true, kind: true, at: true, mrr: true, reason: true, churnReason: true, details: true } });
}
