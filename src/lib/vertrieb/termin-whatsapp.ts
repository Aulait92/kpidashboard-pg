// WhatsApp für Vertriebstermine von der Support-Nummer (Ole, 15./16.11.2026), Sie-Form:
// Bestätigung nach der Buchung (Calendly und eigene Buchungsseite /termin) sowie Erinnerung
// 24 Stunden und 1 Stunde vorher (runSalesWhatsAppReminders). Läuft erst, wenn die Support-Nummer
// verbunden und die jeweilige Vorlage von Meta freigegeben ist; Einreichen und Freigabe-Abgleich im
// WhatsApp-Cron (syncSupportTemplates).

import { decryptSecret } from "@/lib/encryption";
import { reportError } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { createTemplate, listTemplates, sendTemplate, type CreateTemplateInput } from "@/lib/whatsapp/dialog360";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { findRemote, mapRemoteStatus, metaTemplateProblems } from "@/lib/whatsapp/template-plan";
import { renderTemplate } from "@/lib/whatsapp/templates";
import {
  ZAHLUNG_TEMPLATE_BODY_DU,
  ZAHLUNG_TEMPLATE_BODY_SIE,
  ZAHLUNG_TEMPLATE_DU,
  ZAHLUNG_TEMPLATE_EXAMPLES,
  ZAHLUNG_TEMPLATE_PURPOSE,
  ZAHLUNG_TEMPLATE_SIE,
} from "@/lib/angebot-zahlungserinnerung";

export const TERMIN_TEMPLATE_NAME = "pg_vertrieb_termin_v1";
export const TERMIN_TEMPLATE_PURPOSE = "vertrieb_termin";
const LANGUAGE = "de";

export const TERMIN_TEMPLATE_BODY =
  "Guten Tag {{1}}, vielen Dank für Ihre Terminbuchung bei performancegrowth. Ihr Termin: {{2}} um {{3}} Uhr, {{4}}. " +
  "Zum Verschieben oder Absagen nutzen Sie bitte diesen Link: {{5}} Bei Fragen antworten Sie einfach auf diese Nachricht. " +
  "Viele Grüße, Ihr Team von performancegrowth";

export const TERMIN_TEMPLATE_EXAMPLES = [
  "Max Mustermann",
  "Dienstag, 18. November",
  "14:30",
  "per Video, den Link finden Sie in Ihrer Bestätigungsmail",
  "https://calendly.com/reschedulings/abc",
];

// Erinnerungen (Ole, 16.11.2026): 24 Stunden und 1 Stunde vorher, für die eigene Buchungsseite und Calendly.
export const ERINNERUNG_TEMPLATE_NAME = "pg_vertrieb_erinnerung_v1";
export const ERINNERUNG_TEMPLATE_BODY =
  "Guten Tag {{1}}, kurze Erinnerung an Ihren Termin mit performancegrowth: {{2}} um {{3}} Uhr, {{4}}. " +
  "Zum Verschieben oder Absagen nutzen Sie bitte diesen Link: {{5}} Viele Grüße, Ihr Team von performancegrowth";
export const ERINNERUNG_TEMPLATE_EXAMPLES = TERMIN_TEMPLATE_EXAMPLES;

export const GLEICH_TEMPLATE_NAME = "pg_vertrieb_gleich_v1";
export const GLEICH_TEMPLATE_BODY =
  "Guten Tag {{1}}, in einer Stunde beginnt Ihr Termin mit performancegrowth: heute um {{2}} Uhr, {{3}}. " +
  "Falls etwas dazwischenkommt, verschieben Sie den Termin bitte hier: {{4}} Viele Grüße, Ihr Team von performancegrowth";
export const GLEICH_TEMPLATE_EXAMPLES = ["Max Mustermann", "14:30", "per Video: https://meet.google.com/abc-defg-hij", "https://app.performancegrowth.de/termin/verwalten/abc"];

type SupportTemplate = { name: string; body: string; examples: string[]; purpose: string };
/** Alle Vorlagen der Support-Nummer für Vertriebstermine (Einreichung im WhatsApp-Cron). */
export const SUPPORT_TEMPLATES: SupportTemplate[] = [
  { name: TERMIN_TEMPLATE_NAME, body: TERMIN_TEMPLATE_BODY, examples: TERMIN_TEMPLATE_EXAMPLES, purpose: TERMIN_TEMPLATE_PURPOSE },
  { name: ERINNERUNG_TEMPLATE_NAME, body: ERINNERUNG_TEMPLATE_BODY, examples: ERINNERUNG_TEMPLATE_EXAMPLES, purpose: "vertrieb_erinnerung" },
  { name: GLEICH_TEMPLATE_NAME, body: GLEICH_TEMPLATE_BODY, examples: GLEICH_TEMPLATE_EXAMPLES, purpose: "vertrieb_gleich" },
  // Zahlungserinnerung zum Angebot (lib/angebot-zahlungserinnerung.ts), Sie und Du
  { name: ZAHLUNG_TEMPLATE_SIE, body: ZAHLUNG_TEMPLATE_BODY_SIE, examples: ZAHLUNG_TEMPLATE_EXAMPLES, purpose: ZAHLUNG_TEMPLATE_PURPOSE },
  { name: ZAHLUNG_TEMPLATE_DU, body: ZAHLUNG_TEMPLATE_BODY_DU, examples: ZAHLUNG_TEMPLATE_EXAMPLES, purpose: ZAHLUNG_TEMPLATE_PURPOSE },
];

export function supportTemplateRequest(t: SupportTemplate): CreateTemplateInput {
  return {
    name: t.name,
    category: "UTILITY",
    language: LANGUAGE,
    components: [{ type: "BODY", text: t.body, example: { body_text: [t.examples] } }],
  };
}

export function terminTemplateRequest(): CreateTemplateInput {
  return {
    name: TERMIN_TEMPLATE_NAME,
    category: "UTILITY",
    language: LANGUAGE,
    components: [{ type: "BODY", text: TERMIN_TEMPLATE_BODY, example: { body_text: [TERMIN_TEMPLATE_EXAMPLES] } }],
  };
}

const TZ = "Europe/Berlin";

/** Art des Termins aus dem Calendly-Ort (Video, Telefon, vor Ort). Ohne Zeilenumbrüche (Meta). */
export function terminArt(loc: { type?: string | null; location?: string | null; join_url?: string | null } | null | undefined): string {
  const type = (loc?.type ?? "").toLowerCase();
  if (type === "outbound_call") return "telefonisch, wir rufen Sie an";
  if (type === "inbound_call") return loc?.location ? `telefonisch unter ${loc.location}` : "telefonisch";
  if (type === "physical" || type === "in_person_meeting") return loc?.location ? `vor Ort: ${loc.location}` : "vor Ort";
  if (/zoom|google|teams|webex|conference|video|gotomeeting/.test(type) || loc?.join_url) {
    return loc?.join_url ? `per Video: ${loc.join_url}` : "per Video, den Link finden Sie in Ihrer Bestätigungsmail";
  }
  if (loc?.location) return loc.location;
  return "die Details finden Sie in Ihrer Bestätigungsmail";
}

/** Meta lehnt Parameter mit Zeilenumbruch, Tab oder mehr als 4 Leerzeichen ab. */
const clean = (v: string) => v.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim() || "-";

export function terminParams(opts: {
  name: string | null;
  startAt: Date;
  loc: Parameters<typeof terminArt>[0];
  rescheduleUrl: string | null;
}): string[] {
  const date = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(opts.startAt);
  const time = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(opts.startAt);
  return [
    clean(opts.name?.trim() || "und herzlich willkommen"),
    clean(date),
    clean(time),
    clean(terminArt(opts.loc)),
    clean(opts.rescheduleUrl || "über den Link in Ihrer Bestätigungsmail"),
  ].map((v) => v.slice(0, 300));
}

/** Telefonnummer aus Calendly: SMS-Erinnerungsnummer, dann Fragen (Telefon/Handy/WhatsApp), dann Kontakt. */
export function bookingPhone(
  inv: { text_reminder_number?: string | null; questions_and_answers?: { question: string; answer: string }[] },
  contactPhone: string | null,
): string | null {
  const fromQa = (inv.questions_and_answers ?? []).find((qa) => /telefon|handy|mobil|whatsapp|phone|rufnummer/i.test(qa.question) && /\d{5,}/.test(qa.answer.replace(/\D/g, "")))?.answer;
  for (const raw of [inv.text_reminder_number, fromQa, contactPhone]) {
    const p = raw ? normalizePhone(raw) : null;
    if (p) return p;
  }
  return null;
}

type SupportAccount = { id: string; apiKeyEnc: string };

async function supportAccount(): Promise<SupportAccount | null> {
  const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId: SUPPORT_CUSTOMER_ID }, select: { id: true, status: true, apiKeyEnc: true } });
  return acc?.status === "connected" && acc.apiKeyEnc ? { id: acc.id, apiKeyEnc: acc.apiKeyEnc } : null;
}

async function templateApproved(name: string): Promise<boolean> {
  const tpl = await prisma.messageTemplate.findUnique({
    where: { customerId_name_language: { customerId: SUPPORT_CUSTOMER_ID, name, language: LANGUAGE } },
    select: { status: true },
  });
  return tpl?.status === "approved";
}

type SendOutcome = "sent" | "no_account" | "no_template" | "opted_out";

/**
 * Vorlage von der Support-Nummer an einen Vertriebskontakt senden und im Support-Chat sowie im
 * Verlauf des Kontakts vermerken. Wirft bei API-Fehlern.
 */
async function sendSupportTemplate(opts: {
  contactId: string;
  phone: string;
  name: string | null;
  template: { name: string; body: string };
  params: string[];
  activity: string;
  now: Date;
}): Promise<SendOutcome> {
  const acc = await supportAccount();
  if (!acc) return "no_account";
  if (!(await templateApproved(opts.template.name))) return "no_template";
  // „STOPP“ geschrieben: keine Nachrichten mehr an diese Nummer (lib/whatsapp/stopp.ts)
  const prior = await prisma.conversation.findUnique({
    where: { customerId_contactPhone: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: opts.phone } },
    select: { optedOutAt: true },
  });
  if (prior?.optedOutAt) return "opted_out";
  const apiKey = decryptSecret(acc.apiKeyEnc);
  const res = await sendTemplate(apiKey, opts.phone, opts.template.name, LANGUAGE, [{ type: "body", parameters: opts.params.map((text) => ({ type: "text", text })) }]);
  const conv = await prisma.conversation.upsert({
    where: { customerId_contactPhone: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: opts.phone } },
    create: {
      customerId: SUPPORT_CUSTOMER_ID,
      whatsAppAccountId: acc.id,
      contactPhone: opts.phone,
      contactName: opts.name,
      botActive: false,
      status: "open",
      lastMessageAt: opts.now,
      salesContactId: opts.contactId,
      contactMatchedAt: opts.now,
    },
    update: { lastMessageAt: opts.now },
    select: { id: true, contactLinkManual: true, salesContactId: true, linkedCustomerId: true },
  });
  if (!conv.contactLinkManual && !conv.salesContactId && !conv.linkedCustomerId) {
    await prisma.conversation.update({ where: { id: conv.id }, data: { salesContactId: opts.contactId, contactMatchedAt: opts.now } });
  }
  await prisma.message.create({
    data: {
      conversationId: conv.id,
      direction: "outbound",
      kind: "template",
      body: renderTemplate(opts.template.body, opts.params),
      waMessageId: res.messageId,
      status: "sent",
      sentBy: "system",
      pricingCategory: "utility",
    },
  });
  await prisma.salesActivity.create({ data: { contactId: opts.contactId, type: "TERMIN", outcome: opts.activity, note: null } }).catch(() => {});
  return "sent";
}

/**
 * Bestätigung für einen neu gebuchten Vertriebstermin senden und am Termin vermerken.
 * Wirft nie; Ergebnis steht in SalesMeeting.waConfirmStatus.
 */
export async function sendTerminConfirmation(
  meetingId: string,
  inv: { text_reminder_number?: string | null; questions_and_answers?: { question: string; answer: string }[]; name?: string | null; reschedule_url?: string | null },
  loc: Parameters<typeof terminArt>[0],
  now = new Date(),
): Promise<string> {
  const mark = async (status: string, error: string | null = null) => {
    await prisma.salesMeeting.update({ where: { id: meetingId }, data: { waConfirmStatus: status, waConfirmAt: now, waConfirmError: error?.slice(0, 300) ?? null } }).catch(() => {});
    return status;
  };
  try {
    const m = await prisma.salesMeeting.findUnique({
      where: { id: meetingId },
      select: { id: true, startAt: true, waConfirmStatus: true, contactId: true, contact: { select: { phone: true, firstName: true, lastName: true, name: true } } },
    });
    if (!m) return "missing";
    if (m.waConfirmStatus === "sent") return "sent";
    if (m.startAt.getTime() <= now.getTime()) return await mark("past");
    const phone = bookingPhone(inv, m.contact.phone);
    if (!phone) return await mark("no_phone");
    // Nummer am Kontakt merken, damit Support-Chats ihn erkennen
    if (!m.contact.phone) await prisma.salesContact.update({ where: { id: m.contactId }, data: { phone: `+${phone}` } }).catch(() => {});
    const name = inv.name?.trim() || [m.contact.firstName, m.contact.lastName].filter(Boolean).join(" ") || null;
    const params = terminParams({ name, startAt: m.startAt, loc, rescheduleUrl: inv.reschedule_url ?? null });
    const out = await sendSupportTemplate({
      contactId: m.contactId,
      phone,
      name,
      template: { name: TERMIN_TEMPLATE_NAME, body: TERMIN_TEMPLATE_BODY },
      params,
      activity: "Terminbestätigung per WhatsApp gesendet",
      now,
    });
    return await mark(out);
  } catch (err) {
    reportError(err, "vertrieb-termin-whatsapp", { meeting: meetingId });
    return await mark("failed", err instanceof Error ? err.message : String(err));
  }
}

// ─── Erinnerungen 24 Stunden und 1 Stunde vorher ────────────────────────

const HOUR = 60 * 60 * 1000;

/** Ort des Termins für die Erinnerung (Videolink bzw. Art), wie bei der Bestätigung. */
function meetingLoc(m: { joinUrl: string | null; location: string | null }): Parameters<typeof terminArt>[0] {
  if (m.joinUrl) return { type: "video", join_url: m.joinUrl };
  if (m.location && /video/i.test(m.location)) return { type: "video" };
  return m.location ? { type: m.location, location: null } : null;
}

/** Link zum Verschieben: eigene Buchungsseite (Token) oder Calendly. */
function rescheduleLink(m: { manageToken: string | null; rescheduleUrl: string | null }, manageUrl: (token: string) => string): string | null {
  return m.manageToken ? manageUrl(m.manageToken) : m.rescheduleUrl;
}

export type WaReminderResult = { day: number; soon: number; skipped: number; errors: number };

/**
 * WhatsApp-Erinnerungen von der Support-Nummer für geplante Vertriebstermine (eigene Buchungsseite und
 * Calendly). 24 Stunden vorher nur, wenn mehr als 26 Stunden im Voraus gebucht; 1 Stunde vorher nur, wenn
 * mindestens 3 Stunden im Voraus gebucht. Jede Art höchstens einmal je Termin (waReminderAt, waSoonAt).
 * Solange die Nummer nicht verbunden bzw. die Vorlage nicht freigegeben ist, wird nichts gesendet
 * und nichts markiert.
 */
export async function runSalesWhatsAppReminders(now = new Date(), manageUrl: (token: string) => string): Promise<WaReminderResult> {
  const result: WaReminderResult = { day: 0, soon: 0, skipped: 0, errors: 0 };
  if (!(await supportAccount())) return result;
  const kinds = [
    { field: "waReminderAt", template: { name: ERINNERUNG_TEMPLATE_NAME, body: ERINNERUNG_TEMPLATE_BODY }, from: 2 * HOUR, to: 24 * HOUR, minLead: 26 * HOUR, key: "day" },
    { field: "waSoonAt", template: { name: GLEICH_TEMPLATE_NAME, body: GLEICH_TEMPLATE_BODY }, from: 10 * 60 * 1000, to: HOUR, minLead: 3 * HOUR, key: "soon" },
  ] as const;
  for (const k of kinds) {
    if (!(await templateApproved(k.template.name))) continue;
    const due = await prisma.salesMeeting.findMany({
      where: { status: "GEPLANT", [k.field]: null, startAt: { gt: new Date(now.getTime() + k.from), lte: new Date(now.getTime() + k.to) } },
      select: {
        id: true,
        startAt: true,
        createdAt: true,
        joinUrl: true,
        location: true,
        manageToken: true,
        rescheduleUrl: true,
        inviteeName: true,
        inviteePhone: true,
        contactId: true,
        contact: { select: { phone: true, firstName: true, lastName: true } },
      },
      orderBy: { startAt: "asc" },
      take: 100,
    });
    for (const m of due) {
      // Markierung zuerst: parallel laufende Crons senden nie doppelt
      const claimed = await prisma.salesMeeting.updateMany({ where: { id: m.id, [k.field]: null }, data: { [k.field]: now } });
      if (!claimed.count) continue;
      if (m.startAt.getTime() - m.createdAt.getTime() < k.minLead) {
        result.skipped++;
        continue;
      }
      const phone = [m.inviteePhone, m.contact.phone].map((p) => (p ? normalizePhone(p) : null)).find(Boolean) ?? null;
      if (!phone) {
        result.skipped++;
        continue;
      }
      const name = m.inviteeName?.trim() || [m.contact.firstName, m.contact.lastName].filter(Boolean).join(" ") || null;
      const base = terminParams({ name, startAt: m.startAt, loc: meetingLoc(m), rescheduleUrl: rescheduleLink(m, manageUrl) });
      // [Name, Datum, Uhrzeit, Art, Link] bzw. kurz vorher [Name, Uhrzeit, Art, Link]
      const params = k.key === "day" ? base : [base[0], base[2], base[3], base[4]];
      try {
        const out = await sendSupportTemplate({
          contactId: m.contactId,
          phone,
          name,
          template: k.template,
          params,
          activity: k.key === "day" ? "Terminerinnerung (24 Stunden) per WhatsApp gesendet" : "Terminerinnerung (1 Stunde) per WhatsApp gesendet",
          now,
        });
        if (out === "sent") result[k.key]++;
        else result.skipped++;
      } catch (err) {
        result.errors++;
        reportError(err, "vertrieb-termin-erinnerung", { meeting: m.id, kind: k.key });
      }
    }
  }
  return result;
}

// ─── Vorlagen einreichen und Freigabe nachziehen ─────────────────────────

const CHECK_PENDING_MS = 30 * 60 * 1000;
const CHECK_IDLE_MS = 6 * 60 * 60 * 1000;

const LABEL: Record<string, string> = {
  [TERMIN_TEMPLATE_PURPOSE]: "Terminbestätigung",
  vertrieb_erinnerung: "Terminerinnerung",
  vertrieb_gleich: "Termin gleich",
  [ZAHLUNG_TEMPLATE_PURPOSE]: "Zahlungserinnerung",
};

/**
 * Im WhatsApp-Cron: Vorlagen der Support-Nummer einreichen bzw. Status abgleichen (gedrosselt).
 * `status` = Stand der Terminbestätigung, `statuses` = Stand je Vorlage.
 */
export async function syncSupportTemplates(now = new Date(), opts: { force?: boolean } = {}): Promise<{ status: string; statuses: Record<string, string> } | null> {
  const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId: SUPPORT_CUSTOMER_ID }, select: { status: true, apiKeyEnc: true, templatesCheckedAt: true } });
  if (acc?.status !== "connected" || !acc.apiKeyEnc) return null;
  const locals = await prisma.messageTemplate.findMany({
    where: { customerId: SUPPORT_CUSTOMER_ID, language: LANGUAGE, name: { in: SUPPORT_TEMPLATES.map((t) => t.name) } },
    select: { name: true, status: true },
  });
  const localStatus = new Map(locals.map((l) => [l.name, l.status]));
  const allApproved = SUPPORT_TEMPLATES.every((t) => localStatus.get(t.name) === "approved");
  const age = acc.templatesCheckedAt ? now.getTime() - acc.templatesCheckedAt.getTime() : Infinity;
  if (!opts.force && age < (allApproved ? CHECK_IDLE_MS : CHECK_PENDING_MS)) return null;
  for (const t of SUPPORT_TEMPLATES) {
    const problems = metaTemplateProblems(t.body, t.examples);
    if (problems.length) throw new Error(`Vorlage ${t.name} ungültig: ${problems.join(", ")}`);
  }
  const apiKey = decryptSecret(acc.apiKeyEnc);
  const remoteList = await listTemplates(apiKey);
  const statuses: Record<string, string> = {};
  for (const t of SUPPORT_TEMPLATES) {
    let remote = findRemote(remoteList, t.name);
    let submittedAt: Date | null = null;
    if (!remote) {
      remote = await createTemplate(apiKey, supportTemplateRequest(t));
      submittedAt = now;
    }
    const status = mapRemoteStatus(remote.status);
    statuses[t.name] = status;
    await prisma.messageTemplate.upsert({
      where: { customerId_name_language: { customerId: SUPPORT_CUSTOMER_ID, name: t.name, language: LANGUAGE } },
      create: {
        customerId: SUPPORT_CUSTOMER_ID,
        name: t.name,
        language: LANGUAGE,
        purpose: t.purpose,
        category: "utility",
        status,
        body: t.body,
        auto: true,
        submittedAt,
        rejectionReason: status === "rejected" ? remote.rejectedReason : null,
      },
      update: { status, rejectionReason: status === "rejected" ? remote.rejectedReason : null, ...(submittedAt ? { submittedAt } : {}) },
    });
    if (status === "rejected" && localStatus.get(t.name) !== "rejected") {
      const { sendToAdmins } = await import("@/lib/push");
      await sendToAdmins({
        title: `WhatsApp-Vorlage ${LABEL[t.purpose] ?? t.name} abgelehnt`,
        body: `${t.name}: ${(remote.rejectedReason ?? "Grund unbekannt").slice(0, 100)}`,
        url: "/admin/whatsapp/settings",
        tag: `tpl:support-${t.name}`,
      }).catch(() => {});
    }
  }
  await prisma.whatsAppAccount.update({ where: { customerId: SUPPORT_CUSTOMER_ID }, data: { templatesCheckedAt: now } });
  return { status: statuses[TERMIN_TEMPLATE_NAME] ?? "pending", statuses };
}
