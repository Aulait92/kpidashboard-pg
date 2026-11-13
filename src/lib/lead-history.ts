// Lead-Verlauf im Kundenbereich (Ole, 13.11.2026): Notizen werden gepostet und stehen mit
// Anrufen, Statuswechseln, Wiedervorlagen, Abschluss und Police in einer Zeitleiste.
// Protokollieren darf nie die eigentliche Aktion scheitern lassen.

import { prisma } from "@/lib/prisma";
import { getBuyerContext } from "@/lib/buyer-context";

export type LeadHistoryKind = "notiz" | "anruf" | "status" | "wiedervorlage" | "abschluss" | "police" | "dokument" | "email";
export { POLICY_TODO } from "@/lib/lead-followup";

export async function logLeadHistory(leadId: string, kind: LeadHistoryKind, text: string, opts: { customerId?: string; userId?: string | null } = {}): Promise<void> {
  try {
    const customerId = opts.customerId ?? (await prisma.lead.findUnique({ where: { id: leadId }, select: { customerId: true } }))?.customerId;
    if (!customerId) return;
    const userId = opts.userId !== undefined ? opts.userId : ((await getBuyerContext().catch(() => null))?.userId ?? null);
    await prisma.leadHistory.create({ data: { leadId, customerId, kind, text: text.trim().slice(0, 4000), userId } });
  } catch (err) {
    console.error("[lead-history]", err);
  }
}

export type LeadHistoryEntry = { id: string; kind: LeadHistoryKind; text: string; author: string | null; mine: boolean; at: string };

/** Verlauf eines Leads, neueste zuerst; Autor als Vorname bzw. E-Mail-Name. */
export async function loadLeadHistory(leadId: string, viewerUserId: string | null): Promise<LeadHistoryEntry[]> {
  const rows = await prisma.leadHistory.findMany({ where: { leadId }, orderBy: { createdAt: "desc" }, take: 200 });
  const userIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true } }) : [];
  const nameOf = new Map(users.map((u) => [u.id, (u.displayName?.trim().split(/\s+/)[0] || u.email.split("@")[0]) ?? null]));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as LeadHistoryKind,
    text: r.text,
    author: r.userId ? (nameOf.get(r.userId) ?? null) : null,
    mine: !!viewerUserId && r.userId === viewerUserId,
    at: r.createdAt.toISOString(),
  }));
}

export const fmtDayShort = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit" }).format(d);

/** „Abschluss · Beitrag 350 € · Provision ≈ 193 €“ mit den Provisionssätzen des Kunden. */
export async function abschlussText(customerId: string, source: string | null, closeValue: number | null): Promise<string> {
  const [{ loadCustomerProvision }, { closeValueLabel }] = await Promise.all([import("@/lib/provision-server"), import("@/lib/provision")]);
  const rates = (await loadCustomerProvision(customerId)).rates;
  const label = closeValueLabel(source, closeValue, rates);
  return `Abschluss${label ? ` · ${label}` : ""}`;
}

