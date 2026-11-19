// Messung der Beratungspräsentation (Ole, 19.11.2026): Kennzahl „Abschlussquote je Präsentation“ je Vermittler und
// Splittest-Variante. Gespeichert wird nur: Termin, Quelle (termin | kundenlink), Art (folie | zusage), Folien-ID,
// Variante. Keine neuen Personendaten (kein Name, keine IP, kein Gerät, keine Lesedauer); je Termin, Quelle, Art und
// Folie höchstens ein Eintrag (Unique-Index), daher kein Wachstum durch Neuladen.
//
// Präsentation = Termin, bei dem mindestens eine Folie nach „Das haben Sie uns gesagt“ erreicht wurde (im Termin oder
// im Kundenlink). Abschluss = Zusage („Ja, so machen wir es“) oder Kontakt als abgeschlossen eingetragen (Lead.closedAt
// ab dem Termintag). Abschlussquote = Abschlüsse / Präsentationen.
//
// Seit 19.11.2026 zeigen alle Termine Fassung B (lib/praesentation-variante.ts); Variante je Ereignis und die Auswertung
// je Variante bleiben für den nächsten Test. Die Zusage geht zusätzlich als Ziel „zusage“ an das Experiment-Modul
// (zählt erst, wenn ein Test „praesentation“ eingetragen ist und den Lead zugeteilt hat).

import { prisma } from "@/lib/prisma";
import { ereignis } from "@/lib/experimente";
import { PRAESENTATION_EXPERIMENT, PRAESENTATION_VARIANTEN, praesentationsVariante, type PraesentationVariante } from "@/lib/praesentation-variante";

export type EreignisQuelle = "termin" | "kundenlink";
export type EreignisArt = "folie" | "zusage";

/** Folien-IDs aus dem Deck: Kleinbuchstaben, Ziffern, Bindestrich. */
export const FOLIE_ID = /^[a-z0-9-]{1,48}$/;

/** Zählt als gezeigte Präsentation: jede Folie nach Begrüßung und „Das haben Sie uns gesagt“; keine Einwand-Folien. */
export const zaehltAlsGezeigt = (folie: string) => !!folie && folie !== "titel" && folie !== "situation" && !folie.startsWith("einwand-");

/** Ein Ereignis speichern (doppelte still ignoriert). true = neu gespeichert. */
export async function ereignisSpeichern(e: {
  customerId: string;
  appointmentId: string;
  leadId: string | null;
  quelle: EreignisQuelle;
  art: EreignisArt;
  folie?: string;
}): Promise<boolean> {
  const folie = e.art === "zusage" ? "" : (e.folie ?? "");
  if (e.art === "folie" && !FOLIE_ID.test(folie)) return false;
  const einheit = e.leadId ?? e.appointmentId;
  const variante = praesentationsVariante(einheit);
  const r = await prisma.praesentationEreignis.createMany({
    data: [{ customerId: e.customerId, appointmentId: e.appointmentId, quelle: e.quelle, art: e.art, folie, variante }],
    skipDuplicates: true,
  });
  if (e.art === "zusage") await ereignis(PRAESENTATION_EXPERIMENT, einheit, "zusage");
  return r.count > 0;
}

/** Zeitpunkt der ersten Zusage zu einem Termin (Termin oder Kundenlink), sonst null. */
export async function zusageAm(appointmentId: string): Promise<Date | null> {
  const z = await prisma.praesentationEreignis.findFirst({ where: { appointmentId, art: "zusage" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  return z?.createdAt ?? null;
}

export type Ereignis = { appointmentId: string; customerId: string; quelle: string; art: string; folie: string; variante: string; createdAt?: Date };

export type QuoteZeile = {
  praesentationen: number;
  abschluesse: number;
  /** Abschlüsse / Präsentationen (0 bis 1), null ohne Präsentation */
  abschlussquote: number | null;
  zusagenTermin: number;
  zusagenKundenlink: number;
  kundenlinkGeoeffnet: number;
  /** Kundenlink: Termine, bei denen die Folie „Ihre Entscheidung“ erreicht wurde */
  kundenlinkEntscheidung: number;
};

const leer = (): QuoteZeile => ({ praesentationen: 0, abschluesse: 0, abschlussquote: null, zusagenTermin: 0, zusagenKundenlink: 0, kundenlinkGeoeffnet: 0, kundenlinkEntscheidung: 0 });

/**
 * Reine Auswertung: je Vermittler (customerId) und Variante. abgeschlossen = Termine, deren Kontakt ab dem Termintag
 * als abgeschlossen eingetragen ist. Variante je Termin: die des ersten Ereignisses.
 */
export function auswerten(ereignisse: Ereignis[], abgeschlossen: Set<string>): Record<string, Record<PraesentationVariante, QuoteZeile>> {
  const je = new Map<string, Ereignis[]>();
  for (const e of ereignisse) je.set(e.appointmentId, [...(je.get(e.appointmentId) ?? []), e]);
  const out: Record<string, Record<PraesentationVariante, QuoteZeile>> = {};
  for (const [id, es] of je) {
    const v = (PRAESENTATION_VARIANTEN as readonly string[]).includes(es[0].variante) ? (es[0].variante as PraesentationVariante) : "A";
    const z = ((out[es[0].customerId] ??= { A: leer(), B: leer() }) as Record<PraesentationVariante, QuoteZeile>)[v];
    const zusageT = es.some((e) => e.art === "zusage" && e.quelle === "termin");
    const zusageK = es.some((e) => e.art === "zusage" && e.quelle === "kundenlink");
    const link = es.filter((e) => e.quelle === "kundenlink");
    if (link.length) z.kundenlinkGeoeffnet++;
    if (link.some((e) => e.folie === "entscheidung")) z.kundenlinkEntscheidung++;
    if (zusageT) z.zusagenTermin++;
    if (zusageK) z.zusagenKundenlink++;
    if (!es.some((e) => e.art === "folie" && zaehltAlsGezeigt(e.folie))) continue;
    z.praesentationen++;
    if (zusageT || zusageK || abgeschlossen.has(id)) z.abschluesse++;
  }
  for (const k of Object.values(out)) for (const z of Object.values(k)) z.abschlussquote = z.praesentationen ? Math.round((z.abschluesse / z.praesentationen) * 1000) / 1000 : null;
  return out;
}

const TAG = 24 * 3600_000;

/** Auswertung der letzten Tage (Ereignisse ab „seit“), optional für einen Vermittler. */
export async function abschlussquoteLaden(seit: Date, customerId?: string) {
  const ereignisse = await prisma.praesentationEreignis.findMany({
    where: { createdAt: { gte: seit }, ...(customerId ? { customerId } : {}) },
    orderBy: { createdAt: "asc" },
    select: { appointmentId: true, customerId: true, quelle: true, art: true, folie: true, variante: true },
  });
  const ids = [...new Set(ereignisse.map((e) => e.appointmentId))];
  const termine = ids.length
    ? await prisma.appointment.findMany({ where: { id: { in: ids } }, select: { id: true, startsAt: true, lead: { select: { closedAt: true } } } })
    : [];
  const abgeschlossen = new Set(termine.filter((t) => t.lead?.closedAt && t.lead.closedAt.getTime() >= t.startsAt.getTime() - TAG).map((t) => t.id));
  return auswerten(ereignisse, abgeschlossen);
}

/** Diagnose (q=praesentation-quote[&tage=30][&kunde=<id>]): je Vermittler (Name) und Variante, plus Summe. */
export async function praesentationQuoteDiagnose(p: URLSearchParams) {
  const tage = Math.min(365, Math.max(1, Number(p.get("tage")) || 30));
  const kunde = p.get("kunde") ?? undefined;
  const je = await abschlussquoteLaden(new Date(Date.now() - tage * TAG), kunde);
  const namen = new Map((await prisma.customer.findMany({ where: { id: { in: Object.keys(je) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const summe: Record<PraesentationVariante, QuoteZeile> = { A: leer(), B: leer() };
  for (const k of Object.values(je))
    for (const v of PRAESENTATION_VARIANTEN) {
      const s = summe[v];
      const z = k[v];
      s.praesentationen += z.praesentationen;
      s.abschluesse += z.abschluesse;
      s.zusagenTermin += z.zusagenTermin;
      s.zusagenKundenlink += z.zusagenKundenlink;
      s.kundenlinkGeoeffnet += z.kundenlinkGeoeffnet;
      s.kundenlinkEntscheidung += z.kundenlinkEntscheidung;
    }
  for (const v of PRAESENTATION_VARIANTEN) summe[v].abschlussquote = summe[v].praesentationen ? Math.round((summe[v].abschluesse / summe[v].praesentationen) * 1000) / 1000 : null;
  return {
    tage,
    erklaerung: "Abschlussquote je Präsentation = (Zusage im Termin oder Kundenlink bzw. Kontakt abgeschlossen) / Termine mit gezeigter Präsentation; Varianten A (bisher) und B (Abschluss-Dramaturgie).",
    summe,
    jeVermittler: Object.entries(je).map(([id, v]) => ({ kunde: namen.get(id) ?? id, ...v })),
  };
}
