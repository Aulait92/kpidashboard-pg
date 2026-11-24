// Beleg von Hand zuordnen (Ole, 24.11.2026): für Fälle, die der automatische Abgleich (lib/belege/abgleich.ts) nicht
// eindeutig lösen kann, z. B. eine Rechnung in zwei Lastschriften mit verrechneter Gutschrift (Perspective) oder mehrere
// Monatsrechnungen gleicher Höhe. Die erste Abbuchung hängt am Beleg (Beleg.bankTransactionId), weitere als Teilzahlung
// (BankTransaction.belegTeilVonId). Von Hand Zugeordnetes bleibt beim nächsten Abgleich erhalten.
// Aufruf: POST /api/ops/belege/zuordnen (Schlüssel OPS_UPLOAD_TOKEN).

import { prisma } from "@/lib/prisma";

export type ZuordnenErgebnis =
  | { ok: true; beleg: string; zahlungen: string[]; summeZahlungen: number; brutto: number | null; differenz: number | null }
  | { ok: false; error: string };

const r2 = (x: number) => Math.round(x * 100) / 100;
const tag = (d: Date | null) => d?.toISOString().slice(0, 10) ?? "?";

/** Prüft die Eingabe ohne Datenbank: 1 bis 20 verschiedene Zahlungen (z. B. Vorauszahlungen per Karte, Outbrain). */
export function zuordnungPruefen(umsatzIds: unknown): string | null {
  if (!Array.isArray(umsatzIds) || !umsatzIds.length) return "Mindestens eine Zahlung angeben.";
  if (umsatzIds.length > 20) return "Höchstens 20 Zahlungen je Beleg.";
  if (!umsatzIds.every((x) => typeof x === "string" && x.length > 0 && x.length < 64)) return "Ungültige Zahlungs-ID.";
  if (new Set(umsatzIds).size !== umsatzIds.length) return "Zahlung doppelt angegeben.";
  return null;
}

/**
 * Ordnet einem Beleg eine oder mehrere Abbuchungen zu (ersetzt seine bisherige Zuordnung). Eine Abbuchung, die automatisch
 * an einem anderen Beleg hängt, wird dort gelöst; eine von Hand zugeordnete nicht (Fehler, erst dort lösen).
 */
export async function belegVonHandZuordnen(belegId: string, umsatzIds: string[]): Promise<ZuordnenErgebnis> {
  const fehler = zuordnungPruefen(umsatzIds);
  if (fehler) return { ok: false, error: fehler };
  const beleg = await prisma.beleg.findUnique({ where: { id: belegId }, select: { id: true, firma: true, nummer: true, brutto: true, waehrung: true } });
  if (!beleg) return { ok: false, error: "Beleg nicht gefunden." };
  const umsaetze = await prisma.bankTransaction.findMany({
    where: { id: { in: umsatzIds } },
    select: { id: true, bookingDate: true, amount: true, counterparty: true, belegTeilVonId: true, beleg: { select: { id: true, zuordnung: true } } },
  });
  if (umsaetze.length !== umsatzIds.length) return { ok: false, error: "Zahlung nicht gefunden." };
  for (const u of umsaetze) {
    if (Number(u.amount) >= 0) return { ok: false, error: `${tag(u.bookingDate)} ${u.amount}: keine Ausgabe.` };
    if (u.beleg && u.beleg.id !== beleg.id && u.beleg.zuordnung === "hand") return { ok: false, error: `${tag(u.bookingDate)} ${u.amount}: schon von Hand einem anderen Beleg zugeordnet.` };
    if (u.belegTeilVonId && u.belegTeilVonId !== beleg.id) return { ok: false, error: `${tag(u.bookingDate)} ${u.amount}: schon Teilzahlung zu einem anderen Beleg.` };
  }
  // Größte Abbuchung trägt den Beleg, die übrigen sind Teilzahlungen
  const sortiert = [...umsaetze].sort((a, b) => Number(a.amount) - Number(b.amount));
  const [haupt, ...teile] = sortiert;
  await prisma.$transaction([
    // bisherige Zuordnung dieses Belegs lösen
    prisma.bankTransaction.updateMany({ where: { belegTeilVonId: beleg.id }, data: { belegTeilVonId: null } }),
    prisma.beleg.update({ where: { id: beleg.id }, data: { bankTransactionId: null, zuordnung: null } }),
    // automatische Zuordnungen anderer Belege an diesen Zahlungen lösen
    prisma.beleg.updateMany({ where: { bankTransactionId: { in: umsatzIds }, zuordnung: "auto" }, data: { bankTransactionId: null, zuordnung: null } }),
    prisma.beleg.update({ where: { id: beleg.id }, data: { bankTransactionId: haupt.id, zuordnung: "hand" } }),
    ...(teile.length ? [prisma.bankTransaction.updateMany({ where: { id: { in: teile.map((t) => t.id) } }, data: { belegTeilVonId: beleg.id } })] : []),
  ]);
  const summe = r2(-sortiert.reduce((s, u) => s + Number(u.amount), 0));
  const brutto = beleg.brutto == null ? null : Number(beleg.brutto);
  return {
    ok: true,
    beleg: `${beleg.firma ?? "?"} ${beleg.nummer ?? ""}`.trim(),
    zahlungen: sortiert.map((u) => `${tag(u.bookingDate)} ${u.amount} ${u.counterparty ?? ""}`.trim()),
    summeZahlungen: summe,
    brutto,
    differenz: brutto == null || beleg.waehrung !== "EUR" ? null : r2(brutto - summe),
  };
}

/** Zuordnung eines Belegs ganz lösen (Haupt- und Teilzahlungen). */
export async function belegZuordnungLoesen(belegId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const beleg = await prisma.beleg.findUnique({ where: { id: belegId }, select: { id: true } });
  if (!beleg) return { ok: false, error: "Beleg nicht gefunden." };
  await prisma.$transaction([
    prisma.bankTransaction.updateMany({ where: { belegTeilVonId: belegId }, data: { belegTeilVonId: null } }),
    prisma.beleg.update({ where: { id: belegId }, data: { bankTransactionId: null, zuordnung: null } }),
  ]);
  return { ok: true };
}
