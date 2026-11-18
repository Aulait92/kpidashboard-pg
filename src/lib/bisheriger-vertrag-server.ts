// Bisheriger Vertrag (Paket P3b): Quellen aus der Datenbank laden. Policen-Auszüge nur als bereinigtes Feldobjekt
// (PolicenAuszug.felder, Whitelist beim Auslesen), ohne Import aus lib/policen/auslesen (Importgrenze); Chat aus
// Lead.vorvertraege. Rein: lib/bisheriger-vertrag.ts.
// „ohne KI“ (Auflage A9, lib/policen/ohne-ki.ts): keine Werte aus Policen mehr, bereits übernommene werden entfernt.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { GESUNDHEIT_FREIGABE_SELECT, gesundheitFreigegeben } from "@/lib/policen/regeln";
import { kiAbgelehnt } from "@/lib/policen/ohne-ki";
import { vorvertraegeAus, type Vorvertraege } from "@/lib/whatsapp/vorvertraege";
import { istGesundheitssparte, type PoliceKurz } from "@/lib/bisheriger-vertrag";
import { cleanTarifauswahl, zuAngebote, type Tarifauswahl } from "@/lib/tarifauswahl";

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
  // „ohne KI“: keine Werte aus Policen (im Zweifel nicht)
  const ohneKi = await kiAbgelehnt(leadId).catch(() => true);
  const rows = ohneKi
    ? []
    : await prisma.policenAuszug
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

const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * „ohne KI“ (A9): den aus einer Police übernommenen bisherigen Vertrag aus allen Terminen des Leads entfernen
 * (Tarifauswahl und Spalte „Ihr bisheriger Vertrag“ der Folie). Von Hand Eingetragenes und Werte aus dem Chat bleiben.
 * Gibt die Zahl der geänderten Termine zurück.
 */
export async function policeWerteEntfernen(leadId: string, customerId: string): Promise<number> {
  const termine = await prisma.appointment.findMany({ where: { leadId, customerId }, select: { id: true, tarifauswahl: true, offersJson: true } });
  let n = 0;
  for (const t of termine) {
    const roh = t.tarifauswahl;
    if (!istObjekt(roh) || !Array.isArray(roh.sparten)) continue;
    let geaendert = false;
    const sparten = roh.sparten.map((sp: unknown) => {
      if (!istObjekt(sp) || !istObjekt(sp.bisher) || sp.bisher.quelle !== "police") return sp;
      geaendert = true;
      const c = { ...sp };
      delete c.bisher;
      return c;
    });
    if (!geaendert) continue;
    const neu = { ...roh, sparten };
    const data: Prisma.AppointmentUpdateInput = { tarifauswahl: neu as Prisma.InputJsonValue };
    const auswahl = cleanTarifauswahl(neu);
    if (istObjekt(t.offersJson) && auswahl) {
      const rest = { ...t.offersJson };
      delete rest.bisher;
      const bisher = zuAngebote(auswahl).bisher ?? [];
      data.offersJson = (bisher.length ? { ...rest, bisher } : rest) as Prisma.InputJsonValue;
    }
    await prisma.appointment.update({ where: { id: t.id }, data });
    n++;
  }
  return n;
}
