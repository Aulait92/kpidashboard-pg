// Belege aus GetMyInvoices holen und den Kontoumsätzen zuordnen (nächtlich, WhatsApp-Cron) sowie die Liste
// „Ausgaben ohne Beleg“ für Geld › Kosten. Regeln des Abgleichs: lib/belege/abgleich.ts.

import { prisma } from "@/lib/prisma";
import { anbieterName, belegeZuordnen, brauchtBeleg, EINGANGS_TYPEN } from "./abgleich";
import { gmiDokumente, gmiKonfiguriert } from "./gmi";

/** Ab hier wird lückenlos belegt (Ole, 22.11.2026: ab 1.1.2026). */
export const BELEGE_AB = "2026-01-01";

const zahl = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const datum = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);
const tag = (d: Date) => d.toISOString().slice(0, 10);

export type BelegLauf = { geholt: number; neu: number; zugeordnet: number; fehler?: string };

export async function syncBelege(): Promise<BelegLauf> {
  if (!gmiKonfiguriert()) return { geholt: 0, neu: 0, zugeordnet: 0, fehler: "GETMYINVOICES_API_KEY fehlt" };
  const docs = await gmiDokumente(BELEGE_AB);
  let neu = 0;
  for (const d of docs) {
    const daten = {
      typ: d.documentType ?? "MISC",
      firma: d.companyName?.slice(0, 200) ?? null,
      nummer: d.documentNumber?.slice(0, 100) || null,
      datum: datum(d.documentDate),
      netto: zahl(d.netAmount),
      ustSatz: zahl(d.vat),
      brutto: zahl(d.grossAmount),
      waehrung: (d.currency || "EUR").toUpperCase().slice(0, 3),
      dateiname: d.filename?.slice(0, 200) ?? null,
      ocrFertig: d.isOcrCompleted === true || d.isOcrCompleted === 1,
    };
    const alt = await prisma.beleg.findUnique({ where: { gmiUid: d.documentUid }, select: { id: true, zuordnung: true } });
    if (!alt) {
      await prisma.beleg.create({ data: { gmiUid: d.documentUid, quelle: "gmi", ausgelesen: "gmi", ...daten } });
      neu++;
      continue;
    }
    // Typ später z. B. auf Ausgangsrechnung geändert → automatische Zuordnung lösen
    const keinEingang = !(EINGANGS_TYPEN as readonly string[]).includes(daten.typ);
    await prisma.beleg.update({
      where: { id: alt.id },
      data: { ...daten, ...(keinEingang && alt.zuordnung === "auto" ? { bankTransactionId: null, zuordnung: null } : {}) },
    });
  }
  // Originaldateien einmal übernehmen (eigene Ablage, damit GetMyInvoices gekündigt werden kann); je Lauf begrenzt
  const ohneDatei = await prisma.beleg.findMany({ where: { gmiUid: { not: null }, datei: null }, select: { id: true, gmiUid: true }, take: 60 });
  const { gmiDatei } = await import("./gmi");
  const crypto = await import("node:crypto");
  for (const b of ohneDatei) {
    const d = await gmiDatei(b.gmiUid!).catch(() => null);
    if (!d || !d.daten.length) continue;
    const hash = crypto.createHash("sha256").update(d.daten).digest("hex");
    await prisma.beleg.update({ where: { id: b.id }, data: { datei: Buffer.from(d.daten), mimeType: d.typ, hash } }).catch(() =>
      // gleicher Inhalt schon als anderer Beleg da (Doppel in GetMyInvoices): nur Datei ohne Hash
      prisma.beleg.update({ where: { id: b.id }, data: { datei: Buffer.from(d.daten), mimeType: d.typ } }).catch(() => null),
    );
  }
  const zugeordnet = await belegeAbgleichen();
  return { geholt: docs.length, neu, zugeordnet };
}

/**
 * Belege den Ausgaben zuordnen (eindeutige Treffer). Automatische Zuordnungen werden jedes Mal neu berechnet, damit ein
 * später eintreffender Beleg seinen richtigen Monat bekommt; von Hand Zugeordnetes bleibt.
 */
export async function belegeAbgleichen(): Promise<number> {
  const ab = new Date(`${BELEGE_AB}T00:00:00Z`);
  const vorher = await prisma.beleg.findMany({ where: { zuordnung: "auto" }, select: { id: true, bankTransactionId: true } });
  await prisma.beleg.updateMany({ where: { zuordnung: "auto" }, data: { bankTransactionId: null, zuordnung: null } });
  const [umsaetze, belege] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { bookingDate: { gte: new Date(ab.getTime() - 7 * 86_400_000) }, amount: { lt: 0 }, beleg: { is: null }, belegTeilVonId: null },
      select: { id: true, bookingDate: true, amount: true, counterparty: true, purpose: true, status: true },
    }),
    prisma.beleg.findMany({ where: { bankTransactionId: null }, select: { id: true, typ: true, firma: true, nummer: true, datum: true, brutto: true, waehrung: true } }),
  ]);
  const paare = belegeZuordnen(
    umsaetze.map((u) => ({ id: u.id, datum: tag(u.bookingDate), betrag: Number(u.amount), gegenpartei: u.counterparty, zweck: u.purpose, status: u.status })),
    belege.map((b) => ({ id: b.id, typ: b.typ, firma: b.firma, nummer: b.nummer, datum: b.datum ? tag(b.datum) : null, brutto: b.brutto == null ? null : Number(b.brutto), waehrung: b.waehrung })),
  );
  for (const p of paare) {
    await prisma.beleg.update({ where: { id: p.belegId }, data: { bankTransactionId: p.umsatzId, zuordnung: "auto" } }).catch(() => null);
  }
  // Rückgabe: neu hinzugekommene Zuordnungen (nicht die unveränderten)
  const alt = new Set(vorher.map((v) => `${v.id}:${v.bankTransactionId}`));
  return paare.filter((p) => !alt.has(`${p.belegId}:${p.umsatzId}`)).length;
}

export type OhneBelegAnbieter = { anbieter: string; anzahl: number; summe: number; letzter: string };

/** Ausgaben seit BELEGE_AB, die einen Beleg brauchen und keinen haben, je Anbieter (größte Summe zuerst). */
export async function ausgabenOhneBeleg(): Promise<{ anzahl: number; summe: number; mitBeleg: number; anbieter: OhneBelegAnbieter[]; belegeOhneZahlung: number }> {
  const ab = new Date(`${BELEGE_AB}T00:00:00Z`);
  const [rows, belegeOhneZahlung] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { bookingDate: { gte: ab }, amount: { lt: 0 } },
      select: { bookingDate: true, amount: true, counterparty: true, purpose: true, status: true, belegTeilVonId: true, beleg: { select: { id: true } } },
    }),
    prisma.beleg.count({ where: { bankTransactionId: null, typ: { in: [...EINGANGS_TYPEN] }, datum: { gte: ab } } }),
  ]);
  const m = new Map<string, OhneBelegAnbieter>();
  let anzahl = 0;
  let summe = 0;
  let mitBeleg = 0;
  for (const r of rows) {
    const u = { betrag: Number(r.amount), gegenpartei: r.counterparty, zweck: r.purpose, status: r.status };
    if (!brauchtBeleg(u)) continue;
    if (r.beleg || r.belegTeilVonId) {
      mitBeleg++;
      continue;
    }
    const name = anbieterName(u);
    const e = m.get(name) ?? { anbieter: name, anzahl: 0, summe: 0, letzter: "" };
    e.anzahl++;
    e.summe = Math.round((e.summe - u.betrag) * 100) / 100;
    const t = tag(r.bookingDate);
    if (t > e.letzter) e.letzter = t;
    m.set(name, e);
    anzahl++;
    summe -= u.betrag;
  }
  return { anzahl, summe: Math.round(summe * 100) / 100, mitBeleg, anbieter: [...m.values()].sort((a, b) => b.summe - a.summe), belegeOhneZahlung };
}
