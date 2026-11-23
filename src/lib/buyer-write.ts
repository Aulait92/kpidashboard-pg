import { getCurrentSession } from "@/lib/auth";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";

// Schreibrecht: der eingeloggte Kunde selbst — oder ein Admin in „Als Kunde
// ansehen", aber NUR für Demo-Leads (bezugAirtableId = "demo"), damit sich
// die Vorschau mit Testdaten durchklicken lässt, echte Leads aber tabu sind.
// Team: ein Berater (advisor) darf nur die ihm zugewiesenen Leads bearbeiten.
export async function writableCustomerId(leadId: string): Promise<string | null> {
  const session = await getCurrentSession();
  if (session?.role === "BUYER" && session.customerId) {
    const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { teamRole: true, customerId: true, customer: { select: { dormantSince: true } } } });
    if (!u || u.customerId !== session.customerId) return null;
    // Ruhendes Konto (lib/ruhend.ts): nichts mehr bearbeiten
    if (u.customer?.dormantSince) return null;
    if (u.teamRole === "advisor") {
      if (!leadId) return null;
      const own = await prisma.lead.count({ where: { id: leadId, customerId: session.customerId, assignedUserId: session.userId } });
      if (!own) return null;
    }
    return session.customerId;
  }
  const ctx = await getBuyerContext();
  // App-Demo: nie beschreibbar (auch nicht die Demo-Leads wie in der Admin-Vorschau)
  if (ctx?.preview && !ctx.demo && leadId) {
    const demo = await prisma.lead.findFirst({
      where: { id: leadId, customerId: ctx.customerId, bezugAirtableId: "demo" },
      select: { id: true },
    });
    if (demo) return ctx.customerId;
  }
  return null;
}

/**
 * Admin in „Als Kunde ansehen“ darf am Kontakt die automatischen Nachrichten steuern (überspringen, verschieben,
 * pausieren), auch bei echten Leads (Ole, 22.11.2026: „ich muss für Lohmann auch eine Nachricht überspringen können“).
 * Nur diese Aktionen, nicht allgemein schreiben. null = kein Admin in der Vorschau oder fremder Lead.
 */
export async function adminVorschauCustomerId(leadId: string): Promise<string | null> {
  const session = await getCurrentSession();
  if (session?.role !== "ADMIN") return null;
  const ctx = await getBuyerContext();
  if (!ctx?.preview || ctx.demo || !leadId) return null;
  const lead = await prisma.lead.count({ where: { id: leadId, customerId: ctx.customerId } });
  return lead ? ctx.customerId : null;
}
