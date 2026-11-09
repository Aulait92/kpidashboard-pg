// Onboarding ab Vertragsannahme: Kundenkonto + Login anlegen, Willkommens-
// Mail schicken, Aufgaben für den Vertrieb erzeugen und eine Checkliste
// führen, die Admin und Kunde sehen.
//
// Start: automatisch, sobald die Zahlung eingerichtet ist (Stripe-Webhook)
// bzw. direkt bei Annahme, wenn keine Online-Zahlung aktiv ist. Zusätzlich
// per Knopf am Vertriebskontakt (z. B. für Bestandskunden).

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, issuePasswordResetToken } from "@/lib/auth";
import { buildResetUrl, getAppUrl, sendCustomerMail, sendOnboardingWelcomeEmail } from "@/lib/email";
import { logOfferActivity, offerAdminHref, setContactCustomerStage } from "@/lib/offer-links";
import { billingEnabled } from "@/lib/billing";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { offerProducts } from "@/components/offer-document";

const DAY = 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = 7 * DAY;

type StartOpts = { customerId?: string | null; sendWelcome?: boolean };
export type StartResult = { ok: true; onboardingId: string; customerId: string; created: boolean } | { ok: false; error: string };

/** Kundenname ist eindeutig → bei Gleichstand Ort bzw. Zähler anhängen. */
async function uniqueCustomerName(base: string, city: string | null): Promise<string> {
  const candidates = [base, city ? `${base} (${city})` : null].filter(Boolean) as string[];
  for (const c of candidates) {
    if (!(await prisma.customer.findUnique({ where: { name: c }, select: { id: true } }))) return c;
  }
  for (let i = 2; i < 50; i++) {
    const c = `${base} (${i})`;
    if (!(await prisma.customer.findUnique({ where: { name: c }, select: { id: true } }))) return c;
  }
  return `${base} (${crypto.randomBytes(3).toString("hex")})`;
}

/** Fälligkeit einer Aufgabe: X Tage vor Start, aber nie in der Vergangenheit. */
function dueBefore(start: Date | null, daysBefore: number, minDaysFromNow: number): Date {
  const min = new Date(Date.now() + minDaysFromNow * DAY);
  if (!start) return min;
  const d = new Date(start.getTime() - daysBefore * DAY);
  const due = d < min ? min : d;
  due.setUTCHours(8, 0, 0, 0); // 9 bzw. 10 Uhr deutscher Zeit
  return due;
}

export async function startOnboarding(offerId: string, opts: StartOpts = {}): Promise<StartResult> {
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (offer.status !== "accepted") return { ok: false, error: "Das Angebot ist noch nicht angenommen." };

  const existing = await prisma.onboarding.findUnique({ where: { offerId: offer.id } });
  if (existing) return { ok: true, onboardingId: existing.id, customerId: existing.customerId, created: false };

  const contact = offer.salesContactId
    ? await prisma.salesContact.findUnique({ where: { id: offer.salesContactId } })
    : null;
  const pkg = offer.package === "service" ? "service" : "software";

  // 1) Kundenkonto: vorgegeben, schon am Kontakt verknüpft oder neu.
  let customerId = opts.customerId || contact?.customerId || null;
  if (customerId) {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!c) return { ok: false, error: "Kundenkonto nicht gefunden." };
    if (await prisma.onboarding.findUnique({ where: { customerId }, select: { id: true } })) {
      return { ok: false, error: "Für dieses Kundenkonto läuft bereits ein Onboarding." };
    }
  }
  const stripeFree =
    offer.stripeCustomerId &&
    !(await prisma.customer.findUnique({ where: { stripeCustomerId: offer.stripeCustomerId }, select: { id: true } }));

  const customer = customerId
    ? await prisma.customer.update({
        where: { id: customerId },
        data: {
          plan: pkg,
          retainerMonthly: offer.monthlyFee,
          retainerStart: offer.startDate,
          ...(stripeFree ? { stripeCustomerId: offer.stripeCustomerId } : {}),
        },
      })
    : await prisma.customer.create({
        data: {
          name: await uniqueCustomerName((offer.company || offer.contactName).trim(), offer.city),
          plan: pkg,
          retainerMonthly: offer.monthlyFee,
          retainerStart: offer.startDate,
          ...(stripeFree ? { stripeCustomerId: offer.stripeCustomerId } : {}),
        },
      });
  customerId = customer.id;

  if (contact && contact.customerId !== customer.id) {
    await prisma.salesContact
      .update({ where: { id: contact.id }, data: { customerId: customer.id } })
      .catch((err) => reportError(err, "onboarding-link-contact")); // anderer Kontakt hält das Konto schon
  }

  const onboarding = await prisma.onboarding.create({
    data: {
      customerId: customer.id,
      offerId: offer.id,
      salesContactId: contact?.id ?? null,
      package: pkg,
      startDate: offer.startDate,
    },
  });

  // 2) Login für den Kunden (Passwort setzt er selbst über den Einladungslink).
  const email = offer.email?.trim().toLowerCase() || contact?.email?.trim().toLowerCase() || null;
  let setPasswordUrl: string | null = null;
  if (email) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, customerId: true } });
    if (!user) {
      await prisma.user.create({
        data: {
          email,
          // Unbenutzbares Zufallspasswort – der Kunde legt sein eigenes fest.
          passwordHash: await hashPassword(crypto.randomBytes(24).toString("base64url")),
          role: "BUYER",
          customerId: customer.id,
        },
      });
      const token = await issuePasswordResetToken(email, INVITE_TTL_MS);
      if (token) setPasswordUrl = buildResetUrl(token.rawToken);
    } else if (user.role === "BUYER" && !user.customerId) {
      await prisma.user.update({ where: { id: user.id }, data: { customerId: customer.id } });
    }
  }

  // 3) Aufgaben für den Vertrieb (am Kontakt, erscheinen unter Vertrieb → Aufgaben).
  if (contact) {
    const start = offer.startDate;
    const tasks = [
      { title: "Onboarding: Pflichtangaben (Impressum) der Agentur-Website prüfen", dueAt: dueBefore(null, 0, 1) },
      { title: "Onboarding: Kampagne und Leadformular anlegen", dueAt: dueBefore(start, 5, 2) },
      { title: "Onboarding: Testlead durchspielen", dueAt: dueBefore(start, 2, 3) },
      { title: "Onboarding: Go-live – Kampagne aktivieren", dueAt: dueBefore(start, 0, 4) },
    ];
    await prisma.salesTask
      .createMany({ data: tasks.map((t) => ({ ...t, contactId: contact.id, type: "SONSTIGES" as const })) })
      .catch((err) => reportError(err, "onboarding-tasks"));
  }

  // 4) Willkommens-Mail.
  if (opts.sendWelcome !== false && email) {
    await sendWelcome(onboarding.id, { setPasswordUrl });
  }

  await setContactCustomerStage(offer, "ONBOARDING");
  await logOfferActivity(offer, `Onboarding gestartet (${pkg === "service" ? "Nur Betreuung" : "Betreuung + Software"})`, `Kundenkonto: ${customer.name}`);
  await sendToAdmins({
    title: `🚀 Onboarding gestartet: ${customer.name}`,
    body: offer.startDate ? `Start ${offer.startDate.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}` : offer.number,
    url: offerAdminHref(offer),
    tag: `onboarding:${onboarding.id}`,
  }).catch((err) => reportError(err, "onboarding-push"));

  return { ok: true, onboardingId: onboarding.id, customerId: customer.id, created: true };
}

/** Willkommens-Mail (erneut) senden. Ohne Link wird ein frischer Einladungslink erzeugt, solange der Kunde noch nie eingeloggt war. */
export async function sendWelcome(onboardingId: string, opts: { setPasswordUrl?: string | null } = {}) {
  const ob = await prisma.onboarding.findUnique({
    where: { id: onboardingId },
    include: { customer: { include: { users: { where: { role: "BUYER" }, select: { email: true, lastLoginAt: true } } } } },
  });
  if (!ob) return { ok: false as const, error: "Onboarding nicht gefunden." };
  const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId } }) : null;
  const user = ob.customer.users[0];
  const to = user?.email ?? offer?.email;
  if (!to) return { ok: false as const, error: "Keine E-Mail-Adresse für den Kunden hinterlegt." };

  let setPasswordUrl = opts.setPasswordUrl ?? null;
  if (!setPasswordUrl && user && !user.lastLoginAt) {
    const token = await issuePasswordResetToken(user.email, INVITE_TTL_MS);
    if (token) setPasswordUrl = buildResetUrl(token.rawToken);
  }
  const res = await sendOnboardingWelcomeEmail({
    to,
    contactName: offer?.contactName ?? ob.customer.name,
    packageType: ob.package === "service" ? "service" : "software",
    startDate: ob.startDate,
    products: offer ? offerProducts(offer.products).map((p) => p.name) : [],
    setPasswordUrl,
    loginUrl: `${getAppUrl()}/login`,
    setupUrl: `${getAppUrl()}/buyer/einrichtung`,
    replyTo: process.env.OFFER_REPLY_TO ?? null,
  });
  if (res.ok) {
    await prisma.onboarding.update({ where: { id: ob.id }, data: { welcomeSentAt: new Date() } });
    if (offer) await logOfferActivity(offer, `Willkommens-Mail an ${to} gesendet`);
  } else {
    reportError(new Error(res.error), "onboarding-welcome", { onboarding: ob.id });
  }
  return res;
}

// ─── Checkliste ────────────────────────────────────────────────────────

export type ChecklistItem = {
  key: string;
  label: string;
  /** Wer ist dran: der Kunde, du (Vertrieb/Media-Buying) oder automatisch. */
  owner: "kunde" | "du" | "auto";
  done: boolean;
  at: Date | null;
  /** Kann im Admin von Hand abgehakt werden. */
  manual?: keyof typeof MANUAL_FIELDS;
};

export const MANUAL_FIELDS = {
  metaAccess: "metaAccessAt",
  website: "websiteCheckedAt",
  campaign: "campaignReadyAt",
  testLead: "testLeadAt",
} as const;

export async function loadOnboarding(where: { customerId: string } | { id: string }) {
  return prisma.onboarding.findUnique({
    where,
    include: {
      customer: {
        include: {
          users: { where: { role: "BUYER" }, select: { email: true, lastLoginAt: true } },
          calendarConnection: { select: { status: true } },
          whatsAppAccount: { select: { status: true } },
        },
      },
    },
  });
}

export type OnboardingFull = NonNullable<Awaited<ReturnType<typeof loadOnboarding>>>;

export function onboardingChecklist(ob: OnboardingFull, offer: { paymentStatus: string; paidAt: Date | null } | null): ChecklistItem[] {
  const software = ob.package !== "service";
  const firstLogin = ob.customer.users.map((u) => u.lastLoginAt).filter(Boolean).sort()[0] ?? null;
  const items: ChecklistItem[] = [];
  // Nur mit Online-Zahlung (Stripe) – sonst läuft die Zahlung außerhalb der App.
  if (offer && billingEnabled()) {
    items.push({
      key: "payment",
      label: "Zahlung eingerichtet",
      owner: "kunde",
      done: offer.paymentStatus === "paid" || offer.paymentStatus === "processing",
      at: offer.paidAt ?? null,
    });
  }
  items.push(
    { key: "welcome", label: "Willkommens-Mail verschickt", owner: "auto", done: !!ob.welcomeSentAt, at: ob.welcomeSentAt },
    { key: "login", label: "Kunde hat sich eingeloggt", owner: "kunde", done: !!firstLogin, at: firstLogin },
    { key: "questionnaire", label: "Fragebogen ausgefüllt", owner: "kunde", done: !!ob.questionnaireAt, at: ob.questionnaireAt },
    { key: "metaAccess", label: "Meta-Zugriff (Werbekonto + Seite) erteilt", owner: "kunde", done: !!ob.metaAccessAt, at: ob.metaAccessAt, manual: "metaAccess" },
  );
  if (software) {
    items.push(
      { key: "calendar", label: "Kalender verbunden", owner: "kunde", done: ob.customer.calendarConnection?.status === "connected", at: null },
      { key: "whatsapp", label: "WhatsApp-Nummer verbunden", owner: "du", done: ob.customer.whatsAppAccount?.status === "connected", at: null },
    );
  }
  items.push(
    { key: "website", label: "Pflichtangaben (Impressum) geprüft", owner: "du", done: !!ob.websiteCheckedAt, at: ob.websiteCheckedAt, manual: "website" },
    { key: "campaign", label: "Kampagne und Leadformular angelegt", owner: "du", done: !!ob.campaignReadyAt, at: ob.campaignReadyAt, manual: "campaign" },
    { key: "testLead", label: "Testlead durchgespielt", owner: "du", done: !!ob.testLeadAt, at: ob.testLeadAt, manual: "testLead" },
    { key: "live", label: "Live", owner: "du", done: !!ob.liveAt, at: ob.liveAt },
  );
  return items;
}

export function checklistProgress(items: ChecklistItem[]) {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, percent: Math.round((done / items.length) * 100) };
}

/** Fortschritt mehrerer Onboardings (für Übersichten), Schlüssel = customerId. */
export async function onboardingProgressFor(customerIds: string[]) {
  if (customerIds.length === 0) return new Map<string, { percent: number; live: boolean; waitingCustomer: number; waitingYou: number }>();
  const rows = await prisma.onboarding.findMany({
    where: { customerId: { in: customerIds } },
    include: {
      customer: {
        include: {
          users: { where: { role: "BUYER" }, select: { email: true, lastLoginAt: true } },
          calendarConnection: { select: { status: true } },
          whatsAppAccount: { select: { status: true } },
        },
      },
    },
  });
  const offers = await prisma.offer.findMany({
    where: { id: { in: rows.map((r) => r.offerId).filter(Boolean) as string[] } },
    select: { id: true, paymentStatus: true, paidAt: true },
  });
  const map = new Map<string, { percent: number; live: boolean; waitingCustomer: number; waitingYou: number }>();
  for (const r of rows) {
    const items = onboardingChecklist(r, offers.find((o) => o.id === r.offerId) ?? null);
    const open = items.filter((i) => !i.done);
    map.set(r.customerId, {
      percent: checklistProgress(items).percent,
      live: !!r.liveAt,
      waitingCustomer: open.filter((i) => i.owner === "kunde").length,
      waitingYou: open.filter((i) => i.owner === "du").length,
    });
  }
  return map;
}

/** Offene Schritte, die der Kunde selbst erledigen muss (0 = kein Onboarding bzw. fertig). */
export async function customerSetupOpenCount(customerId: string): Promise<number> {
  const ob = await loadOnboarding({ customerId });
  if (!ob || ob.liveAt || ob.status === "cancelled") return 0;
  const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { paymentStatus: true, paidAt: true } }) : null;
  const open = onboardingChecklist(ob, offer).filter((i) => !i.done && i.owner === "kunde" && i.key !== "login").length;
  return Math.max(open, 0);
}

/** Mail „Ihre Kampagne ist live“ – beim Live-Schalten im Admin. */
export async function sendGoLiveMail(onboardingId: string) {
  const ob = await prisma.onboarding.findUnique({
    where: { id: onboardingId },
    include: { customer: { include: { users: { where: { role: "BUYER" }, select: { email: true } } } } },
  });
  if (!ob) return;
  const to = ob.customer.users.map((u) => u.email);
  if (to.length === 0) return;
  const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { contactName: true } }) : null;
  const software = ob.package !== "service";
  const q = (ob.questionnaire ?? {}) as { leadEmails?: string[] };
  const res = await sendCustomerMail({
    to,
    subject: "Ihre Kampagne ist live 🚀",
    greeting: offer?.contactName ? `Hallo ${offer.contactName},` : "Hallo,",
    paragraphs: [
      "alles ist eingerichtet – Ihre Anzeigen laufen ab sofort. Die ersten Leads kommen in der Regel innerhalb von 1–3 Tagen.",
      software
        ? "Neue Leads bekommen innerhalb weniger Minuten eine WhatsApp-Nachricht von Ihrem digitalen Assistenten und können direkt einen Termin in Ihrem Kalender buchen. Im Kundenbereich sehen Sie unter „Heute“, wen Sie anrufen sollten."
        : `Jeder neue Lead kommt sofort per E-Mail${q.leadEmails?.length ? ` an ${q.leadEmails.join(", ")}` : ""} und steht im Kundenbereich unter „Leads“. Am besten rufen Sie innerhalb der ersten Minuten an.`,
      "Tipp: Installieren Sie den Kundenbereich auf Ihrem Handy (im Browser „Zum Startbildschirm hinzufügen“) – dann haben Sie neue Leads immer dabei.",
    ],
    button: { label: "Zum Kundenbereich", url: `${getAppUrl()}/buyer` },
  });
  if (!res.ok) reportError(new Error(res.error), "onboarding-golive-mail", { onboarding: ob.id });
}
