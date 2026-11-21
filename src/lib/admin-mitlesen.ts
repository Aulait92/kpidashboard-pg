// Admin liest mit (Ole, 21.11.2026: „bei den ersten Kunden als Admin Notifications, wenn Leads reinkommen, Termine
// gebucht werden und Abschlüsse reinkommen“). Push an alle Admins, je Kunde abschaltbar (Customer.adminMitlesen,
// Glocke im Kopf der Kundenakte). Nie bei Testkunden oder Testleads. Ohne Namen und Nummern des Leads (nur Kunde,
// Produkt, Zeit), Link in die Kundenakte.

import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";

export type MitlesenEreignis = "lead" | "termin" | "abschluss";

const TITEL: Record<MitlesenEreignis, string> = { lead: "🆕 Lead", termin: "📅 Termin", abschluss: "🏆 Abschluss" };

/** Titel und Text des Pushs. (rein) */
export function mitlesenText(e: MitlesenEreignis, kunde: string, detail: string | null): { title: string; body: string } {
  return { title: `${TITEL[e]} bei ${kunde.replace(/^Allianz\s+/i, "")}`, body: detail?.trim() || (e === "lead" ? "Neuer Lead" : e === "termin" ? "Neuer Termin" : "Neuer Abschluss") };
}

/** Push an Admins, wenn der Kunde mitgelesen wird. Fehler werden nur gemeldet, nie geworfen. */
export async function adminMitlesen(o: { leadId: string; ereignis: MitlesenEreignis; detail?: string | null; tagZusatz?: string }): Promise<void> {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: o.leadId },
      select: { isTest: true, source: true, customerId: true, customer: { select: { name: true, isTest: true, adminMitlesen: true } } },
    });
    if (!lead?.customer || lead.isTest || lead.customer.isTest || !lead.customer.adminMitlesen) return;
    const { title, body } = mitlesenText(o.ereignis, lead.customer.name, o.detail ?? lead.source);
    await sendToAdmins({ title, body, url: `/admin/neu/kunden/${lead.customerId}`, tag: `mitlesen-${o.ereignis}:${o.tagZusatz ?? o.leadId}` });
  } catch (err) {
    reportError(err, "admin-mitlesen");
  }
}
