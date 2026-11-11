// Support-Weitergabe aus der KI-Hilfe: Angebot festhalten (UsageEvent "support"),
// bei Kontakt (WhatsApp/E-Mail/Team) Admins per Push informieren. Die Zusammenfassung
// ist bereits ohne Kontaktdaten (redact); Lead-Inhalte werden nie übernommen.

import type { Prisma } from "@/generated/prisma/client";
import type { BuyerContext } from "@/lib/buyer-context";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/push";
import {
  REASON_LABEL,
  mailtoUrl,
  shortSummary,
  supportConfig,
  supportMessage,
  supportRef,
  whatsappUrl,
  type EscalationReason,
} from "@/lib/support";

export type SupportChannel = "whatsapp" | "email" | "team";

export type Escalation = {
  id: string;
  ref: string;
  reason: EscalationReason;
  reasonLabel: string;
  summary: string;
  responseTime: string;
  whatsappUrl: string | null;
  mailtoUrl: string | null;
};

type SupportMeta = { ref: string; reason: EscalationReason; summary: string; source: "ai" | "rule" | "user"; channel?: SupportChannel; contactedAt?: string };

/** Weitergabe anbieten: Referenz anlegen und fertige Kontakt-Links (wa.me/mailto) bauen. */
export async function offerEscalation(
  ctx: BuyerContext,
  o: { reason: EscalationReason; summary: string; source: SupportMeta["source"]; page?: string | null },
): Promise<Escalation> {
  const cfg = supportConfig();
  const summary = shortSummary(o.summary) || "Bitte um Rückmeldung zur App.";
  const ev = await prisma.usageEvent.create({
    data: { customerId: ctx.customerId, userId: ctx.userId, preview: ctx.preview, type: "support", name: "offered", path: o.page ?? null },
    select: { id: true },
  });
  const ref = supportRef(ev.id);
  const meta: SupportMeta = { ref, reason: o.reason, summary, source: o.source };
  await prisma.usageEvent.update({ where: { id: ev.id }, data: { meta: meta as unknown as Prisma.InputJsonValue } });

  const [customer, user] = await Promise.all([
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true } }),
    ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { displayName: true } }) : null,
  ]);
  const company = customer?.name ?? null;
  const name = user?.displayName?.trim() || company || ctx.email;
  const text = supportMessage({ name, company, summary, ref });
  return {
    id: ev.id,
    ref,
    reason: o.reason,
    reasonLabel: REASON_LABEL[o.reason],
    summary,
    responseTime: cfg.responseTime,
    whatsappUrl: cfg.whatsapp ? whatsappUrl(cfg.whatsapp, text) : null,
    mailtoUrl: cfg.email ? mailtoUrl(cfg.email, { ref, text }) : null,
  };
}

/** Kunde hat einen Kontaktweg gewählt: festhalten und Admins benachrichtigen (nicht in der Admin-Vorschau). */
export async function contactEscalation(ctx: BuyerContext, id: string, channel: SupportChannel): Promise<boolean> {
  const ev = await prisma.usageEvent.findFirst({ where: { id, customerId: ctx.customerId, type: "support" }, select: { id: true, meta: true } });
  if (!ev) return false;
  const meta = (ev.meta ?? {}) as unknown as SupportMeta;
  const first = !meta.channel;
  await prisma.usageEvent.update({
    where: { id: ev.id },
    data: { name: "contacted", meta: { ...meta, channel, contactedAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue },
  });
  if (!first || ctx.preview) return true;
  const customer = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true } });
  const via = channel === "whatsapp" ? "per WhatsApp" : channel === "email" ? "per E-Mail" : "bittet um Rückmeldung";
  await sendToAdmins({
    title: `Hilfe-Anfrage ${meta.ref}: ${REASON_LABEL[meta.reason] ?? "Support"}`,
    body: `${customer?.name ?? "Kunde"} ${via}: ${meta.summary}`.slice(0, 240),
    url: "/admin/nutzung#hilfe-team",
    tag: `support-${meta.ref}`,
  }).catch(() => null);
  await audit("help.escalate", { entity: "UsageEvent", entityId: ev.id, customerId: ctx.customerId, details: { ref: meta.ref, reason: meta.reason, channel } });
  return true;
}

export type SupportRequest = { id: string; at: Date; customerId: string; customer: string; ref: string; reason: string; summary: string; channel: SupportChannel };

/** Admin: Anfragen, bei denen der Kunde einen Kontaktweg gewählt hat. */
export async function loadSupportRequests(days: number, take = 30): Promise<SupportRequest[]> {
  const events = await prisma.usageEvent.findMany({
    where: { type: "support", name: "contacted", preview: false, at: { gte: new Date(Date.now() - days * 24 * 3600 * 1000) } },
    orderBy: { at: "desc" },
    take,
    select: { id: true, at: true, customerId: true, meta: true },
  });
  const names = new Map(
    (await prisma.customer.findMany({ where: { id: { in: [...new Set(events.map((e) => e.customerId))] } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]),
  );
  return events.map((e) => {
    const m = (e.meta ?? {}) as unknown as SupportMeta;
    return {
      id: e.id,
      at: e.at,
      customerId: e.customerId,
      customer: names.get(e.customerId) ?? "Kunde",
      ref: m.ref ?? "",
      reason: REASON_LABEL[m.reason] ?? "Support",
      summary: m.summary ?? "",
      channel: m.channel ?? "team",
    };
  });
}
