// Onboarding-Automatik, läuft im zentralen Cron (alle 5 Minuten) mit.
// Jede Aufgabe ist idempotent (Zeitstempel/Unique-Keys), mehrfaches
// Ausführen schadet also nicht.
//
//  1. Erinnerung an den Kunden, wenn Einrichtungsschritte liegen bleiben
//     (Tag 1, 3 und 7, nur werktags 9–18 Uhr) und tägliche Nachprüfung des Meta-Zugriffs
//  2. Push an den Admin, wenn nach 7 Tagen noch Schritte beim Kunden offen sind (dann auch in „Heute“)
//  3. Neue Leads per E-Mail an den Kunden (abschaltbar, Standard: an)
//  4. Feedback Tag 7 (Start) und Tag 30 (Monatsbericht) nach Go-live
//  5. Tag 90: Aufgabe „Jahresvertrag anbieten“ (nur ohne Laufzeit)
//  6. Pflichtangaben aus dem Impressum der Agentur-Website lesen

import { dueFeedbackKind } from "@/lib/nps";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { reportError } from "@/lib/monitoring";
import type { FormAnswer } from "@/lib/lead-fields";
import { readImpressum } from "@/lib/impressum";
import { customerGreeting } from "@/lib/offer-links";
import { runDunningCron, runPauseCron } from "@/lib/pause";
import { recheckOpenMetaAccess, runSetupReminders } from "@/lib/selbst-einrichtung";

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
// Kunden-Erinnerung an Tag 1, 3 und 7 (Mail + Push), am Tag 7 einmal Push an Admins;
// ab Tag 7 steht der Fall in Admin „Heute“ (siehe lib/selbst-einrichtung.ts).

// ─── 3: Leads per E-Mail (alle Onboarding-Kunden, abschaltbar) ───────────

export async function emailLeads(now: Date, onlyCustomerId?: string) {
  const onboardings = await prisma.onboarding.findMany({
    where: {
      status: { not: "cancelled" },
      customer: { leadEmail: true },
      ...(onlyCustomerId ? { customerId: onlyCustomerId } : {}),
    },
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

/** 0–10 als anklickbare Zahlen (E-Mail-tauglich, Tabelle). */
function npsHtml(url: (score: number) => string) {
  const cells = Array.from({ length: 11 }, (_, i) =>
    `<td style="padding:2px"><a href="${url(i)}" style="display:block;width:30px;height:30px;line-height:30px;text-align:center;border:1px solid #CBD5E1;border-radius:6px;color:#0F172A;font-weight:600;text-decoration:none;font-size:14px">${i}</a></td>`,
  ).join("");
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 4px"><tr>${cells}</tr></table><p style="margin:0 0 20px;font-size:12px;color:#64748B">0 = gar nicht wahrscheinlich · 10 = äußerst wahrscheinlich</p>`;
}

const NPS_QUESTION = "Wie wahrscheinlich ist es, dass Sie performancegrowth einem Kollegen weiterempfehlen?";

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
  // Tag 7 (Smileys), Tag 30 und danach alle 90 Tage Weiterempfehlung 0–10 (NPS, Ole 13.11.2026)
  const live = await prisma.onboarding.findMany({
    where: { liveAt: { not: null, lte: new Date(now.getTime() - 7 * DAY) }, status: { not: "cancelled" }, customer: { archived: false, plan: { not: "internal" } } },
    select: { customerId: true, liveAt: true, package: true, offerId: true, salesContactId: true, customer: { select: { plan: true, feedback: { select: { kind: true } } } } },
  });
  let sent = 0;
  for (const ob of live) {
    const kinds = new Set(ob.customer.feedback.map((f) => f.kind));
    const kind = dueFeedbackKind(ob.liveAt!, now, kinds);
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
    } else if (kind !== "day30") {
      res = await sendCustomerMail({
        to,
        subject: "Kurze Frage: Würden Sie uns weiterempfehlen?",
        greeting,
        paragraphs: [`${NPS_QUESTION} Ein Klick genügt, danach können Sie uns noch einen Satz dazu schreiben.`],
        html: npsHtml(url),
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
        html: `<p style="margin:0 0 4px;font-size:15px;line-height:1.6">${NPS_QUESTION}</p>${npsHtml(url)}`,
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
          title: "Jahresvertrag anbieten (Setup gespart, bei Jahreszahlung 2 Monate geschenkt)",
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
  await step("pauses", () => runPauseCron(now)); // Pausen starten/beenden
  await step("leads", () => emailLeads(now)); // rund um die Uhr
  await step("upsell", () => upsellTasks(now));
  await step("websites", () => checkWebsites(now));
  await step("meta", () => recheckOpenMetaAccess(now)); // offene Meta-Freigaben ~täglich nachprüfen
  if (isBusinessHours(now)) {
    await step("reminders", () => runSetupReminders(now));
    await step("feedback", () => sendFeedback(now));
    await step("dunning", () => runDunningCron(now)); // Mails nur zu Geschäftszeiten
  }
  return result;
}
