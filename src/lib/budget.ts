// Budget ändern (Kundenbereich → Konto → Werbebudget): Stand je Produkt, Änderung
// speichern, Preisstufe im Abo anpassen, Admin informieren, Kunde per Mail bestätigen.
//
// Freigabe (Ole, 11.11.2026): Erhöhung und Senkung gelten immer sofort (bzw. ab dem
// gewählten Datum), Ole wird per Push + Aufgabe in „Heute“ informiert. Ausnahmen:
// - über PRICE_LIST.individualFrom: keine Selbstbedienung, Anfrage an uns;
// - individuelle Konditionen (abweichender Preis, Jahreszahler): Budget sofort,
//   Abo-Preis NICHT automatisch, sondern Aufgabe „Preis prüfen“.
// Meta: Die App stellt das Tagesbudget der Kampagne automatisch um, wenn genau eine
// passende Kampagne gefunden wird (lib/kampagnen/budget-sync.ts); sonst Aufgabe
// „Meta-Budget auf X €/Tag stellen“ mit Grund.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { changeMonthlyFee } from "@/lib/billing";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { reportError } from "@/lib/monitoring";
import { offerProducts } from "@/components/offer-document";
import { customerGreeting, logOfferActivity } from "@/lib/offer-links";
import { adSpendForRange } from "@/lib/customer-spend";
import { DEFAULT_PRODUCTS } from "@/lib/rechner";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { berlinMidnight, berlinYmd } from "@/lib/absence";
import { defaultBudgetSyncDeps, syncBudgetChangeToMeta } from "@/lib/kampagnen/budget-sync";
import {
  BUDGET_MAX_DAILY,
  BUDGET_MIN_DAILY,
  decideApproval,
  needsAcknowledge,
  previewChange,
  type BudgetContext,
  type BudgetLine,
  type BudgetPreview,
} from "@/lib/budget-shared";

const DAY_MS = 24 * 60 * 60 * 1000;
const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const eurDay = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })} €/Tag`;
const fmtDate = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });

export type UpcomingBudget = { product: string; dailyBudget: number; validFrom: Date };

/** Aktuelle Tagesbudgets je Produkt: angenommenes Angebot, überschrieben durch spätere Änderungen. */
export async function currentBudgets(customerId: string, now = new Date()): Promise<{ lines: BudgetLine[]; upcoming: UpcomingBudget[]; estimated?: boolean }> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { onboarding: { select: { offerId: true } } } });
  const offer = c?.onboarding?.offerId ? await prisma.offer.findUnique({ where: { id: c.onboarding.offerId }, select: { products: true } }) : null;
  const map = new Map<string, number>();
  for (const p of offerProducts(offer?.products)) map.set(p.name, Number(p.dailyBudget) || 0);
  const rows = await prisma.customerBudget.findMany({ where: { customerId }, orderBy: [{ validFrom: "asc" }, { createdAt: "asc" }] });
  const upcoming: UpcomingBudget[] = [];
  for (const r of rows) {
    if (r.validFrom <= now) map.set(r.product, Number(r.dailyBudget));
    else upcoming.push({ product: r.product, dailyBudget: Number(r.dailyBudget), validFrom: r.validFrom });
    if (!map.has(r.product)) map.set(r.product, 0);
  }
  if (!map.size) {
    // Ältere Kunden ohne Angebot in der App: Budget aus den Werbeausgaben und Lead-Produkten ansetzen,
    // damit sie es trotzdem selbst ändern können (Ole, 13.11.2026). Gespeichert wird erst bei einer Änderung.
    const est = await estimatedBudgets(customerId, now);
    if (est.length) return { lines: est, upcoming, estimated: true };
  }
  return { lines: [...map].map(([product, dailyBudget]) => ({ product, dailyBudget })), upcoming };
}

/**
 * Geschätzte Tagesbudgets ohne Angebot/Änderung: Ø Meta-Ausgaben der letzten 14 Tage (Tage mit Ausgaben),
 * gleichmäßig auf die Produkte der Leads der letzten 90 Tage verteilt (höchstens 3). Ohne Leads: eine Zeile
 * „Werbebudget“. Ohne Ausgaben und ohne Leads: keine Schätzung.
 */
export async function estimatedBudgets(customerId: string, now = new Date()): Promise<BudgetLine[]> {
  const [spend, sources] = await Promise.all([
    prisma.customerAdSpend.findMany({
      where: { customerId, date: { gte: new Date(now.getTime() - 14 * DAY_MS), lte: now }, amount: { gt: 0 } },
      select: { date: true, amount: true },
    }),
    prisma.lead.groupBy({
      by: ["source"],
      where: { customerId, source: { not: null }, createdAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } },
      _count: true,
      orderBy: { _count: { source: "desc" } },
      take: 3,
    }),
  ]);
  const products = sources.map((s) => s.source!).filter((s) => s.trim());
  if (!spend.length && !products.length) return [];
  const days = new Set(spend.map((s) => s.date.toISOString().slice(0, 10))).size;
  const daily = days ? spend.reduce((a, s) => a + Number(s.amount), 0) / days : 0;
  const names = products.length ? products : ["Werbebudget"];
  const each = daily > 0 ? daily / names.length : 30;
  const per = Math.min(BUDGET_MAX_DAILY, Math.max(BUDGET_MIN_DAILY, Math.round(each)));
  return names.map((product) => ({ product, dailyBudget: per }));
}

/** Leadpreis: echter Wert der letzten 30 Tage (ab 10 Leads), sonst Standard aus dem Rechner. */
export async function customerCpl(customerId: string, productNames: string[], vermittlerTyp: string, now = new Date()): Promise<{ cpl: number; source: "kunde" | "standard" }> {
  const from = new Date(now.getTime() - 30 * DAY_MS);
  const [spend, leads] = await Promise.all([
    adSpendForRange(customerId, from, now).catch(() => 0),
    prisma.lead.count({ where: { customerId, createdAt: { gte: from, lte: now } } }),
  ]);
  if (spend > 0 && leads >= 10) return { cpl: Math.round((spend / leads) * 100) / 100, source: "kunde" };
  const names = productNames.map((n) => n.toLowerCase());
  const p = DEFAULT_PRODUCTS.find((d) => names.some((n) => n.includes(d.match) || n.includes(d.key))) ?? DEFAULT_PRODUCTS.find((d) => d.active) ?? DEFAULT_PRODUCTS[0];
  const cpl = vermittlerTyp === "makler" && p.cplMakler != null ? p.cplMakler : p.cpl;
  return { cpl, source: "standard" };
}

/** Alles, was Karte und Speichern brauchen. */
export async function budgetState(customerId: string, now = new Date()) {
  const c = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { plan: true, retainerMonthly: true, billingInterval: true, vermittlerTyp: true },
  });
  const { lines, upcoming, estimated } = await currentBudgets(customerId, now);
  const { cpl, source } = await customerCpl(customerId, lines.map((l) => l.product), c.vermittlerTyp, now);
  const ctx: BudgetContext = {
    plan: c.plan,
    feeMonthly: c.retainerMonthly == null ? null : Number(c.retainerMonthly),
    billingInterval: c.billingInterval,
    cpl,
    cplSource: source,
  };
  const pending = await prisma.budgetChange.findFirst({ where: { customerId, status: "pending" }, orderBy: { createdAt: "desc" } });
  return { lines, upcoming, ctx, pending, estimated: !!estimated };
}

export type BudgetChangeInput = {
  customerId: string;
  userId: string | null;
  next: BudgetLine[];
  /** YYYY-MM-DD (Berlin) oder null = sofort. */
  effectiveDate: string | null;
  acknowledged: boolean;
  actor?: AuditActor;
};

export type BudgetChangeResult =
  | { ok: true; status: "applied" | "pending"; changeId: string; preview: BudgetPreview; price: "none" | "auto" | "manual" }
  | { ok: false; error: string };

function validate(current: BudgetLine[], next: BudgetLine[]): string | null {
  if (!current.length) return "Für Ihr Konto ist noch kein Werbebudget hinterlegt. Bitte melden Sie sich kurz bei uns.";
  const known = new Set(current.map((l) => l.product));
  if (next.length !== current.length || next.some((l) => !known.has(l.product))) return "Die Produkte passen nicht zu Ihrem Vertrag. Bitte laden Sie die Seite neu.";
  for (const l of next) {
    if (!Number.isFinite(l.dailyBudget) || l.dailyBudget < BUDGET_MIN_DAILY || l.dailyBudget > BUDGET_MAX_DAILY) {
      return `Bitte ein Tagesbudget zwischen ${BUDGET_MIN_DAILY} und ${BUDGET_MAX_DAILY} € wählen.`;
    }
  }
  return null;
}

export function effectiveFromOf(ymd: string | null, now: Date): Date | { error: string } {
  if (!ymd) return now;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return { error: "Bitte ein gültiges Datum wählen." };
  const today = berlinYmd(now);
  if (ymd < today) return { error: "Das Datum liegt in der Vergangenheit." };
  if (ymd === today) return now;
  const d = berlinMidnight(ymd);
  if (d.getTime() - now.getTime() > 120 * DAY_MS) return { error: "Bitte ein Datum innerhalb der nächsten 4 Monate wählen." };
  return d;
}

export async function customerInfo(customerId: string) {
  const c = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: {
      name: true,
      salesContact: { select: { id: true } },
      onboarding: { select: { offerId: true, salesContactId: true } },
      users: { where: { role: "BUYER", teamRole: "owner" }, select: { email: true } },
    },
  });
  const offer = c.onboarding?.offerId ? await prisma.offer.findUnique({ where: { id: c.onboarding.offerId }, select: { contactName: true } }) : null;
  const contactId = c.salesContact?.id ?? c.onboarding?.salesContactId ?? null;
  return { name: c.name, contactId, contactName: offer?.contactName ?? null, to: c.users.map((u) => u.email) };
}

type Change = { product: string; from: number; to: number };
const changesOf = (current: BudgetLine[], next: BudgetLine[]): Change[] => {
  const before = new Map(current.map((l) => [l.product, l.dailyBudget]));
  return next.filter((l) => Math.abs((before.get(l.product) ?? 0) - l.dailyBudget) > 0.001).map((l) => ({ product: l.product, from: before.get(l.product) ?? 0, to: l.dailyBudget }));
};
const changeList = (changes: Change[]) => changes.map((c) => `${c.product}: ${eurDay(c.from)} → ${eurDay(c.to)}`);

export async function adminTask(contactId: string | null, title: string, note: string | null, dueAt: Date) {
  await prisma.salesTask.create({ data: { contactId, type: "SONSTIGES", title, note, dueAt } }).catch((err) => reportError(err, "budget-task"));
}

export async function notifyAdmins(title: string, body: string, contactId: string | null, customerId: string) {
  const { sendToAdmins } = await import("@/lib/push");
  await sendToAdmins({ title, body, url: contactId ? `/admin/vertrieb/kontakte/${contactId}` : `/admin/kunden/${customerId}/abrechnung` }).catch(() => {});
}

/** Budget ändern (Kunde). Speichert sofort bzw. zum Datum; über individualFrom nur als Anfrage. */
export async function changeBudget(input: BudgetChangeInput, now = new Date()): Promise<BudgetChangeResult> {
  const { lines: current, ctx, pending, estimated } = await budgetState(input.customerId, now);
  const invalid = validate(current, input.next);
  if (invalid) return { ok: false, error: invalid };
  const eff = effectiveFromOf(input.effectiveDate, now);
  if ("error" in eff) return { ok: false, error: eff.error };
  const preview = previewChange(current, input.next, ctx);
  if (!preview.changed) return { ok: false, error: "Das Budget ist unverändert." };
  if (needsAcknowledge(preview) && !input.acknowledged) return { ok: false, error: "Bitte bestätigen Sie, dass Sie den neuen Monatspreis zur Kenntnis genommen haben." };
  const approval = decideApproval(preview, ctx);
  if (approval.kind === "request" && pending) return { ok: false, error: "Ihre Anfrage liegt uns schon vor. Wir melden uns bei Ihnen." };

  const info = await customerInfo(input.customerId);
  const changes = changesOf(current, input.next);
  const immediate = eff.getTime() <= now.getTime();
  const when = immediate ? "ab sofort" : `ab ${fmtDate(eff)}`;
  const base = {
    customerId: input.customerId,
    userId: input.userId,
    changes: changes as unknown as Prisma.InputJsonValue,
    effectiveFrom: eff,
    monthlyBudgetFrom: preview.monthlyFrom,
    monthlyBudgetTo: preview.monthlyTo,
    feeFrom: preview.feeFrom,
    feeTo: preview.feeTo,
    tierChange: preview.tierChange,
    acknowledged: input.acknowledged,
  };

  if (approval.kind === "request") {
    const row = await prisma.budgetChange.create({ data: { ...base, status: "pending", reason: approval.reason, feeTo: null } });
    await audit("budget.request", { entity: "BudgetChange", entityId: row.id, customerId: input.customerId, details: { changes, monthlyTo: preview.monthlyTo }, ...(input.actor ? { actor: input.actor } : {}) });
    await adminTask(info.contactId, `Budget-Anfrage ${info.name}: ${eur(preview.monthlyTo)}/Monat, individuelles Angebot`, [...changeList(changes), `Gewünscht ${when}.`, "Übernehmen oder ablehnen in der Kundenakte → Abrechnung."].join("\n"), now);
    await notifyAdmins(`Budget-Anfrage: ${info.name}`, `${eur(preview.monthlyTo)} Werbebudget/Monat (über ${eur(preview.monthlyFrom)}), bitte individuelles Angebot.`, info.contactId, input.customerId);
    if (info.contactId) await logOfferActivity({ dealId: null, salesContactId: info.contactId }, "Budget-Anfrage (individuelles Angebot)", changeList(changes).join(" · ")).catch(() => {});
    await mailCustomer(info, {
      subject: "Ihre Budget-Anfrage ist bei uns",
      paragraphs: [
        "vielen Dank für Ihre Anfrage. Folgendes Werbebudget wünschen Sie sich:",
        `Ab ${eur(PRICE_LIST.individualFrom)} Werbebudget pro Monat erstellen wir Ihnen ein individuelles Angebot. Wir melden uns kurzfristig bei Ihnen. Bis dahin läuft Ihr bisheriges Budget weiter.`,
      ],
      list: [...changeList(changes), `Werbebudget pro Monat: ${eur(preview.monthlyTo)}`],
    });
    return { ok: true, status: "pending", changeId: row.id, preview, price: "none" };
  }

  const price = approval.price;
  const stripeStatus = price === "auto" ? "scheduled" : price === "manual" ? "manual" : "none";
  const row = await prisma.$transaction(async (tx) => {
    const r = await tx.budgetChange.create({ data: { ...base, status: "applied", reason: approval.price === "manual" ? approval.reason : null, stripeStatus, metaStatus: "scheduled", decidedAt: now, decidedBy: "auto" } });
    // Spätere geplante Werte desselben Produkts ersetzt die neue Änderung
    await tx.customerBudget.deleteMany({ where: { customerId: input.customerId, product: { in: changes.map((c) => c.product) }, validFrom: { gt: now } } });
    await tx.customerBudget.createMany({ data: changes.map((c) => ({ customerId: input.customerId, product: c.product, dailyBudget: c.to, validFrom: eff, changeId: r.id })) });
    // Geschätztes Budget (Kunde ohne Angebot): unveränderte Zeilen ab jetzt festschreiben, sonst gingen sie verloren
    if (estimated) {
      const rest = current.filter((l) => !changes.some((c) => c.product === l.product));
      if (rest.length) await tx.customerBudget.createMany({ data: rest.map((l) => ({ customerId: input.customerId, product: l.product, dailyBudget: l.dailyBudget, validFrom: now, changeId: r.id })) });
      // Bei späterem Wirksamwerden gilt bis dahin der bisherige (geschätzte) Wert
      if (eff > now) await tx.customerBudget.createMany({ data: changes.map((c) => ({ customerId: input.customerId, product: c.product, dailyBudget: c.from, validFrom: now, changeId: r.id })) });
    }
    return r;
  });
  await audit("budget.change", {
    entity: "BudgetChange",
    entityId: row.id,
    customerId: input.customerId,
    details: { changes, effectiveFrom: eff.toISOString(), monthly: { from: preview.monthlyFrom, to: preview.monthlyTo }, fee: { from: preview.feeFrom, to: preview.feeTo }, price },
    ...(input.actor ? { actor: input.actor } : {}),
  });

  // Meta: sofort bzw. am Stichtag (Cron) automatisch umstellen; sonst Aufgabe mit Grund
  const metaSync = immediate
    ? await syncBudgetChangeToMeta(row.id, { ...defaultBudgetSyncDeps(), notify: async () => undefined }, now).catch((err) => {
        reportError(err, "budget-meta-sync");
        return null;
      })
    : null;
  if (price === "manual") {
    await adminTask(
      info.contactId,
      `Preis prüfen ${info.name}: neue Betreuungsstufe ${preview.tierTo?.label ?? ""}`.trim(),
      `Individuelle Konditionen (${approval.kind === "apply" && approval.price === "manual" ? reasonLabel(approval.reason) : ""}). Bisher ${preview.feeFrom != null ? eur(preview.feeFrom) : "–"} netto/Monat; Listenpreis neu ${preview.tierTo ? eur(preview.tierTo.monthly) : "–"}. Bitte Preis festlegen, dem Kunden bestätigen und in Stripe anpassen.`,
      immediate ? now : eff,
    );
  }
  await notifyAdmins(
    `Budget geändert: ${info.name}`,
    `${eur(preview.monthlyFrom)} → ${eur(preview.monthlyTo)}/Monat ${when}.${preview.tierChange ? ` Neue Stufe ${preview.tierTo?.label ?? ""}.` : ""} ${
      metaSync?.status === "done" ? "Budget bei Meta umgestellt." : immediate ? "Meta-Budget bitte anpassen (siehe Aufgabe)." : "Wird am Stichtag bei Meta umgestellt."
    }`,
    info.contactId,
    input.customerId,
  );
  if (info.contactId) await logOfferActivity({ dealId: null, salesContactId: info.contactId }, `Werbebudget geändert (${when})`, changeList(changes).join(" · ")).catch(() => {});

  if (price === "auto" && immediate) await applyBudgetFee(row.id, now);

  const paragraphs = [`Ihr Werbebudget wird ${when} angepasst. Wir stellen die Anzeigen bei Meta entsprechend um, in der Regel innerhalb eines Werktags.`];
  if (preview.belowGuarantee.length) paragraphs.push("Bitte beachten Sie: Die Lead-Garantie gilt ab 20 € pro Tag und Produkt.");
  if (price === "auto" && preview.feeTo != null && preview.feeFrom != null) {
    paragraphs.push(`Mit dem neuen Werbebudget gilt die Betreuungsstufe ${preview.tierTo?.label ?? ""}: ${eur(preview.feeTo)} statt ${eur(preview.feeFrom)} netto im Monat, ab dem nächsten Abrechnungsmonat.`);
  } else if (price === "manual") {
    paragraphs.push("Mit dem neuen Werbebudget gilt eine andere Betreuungsstufe. Da Ihre Konditionen individuell sind, bestätigen wir Ihnen den neuen Preis gesondert.");
  }
  await mailCustomer(info, {
    subject: "Ihr Werbebudget wurde angepasst",
    paragraphs,
    list: [...changeList(changes), `Werbebudget pro Monat: ${eur(preview.monthlyTo)} (bisher ${eur(preview.monthlyFrom)})`],
  });
  return { ok: true, status: "applied", changeId: row.id, preview, price };
}

function reasonLabel(r: string | null | undefined): string {
  return r === "annual" ? "Jahreszahler" : r === "no_offer_price" ? "kein Listenpreis hinterlegt" : r === "individual_budget" ? "über Listenpreis" : "abweichender Preis";
}

export async function mailCustomer(info: { contactId: string | null; contactName: string | null; to: string[] }, m: { subject: string; paragraphs: string[]; list?: string[] }) {
  if (!info.to.length) return;
  // Mail darf die Änderung nie scheitern lassen
  try {
    await sendCustomerMail({
      to: info.to,
      subject: m.subject,
      greeting: await customerGreeting({ salesContactId: info.contactId, contactName: info.contactName }),
      paragraphs: m.paragraphs,
      ...(m.list ? { list: m.list } : {}),
      button: { label: "Zum Kundenbereich", url: `${getAppUrl()}/buyer/konto` },
    });
  } catch (err) {
    reportError(err, "budget-mail");
  }
}

/**
 * Neuen Monatspreis ins Abo übernehmen (gilt ab dem nächsten Abrechnungsmonat).
 * Idempotent: nur Änderungen mit stripeStatus „scheduled“ werden genau einmal bearbeitet.
 */
export async function applyBudgetFee(changeId: string, now = new Date()): Promise<"done" | "manual" | "error" | "skipped"> {
  const claimed = await prisma.budgetChange.updateMany({ where: { id: changeId, stripeStatus: "scheduled", status: "applied" }, data: { stripeStatus: "processing" } });
  if (claimed.count === 0) return "skipped";
  const ch = await prisma.budgetChange.findUniqueOrThrow({ where: { id: changeId } });
  const feeTo = ch.feeTo == null ? null : Number(ch.feeTo);
  if (feeTo == null) {
    await prisma.budgetChange.update({ where: { id: changeId }, data: { stripeStatus: "manual", stripeNote: "Kein Listenpreis" } });
    return "manual";
  }
  const r = await changeMonthlyFee(ch.customerId, feeTo, { idempotencyKey: `budget-${ch.id}`, actor: { role: "system" } });
  const info = await customerInfo(ch.customerId);
  if (!r.ok || r.note) {
    const note = r.ok ? r.note! : r.error;
    await prisma.budgetChange.update({ where: { id: changeId }, data: { stripeStatus: r.ok ? "manual" : "error", stripeNote: note } });
    await adminTask(info.contactId, `Preis anpassen ${info.name}: ${eur(feeTo)} netto/Monat ab nächstem Abrechnungsmonat`, `Nach Budgetänderung (neue Stufe). Automatisch nicht möglich: ${note}`, now);
    return r.ok ? "manual" : "error";
  }
  await prisma.$transaction([
    prisma.budgetChange.update({ where: { id: changeId }, data: { stripeStatus: "done", feeAppliedAt: now, stripeNote: r.from ? `ab ${fmtDate(r.from)}` : null } }),
    // Hinweis: Die Zahlen rechnen retainerMonthly ab Vertragsstart (wie bei Änderungen in der Kundenakte).
    prisma.customer.update({ where: { id: ch.customerId }, data: { retainerMonthly: feeTo } }),
  ]);
  await audit("budget.fee", { entity: "BudgetChange", entityId: changeId, customerId: ch.customerId, details: { from: ch.feeFrom == null ? null : Number(ch.feeFrom), to: feeTo, changed: r.changed }, actor: { role: "system" } });
  return "done";
}

/** Cron: geplante Preiswechsel übernehmen, sobald das neue Budget gilt. */
export async function processDueBudgetFees(now = new Date()): Promise<number> {
  const due = await prisma.budgetChange.findMany({ where: { stripeStatus: "scheduled", status: "applied", effectiveFrom: { lte: now } }, select: { id: true } });
  let n = 0;
  for (const d of due) if ((await applyBudgetFee(d.id, now)) === "done") n++;
  return n;
}

/** Admin: Anfrage über individualFrom übernehmen (Preis individuell, von Hand) oder ablehnen. */
export async function decideBudgetRequest(changeId: string, accept: boolean, note: string | null, actor?: AuditActor, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const ch = await prisma.budgetChange.findUnique({ where: { id: changeId } });
  if (!ch) return { ok: false, error: "Anfrage nicht gefunden." };
  const claimed = await prisma.budgetChange.updateMany({
    where: { id: changeId, status: "pending" },
    data: { status: accept ? "applied" : "rejected", decidedAt: now, decidedBy: actor?.email ?? "admin", note: note?.trim() || null, stripeStatus: accept ? "manual" : "none" },
  });
  if (claimed.count === 0) return { ok: false, error: "Die Anfrage ist schon entschieden." };
  const changes = (Array.isArray(ch.changes) ? ch.changes : []) as unknown as Change[];
  const eff = ch.effectiveFrom > now ? ch.effectiveFrom : now;
  if (accept) {
    await prisma.$transaction([
      prisma.customerBudget.deleteMany({ where: { customerId: ch.customerId, product: { in: changes.map((c) => c.product) }, validFrom: { gt: now } } }),
      prisma.customerBudget.createMany({ data: changes.map((c) => ({ customerId: ch.customerId, product: c.product, dailyBudget: c.to, validFrom: eff, changeId: ch.id })) }),
    ]);
  }
  await audit("budget.decide", { entity: "BudgetChange", entityId: changeId, customerId: ch.customerId, details: { accept, note }, ...(actor ? { actor } : {}) });
  const info = await customerInfo(ch.customerId);
  if (accept) {
    await adminTask(info.contactId, `Preis bestätigen ${info.name}: Budget-Anfrage übernommen`, "Preis individuell: bitte dem Kunden bestätigen und in Stripe anpassen.", eff);
    // Meta-Budget: sofort bzw. am Stichtag automatisch (sonst Aufgabe mit Grund)
    await prisma.budgetChange.update({ where: { id: changeId }, data: { metaStatus: "scheduled" } });
    if (eff.getTime() <= now.getTime()) await syncBudgetChangeToMeta(changeId, defaultBudgetSyncDeps(), now).catch((err) => reportError(err, "budget-meta-sync"));
  }
  await mailCustomer(info, accept
    ? { subject: "Ihr Werbebudget wurde angepasst", paragraphs: [`wir haben Ihr gewünschtes Werbebudget übernommen, gültig ab ${fmtDate(eff)}. Den Preis für Ihre Betreuung bestätigen wir Ihnen gesondert.`, ...(note?.trim() ? [note.trim()] : [])], list: changeList(changes) }
    : { subject: "Ihre Budget-Anfrage", paragraphs: ["vielen Dank für Ihre Anfrage. Wir können das gewünschte Werbebudget so leider nicht übernehmen, Ihr bisheriges Budget läuft weiter.", ...(note?.trim() ? [note.trim()] : []), "Bei Fragen antworten Sie einfach auf diese E-Mail."], list: changeList(changes) });
  return { ok: true };
}

/** Historie für Kundenakte und Konto. */
export async function budgetHistory(customerId: string, take = 20) {
  const rows = await prisma.budgetChange.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    effectiveFrom: r.effectiveFrom,
    changes: (Array.isArray(r.changes) ? r.changes : []) as unknown as Change[],
    monthlyBudgetFrom: r.monthlyBudgetFrom,
    monthlyBudgetTo: r.monthlyBudgetTo,
    feeFrom: r.feeFrom == null ? null : Number(r.feeFrom),
    feeTo: r.feeTo == null ? null : Number(r.feeTo),
    tierChange: r.tierChange,
    status: r.status,
    reason: r.reason,
    reasonLabel: r.reason ? reasonLabel(r.reason) : null,
    stripeStatus: r.stripeStatus,
    stripeNote: r.stripeNote,
    note: r.note,
    decidedBy: r.decidedBy,
  }));
}
export type BudgetHistoryRow = Awaited<ReturnType<typeof budgetHistory>>[number];
