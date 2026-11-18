// Abmeldelink der Kampagnen-Mails (Ole, 14.11.2026): öffentlich, ohne Login, ein Klick. Der Aufruf meldet
// sofort von E-Mail-Kampagnen ab; optional wählt der Kunde „auch keine WhatsApp-Nachrichten mehr“.
// Gilt sofort und dauerhaft (Sperrliste, auch nach erneutem Import), wird protokolliert und der Kampagne
// zugeordnet (CampaignRecipient.optOutAt).

import { prisma } from "@/lib/prisma";
import { optOutHash, verifyLink } from "@/lib/bestand/links";
import { optOutExisting } from "@/lib/bestand/einwilligung-server";
import { advisorPerson } from "@/lib/lead-anrede";

export type UnsubscribeTarget = {
  /** Bestandskunde; null bei einem Lead (Abmeldelink aus Vorlagen-Mails) */
  existingCustomerId: string | null;
  leadId?: string | null;
  customerId: string;
  recipientId: string | null;
  advisor: string;
  whatsappBlocked: boolean;
  hasPhone: boolean;
  /** Ansprache für die Seite: Leads wie Customer.leadAddress, Bestandskunden wie Customer.bestandAddress */
  du?: boolean;
};

/** Token prüfen und Bestandskunden finden (Empfänger einer Kampagne oder Bestandskunde). */
export async function resolveUnsubscribe(token: string): Promise<UnsubscribeTarget | null> {
  const v = verifyLink(token);
  if (!v) return null;
  if (v.kind === "l") {
    // Lead (Paket M0): nur E-Mail, WhatsApp beendet der Lead mit „STOPP“ im Chat
    const lead = await prisma.lead.findUnique({ where: { id: v.id }, select: { id: true, customerId: true, email: true, erasedAt: true, customer: { select: { name: true, leadAddress: true } } } });
    if (!lead || lead.erasedAt || !lead.email) return null;
    return { existingCustomerId: null, leadId: lead.id, customerId: lead.customerId, recipientId: null, advisor: advisorPerson(lead.customer.name, null), whatsappBlocked: false, hasPhone: false, du: lead.customer.leadAddress === "du" };
  }
  const ecId =
    v.kind === "r"
      ? (await prisma.campaignRecipient.findUnique({ where: { id: v.id }, select: { existingCustomerId: true } }))?.existingCustomerId
      : v.id;
  if (!ecId) return null;
  const ec = await prisma.existingCustomer.findUnique({ where: { id: ecId }, select: { id: true, customerId: true, optOutAt: true, phone: true, customer: { select: { name: true, bestandAddress: true } } } });
  if (!ec) return null;
  return {
    existingCustomerId: ec.id,
    customerId: ec.customerId,
    recipientId: v.kind === "r" ? v.id : null,
    advisor: advisorPerson(ec.customer.name, null),
    whatsappBlocked: !!ec.optOutAt,
    hasPhone: !!ec.phone,
    du: ec.customer.bestandAddress === "du",
  };
}

/** Abmelden: scope email (Standard, ein Klick) oder all (auch WhatsApp). */
export async function unsubscribe(token: string, scope: "email" | "all", meta: { ip: string | null; userAgent: string | null }, now = new Date()): Promise<UnsubscribeTarget | null> {
  const t = await resolveUnsubscribe(token);
  if (!t) return null;
  if (t.leadId) {
    await leadAbmelden(t.leadId, t.customerId, now);
    return t;
  }
  if (!t.existingCustomerId) return null;
  await optOutExisting(t.existingCustomerId, { scope, source: "abmeldelink", recipientId: t.recipientId, ip: meta.ip, userAgent: meta.userAgent, now });
  return { ...t, whatsappBlocked: t.whatsappBlocked || scope === "all" };
}

/** Lead von E-Mails abmelden: Adresse dauerhaft auf die Sperrliste (lib/mail/sperren.ts prüft sie vor jedem Versand). */
export async function leadAbmelden(leadId: string, customerId: string, now = new Date()): Promise<boolean> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: { email: true, weitereEmails: true } });
  const adressen = [lead?.email, ...(lead?.weitereEmails ?? [])].map((e) => (e ?? "").trim().toLowerCase()).filter(Boolean);
  for (const a of new Set(adressen)) {
    await prisma.bestandOptOut.upsert({
      where: { customerId_kind_hash: { customerId, kind: "email", hash: optOutHash("email", a) } },
      create: { customerId, kind: "email", hash: optOutHash("email", a), scope: "email", createdAt: now },
      update: {},
    });
  }
  if (adressen.length) {
    await prisma.leadHistory
      .create({ data: { leadId, customerId, kind: "status", text: "Hat sich über den Link in einer E-Mail von E-Mails abgemeldet.", createdAt: now } })
      .catch(() => null);
  }
  return adressen.length > 0;
}
