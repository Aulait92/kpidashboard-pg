// Zusatzpakete für Kampagnen-Nachrichten im Bestandskunden-Modul (Ole, 14.11.2026).
// - Nur der Inhaber bucht selbst im Kundenbereich (Bestand → Paket dazubuchen).
// - Abrechnung: eigener Rechnungsposten in Stripe (Produkt „Zusatzpaket Kampagnen-Nachrichten“),
//   hängt an der nächsten Abo-Rechnung; Jahreszahler bekommen sofort eine eigene Rechnung.
// - Sofort freigeschaltet, gültig PRICE_LIST.bestandPackMonths Monate; Verbrauch erst Monatskontingent,
//   dann ältestes Paket (lib/bestand/quota.ts).
// - Optional „Automatisch nachbuchen“: 500er-Pakete bis höchstens X € im Monat (Customer.bestandAutoTopUpMax),
//   Mail bei jeder Nachbuchung.
// - Ab PRICE_LIST.bestandPackIndividualFrom Nachrichten im Monat: Anfrage, Aufgabe für uns.
// Für Umsatz (Admin) und Kosten des Kunden (/buyer/zahlen): bestandPackSpend, bestandPackRevenueRows.

import { prisma } from "@/lib/prisma";
import { PRICE_LIST, eur } from "@/lib/offer-pricing";
import { PROVIDER } from "@/lib/legal-texts";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { berlinMonthStart, QUOTA_PAUSE } from "@/lib/bestand/quota";

export type PackOption = (typeof PRICE_LIST.bestandPacks)[number];
export const PACKS: readonly PackOption[] = PRICE_LIST.bestandPacks;
/** Paket für automatisches Nachbuchen (das kleinste). */
export const AUTO_PACK: PackOption = PACKS[0];

export const packFor = (messages: number): PackOption | null => PACKS.find((p) => p.messages === messages) ?? null;

/** Ablauf: gleicher Tag in PRICE_LIST.bestandPackMonths Monaten (Monatsende wird abgeschnitten). */
export function packExpiry(from: Date, months: number = PRICE_LIST.bestandPackMonths): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

const fmtDate = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const de = (n: number) => n.toLocaleString("de-DE");

export type PurchaseResult =
  | { ok: true; packId: string; messages: number; amount: number; expiresAt: Date }
  | { ok: false; error: string; /** Online-Buchung nicht möglich → Anfrage anbieten */ fallback?: boolean };

/** Darf jetzt online gebucht werden? null = ja, sonst Grund. */
export async function packPurchaseBlocker(customerId: string): Promise<string | null> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { existingCustomersEnabled: true, paymentOverdueSince: true, stripeCustomerId: true } });
  if (!c) return "Konto nicht gefunden.";
  if (!c.existingCustomersEnabled) return "Das Bestandskunden-Modul ist nicht gebucht.";
  if (c.paymentOverdueSince) return "Es ist noch eine Rechnung offen.";
  const { selfServiceBillingBlocker } = await import("@/lib/billing");
  return selfServiceBillingBlocker(c.stripeCustomerId);
}

/**
 * Paket buchen: erst festhalten, dann Stripe (Idempotenz je Paket). Klappt Stripe nicht, wird das
 * Paket wieder entfernt (nichts freigeschaltet, nichts berechnet).
 */
export async function purchasePack(
  customerId: string,
  messages: number,
  opts: { source?: "kauf" | "auto"; actor?: AuditActor & { email?: string | null }; now?: Date } = {},
): Promise<PurchaseResult> {
  const now = opts.now ?? new Date();
  const source = opts.source ?? "kauf";
  const option = packFor(messages);
  if (!option) return { ok: false, error: "Dieses Paket gibt es nicht." };
  const blocker = await packPurchaseBlocker(customerId);
  if (blocker) return { ok: false, error: blocker, fallback: true };
  const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { name: true, stripeCustomerId: true, billingInterval: true } });
  const expiresAt = packExpiry(now);
  const pack = await prisma.bestandMessagePack.create({
    data: { customerId, messages: option.messages, amount: option.price, purchasedAt: now, expiresAt, source, createdById: opts.actor?.id ?? null, stripeStatus: "pending" },
  });
  const description = `Zusatzpaket Bestandskunden: ${de(option.messages)} Kampagnen-Nachrichten, gültig bis ${fmtDate(expiresAt)}${source === "auto" ? " (automatisch nachgebucht)" : ""}`;
  const metadata = { pg_kind: "bestand_paket", pack: pack.id, customer_id: customerId, messages: String(option.messages) };
  try {
    const billing = await import("@/lib/billing");
    if (c.billingInterval === "year") {
      // Jahreszahler: die nächste Abo-Rechnung kommt erst zur Verlängerung → eigene Rechnung sofort
      const r = await billing.chargeNow({
        stripeCustomerId: c.stripeCustomerId!,
        lines: [{ description, amountEur: option.price }],
        description,
        idempotencyKey: `bestand-paket-${pack.id}`,
        metadata,
        productKey: "bestand_paket",
      });
      await prisma.bestandMessagePack.update({ where: { id: pack.id }, data: { stripeInvoiceId: r.invoiceId, stripeStatus: r.status === "failed" ? "failed" : "invoiced" } });
      if (r.status === "failed") await notifyAdmins(customerId, `Zusatzpaket: Zahlung fehlgeschlagen bei ${c.name}`, `Rechnung ${r.invoiceId} offen, Paket ist freigeschaltet.`);
    } else {
      const itemId = await billing.addInvoiceItem({
        stripeCustomerId: c.stripeCustomerId!,
        amountEur: option.price,
        description,
        idempotencyKey: `bestand-paket-${pack.id}`,
        metadata,
        productKey: "bestand_paket",
      });
      await prisma.bestandMessagePack.update({ where: { id: pack.id }, data: { stripeInvoiceItemId: itemId, stripeStatus: "added" } });
    }
  } catch (err) {
    reportError(err, "bestand-paket", { customer: customerId });
    await prisma.bestandMessagePack.delete({ where: { id: pack.id } }).catch(() => {});
    return { ok: false, error: "Die Buchung hat gerade nicht geklappt. Bitte später erneut versuchen oder bei uns melden." };
  }
  await audit("bestand.paket", {
    entity: "BestandMessagePack",
    entityId: pack.id,
    customerId,
    details: { messages: option.messages, amount: option.price, source, expiresAt: expiresAt.toISOString() },
    ...(opts.actor ? { actor: opts.actor } : { actor: { role: "system" } }),
  });
  await resumeQuotaPausedCampaigns(customerId, now);
  await notifyAdmins(customerId, `Zusatzpaket ${source === "auto" ? "automatisch nachgebucht" : "gebucht"}: ${c.name}`, `+${de(option.messages)} Nachrichten für ${eur(option.price)} netto, gültig bis ${fmtDate(expiresAt)}`);
  const autoInfo = source === "auto" ? await autoTopUpState(customerId, now) : null;
  await mailOwners(customerId, {
    subject: source === "auto" ? "Zusatzpaket automatisch nachgebucht" : "Ihr Zusatzpaket ist gebucht",
    paragraphs: [
      source === "auto"
        ? `Ihr Kontingent für Kampagnen-Nachrichten war aufgebraucht. Wie eingestellt haben wir automatisch ein Zusatzpaket mit ${de(option.messages)} Nachrichten für ${eur(option.price)} netto nachgebucht, damit Ihre Kampagnen weiterlaufen.`
        : `vielen Dank, Ihr Zusatzpaket mit ${de(option.messages)} Kampagnen-Nachrichten ist ab sofort freigeschaltet (${eur(option.price)} netto, einmalig).`,
      `Das Paket gilt bis ${fmtDate(expiresAt)}. Verbraucht wird zuerst Ihr Monatskontingent, dann das älteste Paket. Der Betrag erscheint als eigener Posten ${c.billingInterval === "year" ? "auf einer eigenen Rechnung" : "auf Ihrer nächsten Rechnung"}.`,
      ...(autoInfo
        ? [`Diesen Monat automatisch nachgebucht: ${eur(autoInfo.spent)} von höchstens ${eur(autoInfo.max ?? 0)}. Ändern oder abschalten können Sie das unter Bestand.`]
        : []),
    ],
  });
  return { ok: true, packId: pack.id, messages: option.messages, amount: option.price, expiresAt };
}

/** Pausierte Kampagnen (Kontingent aufgebraucht) wieder anlaufen lassen. */
export async function resumeQuotaPausedCampaigns(customerId: string, _now = new Date()): Promise<number> {
  const r = await prisma.customerCampaign.updateMany({ where: { customerId, status: "paused", pausedReason: QUOTA_PAUSE }, data: { status: "running", pausedReason: null } });
  return r.count;
}

// ─── Automatisch nachbuchen ──────────────────────────────────────────────

export async function autoTopUpState(customerId: string, now = new Date()): Promise<{ max: number | null; spent: number; count: number }> {
  const [c, agg] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { bestandAutoTopUpMax: true } }),
    prisma.bestandMessagePack.aggregate({ where: { customerId, source: "auto", purchasedAt: { gte: berlinMonthStart(now) } }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  return { max: c?.bestandAutoTopUpMax ?? null, spent: Number(agg._sum.amount ?? 0), count: agg._count._all };
}

/** Einstellung speichern (null = aus). Mindestens ein 500er-Paket, höchstens 5.000 € im Monat. */
export async function setAutoTopUp(customerId: string, maxEur: number | null, actor?: AuditActor): Promise<{ ok: true; max: number | null } | { ok: false; error: string }> {
  let max: number | null = null;
  if (maxEur != null) {
    if (!Number.isFinite(maxEur) || maxEur < AUTO_PACK.price) return { ok: false, error: `Bitte mindestens ${eur(AUTO_PACK.price)} eintragen (ein Paket).` };
    if (maxEur > 5000) return { ok: false, error: "Höchstens 5.000 € im Monat. Für mehr melden Sie sich bitte bei uns." };
    max = Math.floor(maxEur);
  }
  await prisma.customer.update({ where: { id: customerId }, data: { bestandAutoTopUpMax: max } });
  await audit("bestand.auto_topup", { entity: "Customer", entityId: customerId, customerId, details: { max }, ...(actor ? { actor } : {}) });
  return { ok: true, max };
}

/** Im Versand: Kontingent leer → ein 500er-Paket nachbuchen, wenn eingeschaltet und Höchstbetrag nicht erreicht. */
export async function autoTopUp(customerId: string, now = new Date()): Promise<boolean> {
  const s = await autoTopUpState(customerId, now);
  if (s.max == null || s.spent + AUTO_PACK.price > s.max) return false;
  const r = await purchasePack(customerId, AUTO_PACK.messages, { source: "auto", now });
  if (!r.ok) reportError(new Error(`Automatisch nachbuchen fehlgeschlagen: ${r.error}`), "bestand-auto-paket", { customer: customerId });
  return r.ok;
}

// ─── Große Pakete: Anfrage ──────────────────────────────────────────────

/** „Ab 5.000 Nachrichten im Monat: individuell“ → Aufgabe und Push für uns, Mail an uns. */
export async function requestLargePack(customerId: string, opts: { messagesPerMonth: number | null; note: string | null; actor?: AuditActor & { email?: string | null }; now?: Date }): Promise<{ ok: true }> {
  const now = opts.now ?? new Date();
  const { customerInfo, adminTask } = await import("@/lib/budget");
  const info = await customerInfo(customerId);
  const wish = opts.messagesPerMonth ? `${de(opts.messagesPerMonth)} Nachrichten im Monat` : `ab ${de(PRICE_LIST.bestandPackIndividualFrom)} Nachrichten im Monat`;
  await adminTask(
    info.contactId,
    `Bestandskunden: individuelles Nachrichtenpaket für ${info.name}`,
    [`Wunsch: ${wish}.`, opts.note ? `Nachricht: ${opts.note}` : null, "Angebot machen; freischalten in der Kundenakte unter Abrechnung (Kampagnen-Nachrichten je Monat)."].filter(Boolean).join("\n"),
    now,
  );
  await notifyAdmins(customerId, `Paket-Anfrage: ${info.name}`, `Bestandskunden-Kampagnen: ${wish}`);
  const { sendCustomerMail } = await import("@/lib/email");
  await sendCustomerMail({
    to: process.env.ADMIN_EMAIL?.trim() || PROVIDER.email,
    subject: `Paket-Anfrage Bestandskunden: ${info.name}`,
    greeting: "Hallo,",
    paragraphs: [`${info.name}${opts.actor?.email ? ` (${opts.actor.email})` : ""} fragt ein individuelles Nachrichtenpaket an: ${wish}.`, ...(opts.note ? [`Nachricht: ${opts.note}`] : []), "Aufgabe liegt in „Heute“."],
    signature: PROVIDER.brand,
    replyTo: opts.actor?.email ?? null,
  }).catch((err) => reportError(err, "bestand-paket-anfrage-mail"));
  await audit("bestand.paket_anfrage", { entity: "Customer", entityId: customerId, customerId, details: { messagesPerMonth: opts.messagesPerMonth, note: opts.note }, ...(opts.actor ? { actor: opts.actor } : {}) });
  return { ok: true };
}

// ─── Hinweise an Kunde und uns ──────────────────────────────────────────

async function notifyAdmins(customerId: string, title: string, body: string) {
  const { sendToAdmins } = await import("@/lib/push");
  await sendToAdmins({ title, body, url: `/admin/kunden/${customerId}/abrechnung`, tag: `bestand-paket:${customerId}` }).catch((err) => reportError(err, "bestand-paket-push"));
}

async function mailOwners(customerId: string, m: { subject: string; paragraphs: string[] }) {
  const owners = await prisma.user.findMany({ where: { customerId, role: "BUYER", teamRole: "owner" }, select: { email: true } });
  if (!owners.length) return;
  const { sendCustomerMail, getAppUrl } = await import("@/lib/email");
  let url: string | null = null;
  try {
    url = `${getAppUrl()}/buyer/bestand`;
  } catch {
    url = null; // ohne APP_URL (z. B. Tests) Mail ohne Knopf
  }
  await sendCustomerMail({ to: owners.map((o) => o.email), subject: m.subject, greeting: "Guten Tag,", paragraphs: m.paragraphs, ...(url ? { button: { label: "Zum Bestand", url } } : {}) }).catch((err) =>
    reportError(err, "bestand-paket-mail"),
  );
}

/** Laufende Kampagne am Limit: pausieren mit Hinweis (statt still zu stoppen), Inhaber einmal benachrichtigen. */
export async function pauseForQuota(campaignId: string, customerId: string): Promise<void> {
  const r = await prisma.customerCampaign.updateMany({ where: { id: campaignId, status: "running" }, data: { status: "paused", pausedReason: QUOTA_PAUSE } });
  if (!r.count) return;
  // Nur Inhaber (Bestand ist Inhaber-Seite)
  const { sendToUser } = await import("@/lib/push");
  const owners = await prisma.user.findMany({ where: { customerId, role: "BUYER", teamRole: "owner" }, select: { id: true } });
  for (const o of owners) {
    await sendToUser(o.id, {
      title: "Kampagne pausiert: Kontingent aufgebraucht",
      body: "Noch 0 Nachrichten diesen Monat. Mit einem Zusatzpaket geht es sofort weiter.",
      url: "/buyer/bestand#kontingent",
      tag: `bestand-kontingent:${customerId}`,
    }).catch(() => {});
  }
}

// ─── Zahlen: Umsatz (Admin) und Kosten des Kunden ────────────────────────

/**
 * Ausgaben eines Kunden für Zusatzpakete (netto) im Zeitraum [from, to), nach Kaufdatum.
 * Für den Kunden-Gewinn auf /buyer/zahlen (Agenturkosten): total zu den Abo-Kosten addieren.
 */
export async function bestandPackSpend(customerId: string, from: Date, to: Date): Promise<{ total: number; packs: { purchasedAt: Date; amount: number; messages: number; source: string }[] }> {
  const rows = await prisma.bestandMessagePack.findMany({
    where: { customerId, purchasedAt: { gte: from, lt: to } },
    orderBy: { purchasedAt: "asc" },
    select: { purchasedAt: true, amount: true, messages: true, source: true },
  });
  const packs = rows.map((r) => ({ purchasedAt: r.purchasedAt, amount: Number(r.amount), messages: r.messages, source: r.source }));
  return { total: Math.round(packs.reduce((s, p) => s + p.amount, 0) * 100) / 100, packs };
}

/** Paket-Umsatz je Kunde und Monat („YYYY-MM“, Berliner Zeit) ab `from`, für das Umsatzbuch (Einmal-Umsatz). */
export async function bestandPackRevenueRows(from: Date): Promise<{ customerId: string; month: string; amount: number }[]> {
  return prisma.$queryRaw<{ customerId: string; month: string; amount: number }[]>`
    SELECT p."customerId", to_char((p."purchasedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS month,
           SUM(p.amount)::float8 AS amount
    FROM "BestandMessagePack" p
    LEFT JOIN "Customer" c ON c.id = p."customerId"
    WHERE p."purchasedAt" >= ${from} AND (c.plan IS NULL OR c.plan <> 'internal')
    GROUP BY 1, 2`;
}
