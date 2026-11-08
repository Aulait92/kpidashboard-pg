import { getCurrentSession } from "@/lib/auth";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";

// Schreibrecht: der eingeloggte Kunde selbst — oder ein Admin in „Als Kunde
// ansehen", aber NUR für Demo-Leads (bezugAirtableId = "demo"), damit sich
// die Vorschau mit Testdaten durchklicken lässt, echte Leads aber tabu sind.
export async function writableCustomerId(leadId: string): Promise<string | null> {
  const session = await getCurrentSession();
  if (session?.role === "BUYER" && session.customerId) return session.customerId;
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
