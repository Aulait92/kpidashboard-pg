// Leads ohne WhatsApp sofort zum Vermittler (Ole, 15.11.2026).
//
// Bisher: Kam die erste Nachricht mit „failed“ zurück (z. B. 131026, Nummer nicht bei WhatsApp), stand das nur an
// der Nachricht. Der Lead blieb auf „gesendet“, der Assistent wartete, und erst nach 24 Stunden stand er als „Keine
// Reaktion auf WhatsApp“ auf der Rückrufliste. Jetzt (aus dem Status-Webhook, lib/whatsapp/gateway.ts applyStatus):
//   1. Fehlercode und Titel an der Nachricht (Message.errorCode/errorTitle).
//   2. „Kein WhatsApp“ (lib/whatsapp/zustellfehler.ts, 131026) an einen Lead, der nie selbst geschrieben hat:
//      Lead.waUnavailableAt, Assistent aus, laufende Nachfass-Abfolgen gestoppt, keine weiteren WhatsApp-Nachrichten
//      (sendWhatsAppNotice wirft WhatsAppUnavailableError, Abfolgen machen Anruf-Aufgaben daraus). Der Lead steht
//      ganz oben auf Heute/Anrufliste („Kein WhatsApp: bitte direkt anrufen“), der Kontakt zeigt einen Hinweis.
//   3. Push an den zuständigen Berater (sonst alle Logins des Kunden): „Sofort anrufen: … hat kein WhatsApp“.
//   4. Einmal je Lead eine kurze E-Mail mit Terminlink im Namen des Vermittlers (lib/whatsapp/kein-whatsapp-mail.ts).
//      Rechtsgrundlage: Antwort auf die eigene Anfrage des Leads (er hat seine E-Mail-Adresse im Formular dafür
//      angegeben), nur zur konkreten Anfrage und ohne Werbung für anderes, also keine Werbe-E-Mail im Sinne von
//      § 7 Abs. 2 Nr. 2 UWG (keine Einwilligung nötig, wie die Terminbestätigung). Trotzdem nicht, wenn die Adresse
//      bzw. Nummer auf der Sperrliste steht (Abmeldung), die E-Mail-Funktionen beim Kunden aus sind, schon ein Termin
//      gebucht ist oder der Lead nicht mehr offen ist. Versand über das verbundene Postfach des Beraters bzw. Inhabers,
//      sonst über unseren neutralen Absender für Lead-E-Mails (BOOKING_EMAIL_FROM, wie die Terminbestätigung).
//   5. Andere Fehler (Zahlung, Vorlage, Limits …) sind kein „kein WhatsApp“: Admin-Alarm (Push und Aufgabe),
//      höchstens einmal je Kunde, Code und Tag (WhatsAppErrorAlert).
// Bestandskampagnen: Empfänger mit „kein WhatsApp“ bekommen künftige Kampagnen nur per E-Mail
// (ExistingCustomer.waUnavailableAt, lib/bestand/campaigns.ts applyCampaignStatus und lib/bestand/einwilligung.ts).

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { asAnsprache } from "@/lib/ansprache";
import { formatPhone } from "@/lib/format";
import { ART_HINWEIS, ART_LABEL, zustellfehlerOf, type StatusError, type Zustellfehler } from "@/lib/whatsapp/zustellfehler";
import { keinWhatsAppMail } from "@/lib/whatsapp/kein-whatsapp-mail";

/** Grund auf der Anrufliste (Heute, Leads). */
export const KEIN_WHATSAPP_REASON = "Kein WhatsApp: bitte direkt anrufen";
/** outreachStatus nach „kein WhatsApp“ */
export const NO_WHATSAPP_STATUS = "no_whatsapp";

const OPEN_STATUSES = new Set(["", "neuer lead", "nicht erreicht", "im gespräch"]);

/** Tag in Berlin (YYYY-MM-DD) für die Entprellung der Admin-Alarme. */
export function berlinDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export type FailedStatusResult = { error: Zustellfehler; lead?: "flagged" | "already" | "skipped"; campaign?: boolean; alarm?: "created" | "counted" | null };

/**
 * Status „failed“ einer ausgehenden Nachricht verarbeiten (Webhook). Fehler an der Nachricht speichern, dann
 * „kein WhatsApp“ (Lead bzw. Bestandskunde markieren) oder Admin-Alarm.
 */
export async function handleFailedStatus(waMessageId: string, errors: StatusError[] | null | undefined, now = new Date()): Promise<FailedStatusResult> {
  const error = zustellfehlerOf(errors);
  await prisma.message.updateMany({ where: { waMessageId }, data: { errorCode: error.code, errorTitle: error.title } });
  const msg = await prisma.message.findUnique({
    where: { waMessageId },
    select: { direction: true, purpose: true, conversation: { select: { id: true, customerId: true, leadId: true } } },
  });
  // Kampagnen-Empfänger (Bestand): Status, bei „kein WhatsApp“ künftig nur E-Mail
  const { applyCampaignStatus } = await import("@/lib/bestand/campaigns");
  const campaign = await applyCampaignStatus(waMessageId, "failed", now, { code: error.code });
  const out: FailedStatusResult = { error, campaign };
  if (!msg || msg.direction !== "outbound") return out;
  const conv = msg.conversation;

  if (error.art === "kein_whatsapp") {
    if (conv.leadId) {
      // Hat der Lead je selbst geschrieben, hat er WhatsApp: dann ist es kein „kein WhatsApp“
      const inbound = await prisma.message.count({ where: { conversationId: conv.id, direction: "inbound" } });
      out.lead = inbound > 0 ? "skipped" : await markLeadNoWhatsApp(conv.leadId, { now, code: error.code });
    }
    return out;
  }
  out.alarm = await adminWhatsAppAlarm(conv.customerId, error, { now, purpose: msg.purpose });
  return out;
}

/**
 * Lead als „kein WhatsApp“ markieren (einmalig): Assistent aus, Abfolgen stoppen, E-Mail mit Terminlink, Push.
 * Rückgabe "already", wenn er schon markiert war (dann passiert nichts weiter).
 */
export async function markLeadNoWhatsApp(leadId: string, opts: { now?: Date; code?: number | null } = {}): Promise<"flagged" | "already" | "skipped"> {
  const now = opts.now ?? new Date();
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, customerId: true, name: true, phone: true, source: true, status: true, outreachAt: true, outreachStatus: true, erasedAt: true },
  });
  if (!lead || lead.erasedAt) return "skipped";
  const st = lead.outreachStatus ?? "";
  const overwrite = !st || st === "sent" || st === "sent_booked" || st === "no_template" || st.startsWith("failed");
  const r = await prisma.lead.updateMany({
    where: { id: leadId, waUnavailableAt: null },
    data: {
      waUnavailableAt: now,
      callbackSnoozedUntil: null,
      ...(overwrite ? { outreachStatus: NO_WHATSAPP_STATUS, outreachAt: lead.outreachAt ?? now } : {}),
    },
  });
  if (r.count === 0) return "already";

  // Assistent aus (keine Fragen mehr per WhatsApp), Nachfass-Abfolgen stoppen
  await prisma.conversation.updateMany({ where: { customerId: lead.customerId, OR: [{ leadId }, ...(lead.phone ? [{ contactPhone: lead.phone }] : [])] }, data: { botActive: false } });
  const { stopSequences } = await import("@/lib/lead-sequences");
  await stopSequences(leadId, "Kein WhatsApp", { now }).catch((err) => reportError(err, "kein-whatsapp-sequences"));
  const { logLeadHistory } = await import("@/lib/lead-history");
  await logLeadHistory(
    leadId,
    "status",
    `Kein WhatsApp: Die Nummer ist nicht per WhatsApp erreichbar${opts.code ? ` (Meta ${opts.code})` : ""}. Der Assistent schreibt nicht mehr, bitte direkt anrufen.`,
    { customerId: lead.customerId, userId: null },
  );

  // Offen und ohne gebuchten Termin: E-Mail an den Lead und Push „Sofort anrufen“
  const open = OPEN_STATUSES.has((lead.status ?? "").trim().toLowerCase());
  const booked = await prisma.appointment.count({ where: { leadId, status: "booked", startsAt: { gt: now } } });
  if (!open || booked > 0) return "flagged";
  const mail = await sendKeinWhatsAppMail(leadId, { now }).catch((err) => {
    reportError(err, "kein-whatsapp-mail", { lead: leadId });
    return { sent: false as const, reason: "error" };
  });
  const { notifyLeadPush } = await import("@/lib/team");
  const { displayProduct } = await import("@/lib/products");
  const name = lead.name?.trim() || "Ein neuer Lead";
  const parts = [lead.phone ? formatPhone(lead.phone) : null, lead.source ? displayProduct(lead.source) : null].filter(Boolean).join(" · ");
  await notifyLeadPush(leadId, {
    title: `Sofort anrufen: ${name} hat kein WhatsApp`,
    body: `${parts ? `${parts}. ` : ""}Die Nummer ist nicht per WhatsApp erreichbar.${mail.sent ? " Eine E-Mail mit Ihrem Terminlink ist raus." : ""}`,
    url: `/buyer/leads/${leadId}`,
    tag: `kein-wa:${leadId}`,
  });
  return "flagged";
}

type MailResult = { sent: true; via: "postfach" | "resend" } | { sent: false; reason: string };

/**
 * E-Mail „Termin wählen“ an einen Lead ohne WhatsApp, höchstens einmal je Lead (Lead.waUnavailableMailAt).
 * Siehe Kopf der Datei für die Regeln.
 */
export async function sendKeinWhatsAppMail(leadId: string, opts: { now?: Date } = {}): Promise<MailResult> {
  const now = opts.now ?? new Date();
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      customerId: true,
      email: true,
      phone: true,
      name: true,
      source: true,
      erasedAt: true,
      assignedUserId: true,
      waUnavailableMailAt: true,
      customer: { select: { leadAddress: true, mailFeaturesOff: true, dormantSince: true, agentConfig: { select: { advisorEmail: true } } } },
    },
  });
  const to = lead?.email?.trim();
  if (!lead || lead.erasedAt) return { sent: false, reason: "not_found" };
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { sent: false, reason: "no_email" };
  if (lead.waUnavailableMailAt) return { sent: false, reason: "already_sent" };
  if (lead.customer.mailFeaturesOff) return { sent: false, reason: "mail_off" };
  if (lead.customer.dormantSince) return { sent: false, reason: "dormant" };
  // Sperrliste des Kunden (Abmeldung per Link oder „Stopp“): E-Mail bzw. alle Kanäle
  const { optOutHash } = await import("@/lib/bestand/links");
  const blocked = await prisma.bestandOptOut.count({
    where: {
      customerId: lead.customerId,
      OR: [{ kind: "email", hash: optOutHash("email", to) }, ...(lead.phone ? [{ kind: "phone", hash: optOutHash("phone", lead.phone), scope: "all" }] : [])],
    },
  });
  if (blocked > 0) return { sent: false, reason: "opted_out" };

  // Einmal je Lead: vor dem Versand belegen (parallele Webhooks), bei Fehler wieder freigeben
  const claim = await prisma.lead.updateMany({ where: { id: leadId, waUnavailableMailAt: null }, data: { waUnavailableMailAt: now } });
  if (claim.count === 0) return { sent: false, reason: "already_sent" };
  try {
    const res = await deliverMail(lead, to);
    if (!res.sent) await prisma.lead.update({ where: { id: leadId }, data: { waUnavailableMailAt: null } });
    console.log(`[kein-whatsapp mail] ${leadId}: ${res.sent ? `gesendet (${res.via})` : `nicht gesendet (${res.reason})`}`);
    return res;
  } catch (err) {
    await prisma.lead.update({ where: { id: leadId }, data: { waUnavailableMailAt: null } }).catch(() => null);
    throw err;
  }
}

async function deliverMail(
  lead: {
    id: string;
    customerId: string;
    phone: string | null;
    name: string | null;
    source: string | null;
    assignedUserId: string | null;
    customer: { leadAddress: string | null; agentConfig: { advisorEmail: string | null } | null };
  },
  to: string,
): Promise<MailResult> {
  const [{ ansprechpartner }, { bookingPageUrl }] = await Promise.all([import("@/lib/lead-anrede"), import("@/lib/public-url")]);
  const who = await ansprechpartner({ customerId: lead.customerId, leadId: lead.id, phone: lead.phone, name: lead.name });
  const an = asAnsprache(lead.customer.leadAddress);
  const advisor = who.advisor || who.firm;
  // Persönlicher Terminlink (nur mit verbundenem Kalender)
  const cal = await prisma.calendarConnection.findUnique({ where: { customerId: lead.customerId }, select: { status: true } });
  let link: string | null = null;
  if (cal?.status === "connected") {
    const { getOrCreateBookingSlug } = await import("@/lib/calendar");
    link = bookingPageUrl(await getOrCreateBookingSlug(lead.customerId), { lead: lead.id });
  }

  // 1. Postfach des zuständigen Beraters, sonst eines Inhabers (Mail liegt dann in seinem Gesendet-Ordner)
  const owners = await prisma.user.findMany({ where: { customerId: lead.customerId, role: "BUYER", teamRole: "owner" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const order = [lead.assignedUserId, ...owners.map((o) => o.id)].filter((x): x is string => !!x);
  const conns = order.length
    ? await prisma.mailConnection.findMany({ where: { userId: { in: order }, customerId: lead.customerId, status: "ok" }, select: { userId: true, fromName: true, user: { select: { displayName: true, mailSignature: true } } } })
    : [];
  const conn = order.map((id) => conns.find((c) => c.userId === id)).find(Boolean);
  const { logLeadHistory } = await import("@/lib/lead-history");
  if (conn) {
    const sender = conn.fromName?.trim() || conn.user.displayName?.trim() || advisor;
    const m = keinWhatsAppMail({ an, kontakt: who.kontakt, source: lead.source, advisor: sender, link, signatur: conn.user.mailSignature });
    const { sendViaPostfach } = await import("@/lib/mail/postfach");
    const res = await sendViaPostfach(conn.userId, { to, subject: m.subject, text: m.text });
    if (res.ok) {
      await logLeadHistory(lead.id, "email", `E-Mail an ${to} (automatisch, kein WhatsApp): ${m.subject}\n\n${m.text}`, { customerId: lead.customerId, userId: null });
      return { sent: true, via: "postfach" };
    }
    console.error("[kein-whatsapp mail] Postfach", res.raw ?? res.error);
  }

  // 2. Neutraler Absender für Lead-E-Mails (wie die Terminbestätigung, lib/calendar/lead-email.ts)
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.BOOKING_EMAIL_FROM?.trim();
  if (!apiKey || !fromAddress) return { sent: false, reason: "not_configured" };
  const m = keinWhatsAppMail({ an, kontakt: who.kontakt, source: lead.source, advisor, link });
  const replyTo =
    lead.customer.agentConfig?.advisorEmail ||
    (await prisma.user.findFirst({ where: { customerId: lead.customerId, role: "BUYER" }, orderBy: { createdAt: "asc" }, select: { email: true } }))?.email ||
    undefined;
  const { mailClient } = await import("@/lib/mail-guard");
  const { error } = await mailClient(apiKey).emails.send({
    from: `"${advisor.replace(/["<>]/g, "")}" <${fromAddress}>`,
    to,
    ...(replyTo ? { replyTo } : {}),
    subject: m.subject,
    text: m.text,
  });
  if (error) return { sent: false, reason: error.message ?? "send_failed" };
  await logLeadHistory(lead.id, "email", `E-Mail an ${to} (automatisch, kein WhatsApp): ${m.subject}\n\n${m.text}`, { customerId: lead.customerId, userId: null });
  return { sent: true, via: "resend" };
}

/**
 * Admin-Alarm zu einem Zustellfehler, der nicht „kein WhatsApp“ ist: Push an die Admins und eine Aufgabe, höchstens
 * einmal je Kunde, Code und Tag (weitere Fehler desselben Tages zählen nur hoch).
 */
export async function adminWhatsAppAlarm(customerId: string, error: Zustellfehler, opts: { now?: Date; purpose?: string | null } = {}): Promise<"created" | "counted"> {
  const now = opts.now ?? new Date();
  const code = error.code ?? -1;
  const day = berlinDay(now);
  try {
    await prisma.whatsAppErrorAlert.create({ data: { customerId, code, day, title: error.title } });
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    await prisma.whatsAppErrorAlert.update({ where: { customerId_code_day: { customerId, code, day } }, data: { count: { increment: 1 } } });
    return "counted";
  }
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } },
  });
  const name = c?.name ?? customerId;
  const codeText = error.code != null ? String(error.code) : "ohne Code";
  const title = `WhatsApp-Fehler ${codeText}: ${name}`;
  const note = [
    `${ART_LABEL[error.art]}${error.title ? `: ${error.title}` : ""}`,
    opts.purpose ? `Nachricht: ${opts.purpose}` : null,
    ART_HINWEIS[error.art],
    `Weitere Fehler mit diesem Code heute zählen unter Admin → Zahlen → WhatsApp-Zustellung.`,
    `Kunden-ID ${customerId} · Kundenakte: /admin/kunden/${customerId}`,
  ]
    .filter(Boolean)
    .join("\n");
  await prisma.salesTask
    .create({ data: { contactId: c?.salesContact?.id ?? c?.onboarding?.salesContactId ?? null, type: "SONSTIGES", title, note, dueAt: now } })
    .catch((err) => reportError(err, "whatsapp-alarm-task", { customer: customerId }));
  const { sendToAdmins } = await import("@/lib/push");
  await sendToAdmins({
    title: `⚠️ ${title}`,
    body: `${ART_LABEL[error.art]}${error.title ? `: ${error.title}` : ""}`.slice(0, 140),
    url: `/admin/kunden/${customerId}`,
    tag: `wa-fehler:${customerId}:${code}:${day}`,
  }).catch(() => {});
  return "created";
}

// ─── Kennzahl „Leads ohne WhatsApp“ ───────────────────────────────────────

export type KeinWhatsAppQuote = { attempted: number; noWhatsApp: number; share: number | null };

/** Leads, die per WhatsApp angeschrieben wurden (bzw. bei denen es versucht wurde), und davon ohne WhatsApp. */
export async function keinWhatsAppQuote(where: { customerId?: string; from?: Date; to?: Date } = {}): Promise<KeinWhatsAppQuote> {
  const base = {
    ...(where.customerId ? { customerId: where.customerId } : {}),
    ...(where.from || where.to ? { createdAt: { ...(where.from ? { gte: where.from } : {}), ...(where.to ? { lte: where.to } : {}) } } : {}),
  };
  const [attempted, noWhatsApp] = await Promise.all([
    prisma.lead.count({ where: { ...base, OR: [{ outreachStatus: { in: ["sent", "sent_booked", NO_WHATSAPP_STATUS] } }, { waUnavailableAt: { not: null } }] } }),
    prisma.lead.count({ where: { ...base, waUnavailableAt: { not: null } } }),
  ]);
  return { attempted, noWhatsApp, share: attempted > 0 ? noWhatsApp / attempted : null };
}

export type KeinWhatsAppZeile = { customerId: string; name: string; attempted: number; noWhatsApp: number; share: number | null };

/** Admin: je Kunde (nur Kunden mit Versuchen), absteigend nach Anteil. */
export async function keinWhatsAppJeKunde(from?: Date): Promise<KeinWhatsAppZeile[]> {
  const created = from ? { createdAt: { gte: from } } : {};
  const [att, no] = await Promise.all([
    prisma.lead.groupBy({
      by: ["customerId"],
      where: { ...created, customer: { isTest: false }, OR: [{ outreachStatus: { in: ["sent", "sent_booked", NO_WHATSAPP_STATUS] } }, { waUnavailableAt: { not: null } }] },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({ by: ["customerId"], where: { ...created, customer: { isTest: false }, waUnavailableAt: { not: null } }, _count: { _all: true } }),
  ]);
  const noBy = new Map(no.map((r) => [r.customerId, r._count._all]));
  const names = new Map(
    (await prisma.customer.findMany({ where: { id: { in: att.map((r) => r.customerId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]),
  );
  return att
    .map((r) => {
      const n = noBy.get(r.customerId) ?? 0;
      return { customerId: r.customerId, name: names.get(r.customerId) ?? r.customerId, attempted: r._count._all, noWhatsApp: n, share: r._count._all > 0 ? n / r._count._all : null };
    })
    .sort((x, y) => (y.share ?? 0) - (x.share ?? 0) || y.attempted - x.attempted);
}
