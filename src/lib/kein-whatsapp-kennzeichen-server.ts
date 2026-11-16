// Kennzeichen „Kein WhatsApp“ (lib/kein-whatsapp-kennzeichen.ts) für eine Liste von Leads: Kandidaten rein prüfen,
// dann nur für diese nachsehen, ob der Lead je selbst geschrieben hat (dann hat er WhatsApp, wie getCallbackLeads).

import { prisma } from "@/lib/prisma";
import { zeigtKeinWhatsApp, type KeinWhatsAppFakten } from "@/lib/kein-whatsapp-kennzeichen";

export async function keinWhatsAppIds(leads: (KeinWhatsAppFakten & { id: string })[]): Promise<Set<string>> {
  const ids = leads.filter((l) => zeigtKeinWhatsApp(l)).map((l) => l.id);
  if (ids.length === 0) return new Set();
  const replied = await prisma.conversation.findMany({
    where: { leadId: { in: ids }, messages: { some: { direction: "inbound" } } },
    select: { leadId: true },
  });
  const hatGeschrieben = new Set(replied.map((c) => c.leadId));
  return new Set(ids.filter((id) => !hatGeschrieben.has(id)));
}
