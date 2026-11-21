// Policen je Berater (Persona-Test 20.11.2026, Großagentur: „Wie viele Leads je Berater haben Policen geschickt, wie
// viele wurden vor dem Termin geprüft?“). Für die Karte „Team im Zeitraum“ (components/team-stats.tsx). Quellen, die
// das Löschen der Unterlagen überdauern: Einwilligung (PolicenNachweis, nur anhängen) bzw. noch vorhandene Unterlage;
// geprüft = Audit „geprüft“, „alle geprüft“ oder „korrigiert“ vor dem ersten Termin. Nur Zahlen, keine Inhalte.

import { prisma } from "@/lib/prisma";

export const GEPRUEFT_AKTIONEN = ["policen.auslesen_geprueft", "policen.auslesen_geprueft_alle", "policen.auslesen_korrigiert"] as const;

export type PolicenLead = { geschickt: boolean; geprueftVorTermin: boolean };

/** Lead des Audit-Eintrags: entity Lead, sonst details.leadId (Korrektur je Auszug). */
export function leadAusAudit(e: { entity: string | null; entityId: string | null; details: unknown }): string | null {
  if (e.entity === "Lead") return e.entityId;
  const d = e.details as { leadId?: unknown } | null;
  return typeof d?.leadId === "string" ? d.leadId : null;
}

/** Je Lead mit Termin: Policen geschickt, vor dem ersten Termin geprüft. Leads ohne Policen fehlen in der Map. */
/** ab: Beginn des Zeitraums (Leads entstehen danach, geprüft wird also auch erst danach). */
export async function policenJeLead(customerId: string, leads: { id: string; ersterTermin: Date | null }[], ab: Date): Promise<Map<string, PolicenLead>> {
  const out = new Map<string, PolicenLead>();
  const mitTermin = leads.filter((l) => l.ersterTermin);
  if (!mitTermin.length) return out;
  const ids = mitTermin.map((l) => l.id);
  const [nachweise, docs, audits] = await Promise.all([
    prisma.policenNachweis.findMany({ where: { customerId, leadId: { in: ids }, art: "einwilligung" }, select: { leadId: true } }),
    prisma.leadDocument.findMany({ where: { customerId, leadId: { in: ids }, status: "gespeichert" }, select: { leadId: true }, distinct: ["leadId"] }),
    prisma.auditLog.findMany({ where: { customerId, action: { in: [...GEPRUEFT_AKTIONEN] }, at: { gte: ab } }, select: { entity: true, entityId: true, details: true, at: true } }),
  ]);
  const geschickt = new Set([...nachweise.map((n) => n.leadId), ...docs.map((d) => d.leadId)].filter((x): x is string => !!x));
  const termin = new Map(mitTermin.map((l) => [l.id, l.ersterTermin as Date]));
  const geprueft = new Set<string>();
  for (const a of audits) {
    const id = leadAusAudit(a);
    const t = id ? termin.get(id) : undefined;
    if (id && t && a.at < t) geprueft.add(id);
  }
  for (const id of ids) if (geschickt.has(id)) out.set(id, { geschickt: true, geprueftVorTermin: geprueft.has(id) });
  return out;
}

/** Zeile fürs Handy: „3 von 8 Terminen · 2 geprüft“ (geprüft = vor dem Termin, passt in eine Zeile bei 390 px). */
export function policenZeile(p: { geschickt: number; termine: number; geprueft: number }): string {
  const teil = `${p.geschickt} von ${p.termine} ${p.termine === 1 ? "Termin" : "Terminen"}`;
  return p.geschickt ? `${teil} · ${p.geprueft} geprüft` : teil;
}
