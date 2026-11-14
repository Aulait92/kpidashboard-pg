// Abmeldelink der Kampagnen-Mails (Ole, 14.11.2026): öffentlich, ohne Login, ein Klick. Der Aufruf meldet
// sofort von E-Mail-Kampagnen ab; optional wählt der Kunde „auch keine WhatsApp-Nachrichten mehr“.
// Gilt sofort und dauerhaft (Sperrliste, auch nach erneutem Import), wird protokolliert und der Kampagne
// zugeordnet (CampaignRecipient.optOutAt).

import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/bestand/links";
import { optOutExisting } from "@/lib/bestand/einwilligung-server";
import { advisorPerson } from "@/lib/lead-anrede";

export type UnsubscribeTarget = { existingCustomerId: string; recipientId: string | null; advisor: string; whatsappBlocked: boolean; hasPhone: boolean };

/** Token prüfen und Bestandskunden finden (Empfänger einer Kampagne oder Bestandskunde). */
export async function resolveUnsubscribe(token: string): Promise<UnsubscribeTarget | null> {
  const v = verifyLink(token);
  if (!v) return null;
  const ecId =
    v.kind === "r"
      ? (await prisma.campaignRecipient.findUnique({ where: { id: v.id }, select: { existingCustomerId: true } }))?.existingCustomerId
      : v.id;
  if (!ecId) return null;
  const ec = await prisma.existingCustomer.findUnique({ where: { id: ecId }, select: { id: true, optOutAt: true, phone: true, customer: { select: { name: true } } } });
  if (!ec) return null;
  return { existingCustomerId: ec.id, recipientId: v.kind === "r" ? v.id : null, advisor: advisorPerson(ec.customer.name, null), whatsappBlocked: !!ec.optOutAt, hasPhone: !!ec.phone };
}

/** Abmelden: scope email (Standard, ein Klick) oder all (auch WhatsApp). */
export async function unsubscribe(token: string, scope: "email" | "all", meta: { ip: string | null; userAgent: string | null }, now = new Date()): Promise<UnsubscribeTarget | null> {
  const t = await resolveUnsubscribe(token);
  if (!t) return null;
  await optOutExisting(t.existingCustomerId, { scope, source: "abmeldelink", recipientId: t.recipientId, ip: meta.ip, userAgent: meta.userAgent, now });
  return { ...t, whatsappBlocked: t.whatsappBlocked || scope === "all" };
}
