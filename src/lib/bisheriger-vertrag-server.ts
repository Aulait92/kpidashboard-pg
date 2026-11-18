// Bisheriger Vertrag (Paket P3b): Quellen aus der Datenbank laden. Policen-Auszüge nur als bereinigtes Feldobjekt
// (PolicenAuszug.felder, Whitelist beim Auslesen), ohne Import aus lib/policen/auslesen (Importgrenze); Chat aus
// Lead.vorvertraege. Rein: lib/bisheriger-vertrag.ts.

import { prisma } from "@/lib/prisma";
import { GESUNDHEIT_FREIGABE_SELECT, gesundheitFreigegeben } from "@/lib/policen/regeln";
import { vorvertraegeAus, type Vorvertraege } from "@/lib/whatsapp/vorvertraege";
import { istGesundheitssparte, type PoliceKurz } from "@/lib/bisheriger-vertrag";
import type { Tarifauswahl } from "@/lib/tarifauswahl";

/** Gesundheitssparten für diesen Vermittler freigeschaltet (lib/policen/regeln.ts gesundheitFreigegeben)? */
export async function gesundheitFrei(customerId: string): Promise<boolean> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: GESUNDHEIT_FREIGABE_SELECT }).catch(() => null);
  return gesundheitFreigegeben(c);
}

/** Ausgelesene Policen (Unterlage noch gespeichert) und bestehende Verträge laut Chat. */
export async function bisherQuellen(leadId: string | null, customerId: string): Promise<{ policen: PoliceKurz[]; vorvertraege: Vorvertraege | null }> {
  if (!leadId) return { policen: [], vorvertraege: null };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: { erasedAt: true, vorvertraege: true } });
  if (!lead || lead.erasedAt) return { policen: [], vorvertraege: null };
  const rows = await prisma.policenAuszug
    .findMany({
      where: { leadId, customerId, status: "ausgelesen", sparte: { not: null }, document: { status: "gespeichert" } },
      select: { id: true, sparte: true, felder: true, geprueftAt: true, ausgelesenAt: true },
      take: 30,
    })
    .catch(() => []);
  return {
    policen: rows.map((r) => ({ id: r.id, sparte: r.sparte!, felder: r.felder, geprueft: !!r.geprueftAt, ausgelesenAt: r.ausgelesenAt?.toISOString() ?? null })),
    vorvertraege: vorvertraegeAus(lead.vorvertraege),
  };
}

/** Beim Speichern: ohne Freischaltung keinen bisherigen Vertrag in Gesundheitssparten (auch nicht von Hand). */
export async function bisherPruefen(a: Tarifauswahl, customerId: string): Promise<Tarifauswahl> {
  if (!a.sparten.some((sp) => sp.bisher && istGesundheitssparte(sp.key))) return a;
  if (await gesundheitFrei(customerId)) return a;
  return {
    ...a,
    sparten: a.sparten.map((sp) => {
      if (!sp.bisher || !istGesundheitssparte(sp.key)) return sp;
      const c = { ...sp };
      delete c.bisher;
      return c;
    }),
  };
}
