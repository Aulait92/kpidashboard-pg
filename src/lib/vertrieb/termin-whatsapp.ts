// WhatsApp-Terminbestätigung für Vertriebstermine (Ole, 15.11.2026): Bucht ein Interessent über Calendly
// einen Termin, schickt die App von der Support-Nummer eine Bestätigung (Sie-Form). Nur Bestätigung,
// die Erinnerung kommt von Calendly. Läuft erst, wenn die Support-Nummer verbunden und die Vorlage von
// Meta freigegeben ist; Einreichen und Freigabe-Abgleich im WhatsApp-Cron (syncSupportTemplates).

import { decryptSecret } from "@/lib/encryption";
import { reportError } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { createTemplate, listTemplates, sendTemplate, type CreateTemplateInput } from "@/lib/whatsapp/dialog360";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { findRemote, mapRemoteStatus, metaTemplateProblems } from "@/lib/whatsapp/template-plan";
import { renderTemplate } from "@/lib/whatsapp/templates";

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
    const acc = await supportAccount();
    if (!acc) return await mark("no_account");
    const tpl = await prisma.messageTemplate.findUnique({
      where: { customerId_name_language: { customerId: SUPPORT_CUSTOMER_ID, name: TERMIN_TEMPLATE_NAME, language: LANGUAGE } },
      select: { status: true },
    });
    if (tpl?.status !== "approved") return await mark("no_template");
    // „STOPP“ geschrieben: keine Nachrichten mehr an diese Nummer (lib/whatsapp/stopp.ts)
    const prior = await prisma.conversation.findUnique({ where: { customerId_contactPhone: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: phone } }, select: { optedOutAt: true } });
    if (prior?.optedOutAt) return await mark("opted_out");

    const name = inv.name?.trim() || [m.contact.firstName, m.contact.lastName].filter(Boolean).join(" ") || null;
    const params = terminParams({ name, startAt: m.startAt, loc, rescheduleUrl: inv.reschedule_url ?? null });
    const apiKey = decryptSecret(acc.apiKeyEnc);
    const res = await sendTemplate(apiKey, phone, TERMIN_TEMPLATE_NAME, LANGUAGE, [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]);

    const conv = await prisma.conversation.upsert({
      where: { customerId_contactPhone: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: phone } },
      create: {
        customerId: SUPPORT_CUSTOMER_ID,
        whatsAppAccountId: acc.id,
        contactPhone: phone,
        contactName: name,
        botActive: false,
        status: "open",
        lastMessageAt: now,
        salesContactId: m.contactId,
        contactMatchedAt: now,
      },
      update: { lastMessageAt: now },
      select: { id: true, contactLinkManual: true, salesContactId: true, linkedCustomerId: true },
    });
    if (!conv.contactLinkManual && !conv.salesContactId && !conv.linkedCustomerId) {
      await prisma.conversation.update({ where: { id: conv.id }, data: { salesContactId: m.contactId, contactMatchedAt: now } });
    }
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: "outbound",
        kind: "template",
        body: renderTemplate(TERMIN_TEMPLATE_BODY, params),
        waMessageId: res.messageId,
        status: "sent",
        sentBy: "system",
        pricingCategory: "utility",
      },
    });
    await prisma.salesActivity.create({ data: { contactId: m.contactId, type: "TERMIN", outcome: "Terminbestätigung per WhatsApp gesendet", note: null } }).catch(() => {});
    return await mark("sent");
  } catch (err) {
    reportError(err, "vertrieb-termin-whatsapp", { meeting: meetingId });
    return await mark("failed", err instanceof Error ? err.message : String(err));
  }
}

// ─── Vorlage einreichen und Freigabe nachziehen ─────────────────────────

const CHECK_PENDING_MS = 30 * 60 * 1000;
const CHECK_IDLE_MS = 6 * 60 * 60 * 1000;

/** Im WhatsApp-Cron: Vorlage der Support-Nummer einreichen bzw. Status abgleichen (gedrosselt). */
export async function syncSupportTemplates(now = new Date(), opts: { force?: boolean } = {}): Promise<{ status: string } | null> {
  const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId: SUPPORT_CUSTOMER_ID }, select: { status: true, apiKeyEnc: true, templatesCheckedAt: true } });
  if (acc?.status !== "connected" || !acc.apiKeyEnc) return null;
  const local = await prisma.messageTemplate.findUnique({
    where: { customerId_name_language: { customerId: SUPPORT_CUSTOMER_ID, name: TERMIN_TEMPLATE_NAME, language: LANGUAGE } },
    select: { status: true },
  });
  const age = acc.templatesCheckedAt ? now.getTime() - acc.templatesCheckedAt.getTime() : Infinity;
  if (!opts.force && age < (local?.status === "approved" ? CHECK_IDLE_MS : CHECK_PENDING_MS)) return null;
  const problems = metaTemplateProblems(TERMIN_TEMPLATE_BODY, TERMIN_TEMPLATE_EXAMPLES);
  if (problems.length) throw new Error(`Vorlage ungültig: ${problems.join(", ")}`);
  const apiKey = decryptSecret(acc.apiKeyEnc);
  const remoteList = await listTemplates(apiKey);
  let remote = findRemote(remoteList, TERMIN_TEMPLATE_NAME);
  let submittedAt: Date | null = null;
  if (!remote) {
    remote = await createTemplate(apiKey, terminTemplateRequest());
    submittedAt = now;
  }
  const status = mapRemoteStatus(remote.status);
  await prisma.messageTemplate.upsert({
    where: { customerId_name_language: { customerId: SUPPORT_CUSTOMER_ID, name: TERMIN_TEMPLATE_NAME, language: LANGUAGE } },
    create: {
      customerId: SUPPORT_CUSTOMER_ID,
      name: TERMIN_TEMPLATE_NAME,
      language: LANGUAGE,
      purpose: TERMIN_TEMPLATE_PURPOSE,
      category: "utility",
      status,
      body: TERMIN_TEMPLATE_BODY,
      auto: true,
      submittedAt,
      rejectionReason: status === "rejected" ? remote.rejectedReason : null,
    },
    update: { status, rejectionReason: status === "rejected" ? remote.rejectedReason : null, ...(submittedAt ? { submittedAt } : {}) },
  });
  await prisma.whatsAppAccount.update({ where: { customerId: SUPPORT_CUSTOMER_ID }, data: { templatesCheckedAt: now } });
  if (status === "rejected" && local?.status !== "rejected") {
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({
      title: "WhatsApp-Vorlage Terminbestätigung abgelehnt",
      body: (remote.rejectedReason ?? "Grund unbekannt").slice(0, 120),
      url: "/admin/whatsapp/settings",
      tag: "tpl:support-termin",
    }).catch(() => {});
  }
  return { status };
}
