// Onboarding-Automatik, läuft im zentralen Cron (alle 5 Minuten) mit.
// Jede Aufgabe ist idempotent (Zeitstempel/Unique-Keys), mehrfaches
// Ausführen schadet also nicht.
//
//  1. Erinnerung an den Kunden, wenn Einrichtungsschritte liegen bleiben
//     (alle 2 Tage, höchstens 3×, nur werktags 9–18 Uhr)
//  2. Push an den Admin, wenn nach 5 Tagen noch Schritte beim Kunden offen sind
//  3. „Nur Betreuung“: neue Leads per E-Mail an den Kunden
//  4. Feedback Tag 7 (Start) und Tag 30 (Monatsbericht) nach Go-live
//  5. Tag 90: Aufgabe „Jahresvertrag anbieten“ (nur ohne Laufzeit)
//  6. Pflichtangaben aus dem Impressum der Agentur-Website lesen

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import type { FormAnswer } from "@/lib/lead-fields";
import { loadOnboarding, onboardingChecklist, sendWelcome } from "@/lib/onboarding";
import { readImpressum } from "@/lib/impressum";
import { customerGreeting } from "@/lib/offer-links";

const DAY = 24 * 60 * 60 * 1000;
const TZ = "Europe/Berlin";

/** Werktags 9–18 Uhr deutscher Zeit – Kundenmails nicht nachts verschicken. */
export function isBusinessHours(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", hour12: false }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return !["Sat", "Sun"].includes(wd) && h >= 9 && h < 18;
}

async function greetingOf(ob: { salesContactId: string | null; offerId: string | null }): Promise<string> {
  const contactName = ob.offerId
    ? ((await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { contactName: true } }))?.contactName ?? null)
    : null;
  return customerGreeting({ salesContactId: ob.salesContactId, contactName });
}

async function customerEmails(customerId: string): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { customerId, role: "BUYER" }, select: { email: true } });
  return users.map((u) => u.email);
}

// ─── 1 + 2: Erinnerungen ───────────────────────────────────────────────

async function remindCustomers(now: Date) {
  const running = await prisma.onboarding.findMany({
    where: { status: "running", liveAt: null, createdAt: { gt: new Date(now.getTime() - 21 * DAY) } },
    select: { id: true, customerId: true },
  });
  let reminded = 0;
  let stale = 0;
  for (const { id, customerId } of running) {
    const ob = await loadOnboarding({ customerId });
    if (!ob) continue;
    const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { paymentStatus: true, paidAt: true } }) : null;
    const open = onboardingChecklist(ob, offer).filter((i) => !i.done && i.owner === "kunde" && i.key !== "payment");
    if (open.length === 0) continue;

    // Admin-Push nach 5 Tagen (einmalig).
    if (!ob.staleNotifiedAt && now.getTime() - ob.createdAt.getTime() > 5 * DAY) {
      await sendToAdmins({
        title: `⏳ Onboarding hängt: ${ob.customer.name}`,
        body: `Offen beim Kunden: ${open.map((i) => i.label).join(", ")}`,
        url: ob.salesContactId ? `/admin/vertrieb/kontakte/${ob.salesContactId}` : "/admin/vertrieb/kunden",
        tag: `onboarding-stale:${ob.id}`,
      }).catch((err) => reportError(err, "onboarding-stale-push"));
      await prisma.onboarding.update({ where: { id }, data: { staleNotifiedAt: now } });
      stale++;
    }

    // Kunden-Erinnerung alle 2 Tage, höchstens 3× (bis Tag ~7).
    const last = ob.lastReminderAt ?? ob.welcomeSentAt ?? ob.createdAt;
    if (now.getTime() - last.getTime() < 2 * DAY || now.getTime() - ob.createdAt.getTime() > 7.5 * DAY) continue;
    const notLoggedIn = open.some((i) => i.key === "login");
    if (notLoggedIn) {
      // Noch nie eingeloggt → Willkommens-Mail mit frischem Einladungslink erneut.
      await sendWelcome(ob.id);
    } else {
      const to = ob.customer.users.map((u) => u.email);
      if (to.length === 0) continue;
      const res = await sendCustomerMail({
        to,
        subject: "Kurze Erinnerung: Ihre Einrichtung bei performancegrowth",
        greeting: await greetingOf(ob),
        paragraphs: [
          "damit Ihre Kampagne pünktlich starten kann, fehlen noch ein paar Minuten Einrichtung von Ihrer Seite:",
        ],
        list: open.map((i) => i.label),
        button: { label: "Zur Einrichtung", url: `${getAppUrl()}/buyer/einrichtung` },
        html: `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#5b5e68">Klappt etwas nicht? Antworten Sie einfach auf diese Mail oder rufen Sie an (+49 151 52418846), dann erledigen wir es gemeinsam.</p>`,
      });
      if (!res.ok) reportError(new Error(res.error), "onboarding-reminder", { onboarding: ob.id });
    }
    await prisma.onboarding.update({ where: { id }, data: { lastReminderAt: now } });
    reminded++;
  }
  return { reminded, stale };
}

// ─── 3: Leads per E-Mail („Nur Betreuung“) ──────────────────────────────

async function emailLeads(now: Date) {
  const onboardings = await prisma.onboarding.findMany({
    where: { package: "service", status: { not: "cancelled" } },
    select: { customerId: true, createdAt: true, questionnaire: true, customer: { select: { name: true } } },
  });
  let sent = 0;
  for (const ob of onboardings) {
    const q = (ob.questionnaire ?? {}) as { leadEmails?: string[]; callbackBy?: string };
    const to = q.leadEmails?.length ? q.leadEmails : await customerEmails(ob.customerId);
    if (to.length === 0) continue;
    // Nur Leads ab Onboarding-Start und höchstens 2 Tage alt (keine Altlasten).
    const since = new Date(Math.max(ob.createdAt.getTime(), now.getTime() - 2 * DAY));
    const leads = await prisma.lead.findMany({
      where: { customerId: ob.customerId, emailedAt: null, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    for (const lead of leads) {
      // formData ist bereits der Label/Wert-Snapshot aus lib/lead-fields.
      const answers = (Array.isArray(lead.formData) ? (lead.formData as FormAnswer[]) : []).filter((a) => a?.label && a?.value);
      const res = await sendCustomerMail({
        to,
        subject: `Neuer Lead: ${lead.name ?? "Interessent"}${lead.phone ? ` · +${lead.phone.replace(/^\+/, "")}` : ""}`,
        greeting: "Hallo,",
        paragraphs: [
          "es gibt einen neuen Interessenten. Am besten rufen Sie gleich an: In den ersten Minuten ist die Chance am höchsten.",
        ],
        list: [
          `Name: ${lead.name ?? "nicht angegeben"}`,
          `Telefon: ${lead.phone ? `+${lead.phone.replace(/^\+/, "")}` : "nicht angegeben"}`,
          `E-Mail: ${lead.email ?? "nicht angegeben"}`,
          ...answers.map((a) => `${a.label}: ${a.value}`),
        ],
        button: { label: "Lead im Kundenbereich öffnen", url: `${getAppUrl()}/buyer/leads/${lead.id}` },
        replyTo: null,
        signature: "performancegrowth",
      });
      if (!res.ok) {
        reportError(new Error(res.error), "lead-email", { lead: lead.id });
        break; // Versand gestört → nächster Lauf versucht es erneut
      }
      await prisma.lead.update({ where: { id: lead.id }, data: { emailedAt: new Date() } });
      sent++;
    }
  }
  return { sent };
}

// ─── 4: Feedback Tag 7 / Tag 30 ────────────────────────────────────────

const SMILEYS = ["😞", "🙁", "😐", "🙂", "😃"];

function smileyHtml(url: (score: number) => string) {
  return `<p style="margin:8px 0 20px;font-size:32px;line-height:1">${SMILEYS.map(
    (s, i) => `<a href="${url(i + 1)}" style="text-decoration:none;margin-right:10px" title="${i + 1} von 5">${s}</a>`,
  ).join("")}</p>`;
}

async function monthlyNumbers(customerId: string, plan: string, now: Date) {
  const since = new Date(now.getTime() - 30 * DAY);
  const [leads, appointments, spend] = await Promise.all([
    prisma.lead.count({ where: { customerId, createdAt: { gte: since } } }),
    plan === "service" ? Promise.resolve(null) : prisma.appointment.count({ where: { customerId, createdAt: { gte: since }, status: { not: "cancelled" } } }),
    prisma.customerAdSpend.aggregate({ where: { customerId, date: { gte: since } }, _sum: { amount: true } }),
  ]);
  const spent = Number(spend._sum.amount ?? 0);
  return { leads, appointments, spent };
}

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

async function sendFeedback(now: Date) {
  const live = await prisma.onboarding.findMany({
    where: { liveAt: { not: null, lte: new Date(now.getTime() - 7 * DAY), gt: new Date(now.getTime() - 60 * DAY) } },
    select: { customerId: true, liveAt: true, package: true, offerId: true, salesContactId: true, customer: { select: { plan: true, feedback: { select: { kind: true } } } } },
  });
  let sent = 0;
  for (const ob of live) {
    const age = now.getTime() - ob.liveAt!.getTime();
    const kinds = new Set(ob.customer.feedback.map((f) => f.kind));
    const kind = age >= 30 * DAY && !kinds.has("day30") ? "day30" : !kinds.has("day7") && age < 30 * DAY ? "day7" : null;
    if (!kind) continue;
    const to = await customerEmails(ob.customerId);
    if (to.length === 0) continue;
    const token = crypto.randomBytes(18).toString("base64url");
    const url = (s: number) => `${getAppUrl()}/feedback/${token}?s=${s}`;
    const greeting = await greetingOf(ob);
    let res;
    if (kind === "day7") {
      res = await sendCustomerMail({
        to,
        subject: "Wie lief Ihr Start mit performancegrowth?",
        greeting,
        paragraphs: ["Ihre Kampagne läuft jetzt seit einer Woche. Wie zufrieden sind Sie bisher? Ein Klick genügt:"],
        html: smileyHtml(url),
      });
    } else {
      const n = await monthlyNumbers(ob.customerId, ob.customer.plan, now);
      const list = [
        `Leads: ${n.leads}`,
        ...(n.appointments != null ? [`Gebuchte Termine: ${n.appointments}`] : []),
        ...(n.spent > 0 ? [`Werbebudget: ${eur(n.spent)}`] : []),
        ...(n.spent > 0 && n.leads > 0 ? [`Kosten pro Lead: ${eur(n.spent / n.leads)}`] : []),
        ...(n.spent > 0 && n.appointments ? [`Kosten pro Termin: ${eur(n.spent / n.appointments)}`] : []),
      ];
      res = await sendCustomerMail({
        to,
        subject: "Ihr erster Monat mit performancegrowth",
        greeting,
        paragraphs: ["Ihr erster Monat ist um. Hier die Zahlen der letzten 30 Tage:"],
        list,
        html: `<p style="margin:0 0 4px;font-size:15px;line-height:1.6">Wie zufrieden sind Sie insgesamt?</p>${smileyHtml(url)}`,
        button: { label: "Alle Zahlen im Kundenbereich", url: `${getAppUrl()}/buyer${ob.customer.plan === "service" ? "" : "/zahlen"}` },
      });
    }
    if (!res.ok) {
      reportError(new Error(res.error), "feedback-mail", { customer: ob.customerId });
      continue;
    }
    await prisma.customerFeedback.create({ data: { customerId: ob.customerId, kind, token } }).catch(() => {});
    sent++;
  }
  return { sent };
}

// ─── 5: Tag 90 – Jahresvertrag anbieten ────────────────────────────────

async function upsellTasks(now: Date) {
  const due = await prisma.onboarding.findMany({
    where: { liveAt: { lte: new Date(now.getTime() - 90 * DAY) }, upsellTaskAt: null },
    select: { id: true, offerId: true, salesContactId: true },
  });
  let created = 0;
  for (const ob of due) {
    const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { term: true } }) : null;
    if (ob.salesContactId && offer?.term !== "12m") {
      await prisma.salesTask.create({
        data: {
          contactId: ob.salesContactId,
          type: "ANRUF",
          title: "Jahresvertrag anbieten (Preisgarantie + 1 Monat Betreuung geschenkt)",
          dueAt: now,
        },
      });
      created++;
    }
    await prisma.onboarding.update({ where: { id: ob.id }, data: { upsellTaskAt: now } });
  }
  return { created };
}

// ─── 6: Impressum der Agentur-Website ──────────────────────────────────

async function checkWebsites(now: Date) {
  const todo = await prisma.onboarding.findMany({
    where: { websiteInfo: { equals: Prisma.DbNull }, createdAt: { gt: new Date(now.getTime() - 30 * DAY) } },
    select: { id: true, customer: { select: { salesContact: { select: { url: true } } } } },
    take: 3,
  });
  for (const ob of todo) {
    const info = await readImpressum(ob.customer.salesContact?.url);
    await prisma.onboarding.update({ where: { id: ob.id }, data: { websiteInfo: info as object } });
  }
  return { checked: todo.length };
}

export async function runOnboardingCron(now = new Date()) {
  const result: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      result[name] = await fn();
    } catch (err) {
      reportError(err, `onboarding-cron-${name}`);
      result[name] = { error: err instanceof Error ? err.message : String(err) };
    }
  };
  await step("leads", () => emailLeads(now)); // rund um die Uhr
  await step("upsell", () => upsellTasks(now));
  await step("websites", () => checkWebsites(now));
  if (isBusinessHours(now)) {
    await step("reminders", () => remindCustomers(now));
    await step("feedback", () => sendFeedback(now));
  }
  return result;
}
