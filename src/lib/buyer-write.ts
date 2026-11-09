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
    const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { teamRole: true, customerId: true } });
    if (!u || u.customerId !== session.customerId) return null;
    if (u.teamRole === "advisor") {
      if (!leadId) return null;
      const own = await prisma.lead.count({ where: { id: leadId, customerId: session.customerId, assignedUserId: session.userId } });
      if (!own) return null;
    }
    return session.customerId;
  }
  const ctx = await getBuyerContext();
  if (ctx?.preview && leadId) {
    const demo = await prisma.lead.findFirst({
      where: { id: leadId, customerId: ctx.customerId, bezugAirtableId: "demo" },
      select: { id: true },
    });
    if (demo) return ctx.customerId;
  }
  return null;
}
