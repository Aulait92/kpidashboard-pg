// „Buchungsseite ohne freie Zeiten“, Datenbank-Teil (Ole, 25.11.2026; Regeln in lib/buchungsseite-leer.ts):
//   pruefeBuchungsseiten   Cron (alle 5 Min., tagsüber): je aktivem Software-Kunden mit verbundenem Kalender und
//                          Buchungsseite höchstens alle 30 Min. suggestSlots(kunde, 30, 1, "lead", 14) wie die
//                          Buchungsseite. Leer oder Fehler: CalendarConnection.keineZeitenSeit (Beginn bleibt), Grund
//                          (Allianz-Termin-Art ohne freie Zeiten, Kalender nicht abrufbar …). Zeiten da: Feld leeren.
//   ladeBuchungsseitenLeer Punkte für Admin „Heute“ (Bereich Kunden), nur aus den gespeicherten Feldern.
// Gleiche Prüfung wie die Diagnose q=kalender-check (lib/ops/kalender-check.ts), nur knapp.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { NUR_PPL_WHERE } from "@/lib/customer-package";
import type { HeuteItem } from "@/lib/admin-heute";
import { istTagsueber, leerSeitText, leerWarnen, naechsterStand, PRUEF_ABSTAND_MS } from "@/lib/buchungsseite-leer";

/** Aktive Software-Kunden mit verbundenem Kalender und Buchungsseite (keine Testkunden). */
export const BUCHUNGSSEITE_WHERE: Prisma.CalendarConnectionWhereInput = {
  status: "connected",
  bookingSlug: { not: null },
  customer: {
    archived: false,
    isTest: false,
    dormantSince: null,
    dataDeletedAt: null,
    plan: { notIn: ["service", "internal", "ppl"] },
    NOT: NUR_PPL_WHERE,
  },
};

export type SlotPruefung = (customerId: string) => Promise<number>;

const standardPruefung: SlotPruefung = async (customerId) => {
  const { suggestSlots } = await import("@/lib/calendar");
  return (await suggestSlots(customerId, 30, 1, "lead", 14)).length;
};

const kurz = (s: string, n = 140) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** Grund, warum keine Zeiten kommen (nur beim Übergang auf „leer“, eine externe Abfrage). Wirft nicht. */
export async function leerGrund(customerId: string, fehler: string | null, now = new Date()): Promise<string> {
  if (fehler) return `Kalender nicht abrufbar: ${kurz(fehler, 100)}`;
  try {
    const agent = await prisma.agentConfig.findUnique({ where: { customerId }, select: { allianzCalendarEnc: true } });
    const { decodeAllianzCalendar, fetchFreeSlots } = await import("@/lib/calendar/allianz-online");
    const cal = decodeAllianzCalendar(agent?.allianzCalendarEnc);
    if (cal) {
      const frei = await fetchFreeSlots(cal, now, new Date(now.getTime() + 14 * 86_400_000)).catch(() => null);
      if (frei && frei.length === 0) return `Allianz-Termin-Art „${kurz(cal.templateName, 60)}“ hat in den nächsten 14 Tagen keine freien Zeiten`;
      if (frei && frei.length > 0) return "Allianz hat freie Zeiten, sie passen aber nicht in die Lead-Zeiten";
    }
  } catch {
    // Grund bleibt allgemein
  }
  return "Keine freie Lead-Zeit in den nächsten 14 Tagen (Kalender voll oder Lead-Zeiten zu knapp)";
}

export type PruefErgebnis = { geprueft: number; leer: number; neuLeer: number; wieder: number };

/** Cron: tagsüber je Kunde höchstens alle 30 Minuten prüfen. Wirft nicht für einzelne Kunden. */
export async function pruefeBuchungsseiten(now = new Date(), deps: { pruefen?: SlotPruefung; grund?: typeof leerGrund; limit?: number } = {}): Promise<PruefErgebnis> {
  const out: PruefErgebnis = { geprueft: 0, leer: 0, neuLeer: 0, wieder: 0 };
  if (!istTagsueber(now)) return out;
  const pruefen = deps.pruefen ?? standardPruefung;
  const grundFn = deps.grund ?? leerGrund;
  const faellig = await prisma.calendarConnection.findMany({
    where: { AND: [BUCHUNGSSEITE_WHERE, { OR: [{ keineZeitenGeprueftAt: null }, { keineZeitenGeprueftAt: { lte: new Date(now.getTime() - PRUEF_ABSTAND_MS) } }] }] },
    select: { id: true, customerId: true, keineZeitenSeit: true, keineZeitenGrund: true },
    orderBy: { keineZeitenGeprueftAt: { sort: "asc", nulls: "first" } },
    take: deps.limit ?? 20,
  });
  for (const c of faellig) {
    // Beanspruchen (parallele Cron-Läufe prüfen nicht doppelt)
    const claim = await prisma.calendarConnection.updateMany({
      where: { id: c.id, OR: [{ keineZeitenGeprueftAt: null }, { keineZeitenGeprueftAt: { lte: new Date(now.getTime() - PRUEF_ABSTAND_MS) } }] },
      data: { keineZeitenGeprueftAt: now },
    });
    if (!claim.count) continue;
    let anzahl = 0;
    let fehler: string | null = null;
    try {
      anzahl = await pruefen(c.customerId);
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e);
    }
    out.geprueft++;
    const stand = naechsterStand({ keineZeitenSeit: c.keineZeitenSeit }, { anzahl, fehler }, now);
    if (!stand.leer) {
      if (c.keineZeitenSeit) {
        out.wieder++;
        await prisma.calendarConnection.update({ where: { id: c.id }, data: { keineZeitenSeit: null, keineZeitenGrund: null } });
      }
      continue;
    }
    out.leer++;
    if (stand.neu) out.neuLeer++;
    // Grund beim Übergang auf „leer“, bei einem Fehler immer aktuell
    const grund = stand.neu || fehler || !c.keineZeitenGrund ? await grundFn(c.customerId, fehler, now).catch(() => null) : c.keineZeitenGrund;
    await prisma.calendarConnection.update({ where: { id: c.id }, data: { keineZeitenSeit: stand.keineZeitenSeit, keineZeitenGrund: grund } });
  }
  return out;
}

const anzeigeName = (n: string) => n.replace(/^Allianz\s+/i, "");

/** Punkte für Admin „Heute“: Buchungsseite seit mehr als 3 Stunden (tagsüber) ohne freie Zeiten. */
export async function ladeBuchungsseitenLeer(now = new Date()): Promise<HeuteItem[]> {
  const rows = await prisma.calendarConnection.findMany({
    where: { AND: [BUCHUNGSSEITE_WHERE, { keineZeitenSeit: { not: null } }] },
    select: { customerId: true, keineZeitenSeit: true, keineZeitenGrund: true, customer: { select: { name: true } } },
  });
  return rows
    .filter((r) => leerWarnen(r.keineZeitenSeit, now))
    .map((r) => ({
      key: `buchungsseite:${r.customerId}`,
      area: "Kunden" as const,
      tone: "bad" as const,
      icon: "calendar" as const,
      title: `Buchungsseite von ${anzeigeName(r.customer.name)} zeigt keine freien Zeiten`,
      detail: `${r.keineZeitenGrund ?? "Grund unbekannt"} · ${leerSeitText(r.keineZeitenSeit!, now)} · Leads können nicht selbst buchen`,
      action: { label: "Kundenakte", href: `/admin/neu/kunden/${r.customerId}` },
      since: r.keineZeitenSeit,
      later: { label: "Morgen", days: 1 },
    }));
}
