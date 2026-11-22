// Diagnose-Abfrage „belege“ (Ole, 22.11.2026): nur lesend. Stand des Belegabgleichs mit GetMyInvoices.
//   GET /api/ops/diagnose?q=belege[&anbieter=slack]  (mit anbieter: Umsätze und Belege dieses Anbieters samt Zuordnung)

import { prisma } from "@/lib/prisma";
import { ausgabenOhneBeleg } from "@/lib/belege/server";
import { gmiKonfiguriert } from "@/lib/belege/gmi";

export async function belegeStatus(p?: URLSearchParams) {
  const anbieter = (p?.get("anbieter") ?? "").trim();
  if (anbieter.length >= 3) return belegeJeAnbieter(anbieter);
  if (p?.get("liste") === "offen") return offeneZahlungen();
  if (p?.get("liste") === "belege") return alleBelege(p.get("von") ?? "2026-01-01", p.get("bis") ?? "2026-12-31");
  const [gesamt, zugeordnet, jeTyp, ohne, letzte, frei] = await Promise.all([
    prisma.beleg.count(),
    prisma.beleg.count({ where: { bankTransactionId: { not: null } } }),
    prisma.beleg.groupBy({ by: ["typ"], _count: { _all: true } }),
    ausgabenOhneBeleg(),
    prisma.beleg.findMany({
      where: { bankTransactionId: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 15,
      select: { firma: true, nummer: true, datum: true, brutto: true, waehrung: true, zuordnung: true, bankTransaction: { select: { bookingDate: true, amount: true, counterparty: true } } },
    }),
    prisma.beleg.findMany({
      where: { bankTransactionId: null, typ: { not: "SALES_INVOICE" } },
      orderBy: { datum: "desc" },
      take: 60,
      select: { typ: true, firma: true, nummer: true, datum: true, brutto: true, waehrung: true, ocrFertig: true, dateiname: true },
    }),
  ]);
  const { belegAdresse } = await import("@/lib/belege/eingang");
  return {
    adresse: belegAdresse(),
    konfiguriert: gmiKonfiguriert(),
    belege: gesamt,
    zugeordnet,
    jeTyp: Object.fromEntries(jeTyp.map((t) => [t.typ, t._count._all])),
    ausgaben: { mitBeleg: ohne.mitBeleg, ohneBeleg: ohne.anzahl, summeOhneBeleg: ohne.summe, belegeOhneZahlung: ohne.belegeOhneZahlung },
    ohneBelegJeAnbieter: ohne.anbieter.slice(0, 40),
    beispiele: letzte.map((b) => ({
      beleg: `${b.firma ?? "?"} ${b.nummer ?? ""} ${b.datum?.toISOString().slice(0, 10) ?? ""} ${b.brutto ?? "?"} ${b.waehrung}`,
      umsatz: b.bankTransaction ? `${b.bankTransaction.bookingDate.toISOString().slice(0, 10)} ${b.bankTransaction.amount} ${b.bankTransaction.counterparty ?? ""}` : null,
      zuordnung: b.zuordnung,
    })),
    belegeOhneZahlung: frei.map((b) => `${b.datum?.toISOString().slice(0, 10) ?? "?"} ${b.firma ?? b.dateiname ?? "?"} ${b.brutto ?? "?"} ${b.waehrung}${b.ocrFertig ? "" : " (noch nicht ausgelesen)"} ${b.typ}`),
  };
}

async function belegeJeAnbieter(name: string) {
  const [umsaetze, belege] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { amount: { lt: 0 }, OR: [{ counterparty: { contains: name, mode: "insensitive" } }, { purpose: { contains: name, mode: "insensitive" } }] },
      orderBy: { bookingDate: "asc" },
      select: { bookingDate: true, amount: true, accountKey: true, status: true, counterparty: true, beleg: { select: { firma: true, nummer: true, datum: true, brutto: true, waehrung: true } } },
    }),
    prisma.beleg.findMany({ where: { firma: { contains: name, mode: "insensitive" } }, orderBy: { datum: "asc" }, select: { gmiUid: true, typ: true, nummer: true, datum: true, brutto: true, waehrung: true, bankTransactionId: true, zuordnung: true } }),
  ]);
  return {
    umsaetze: umsaetze.map((u) => `${u.bookingDate.toISOString().slice(0, 10)} ${u.amount} ${u.accountKey} ${u.status} ${u.counterparty ?? ""} -> ${u.beleg ? `${u.beleg.nummer ?? ""} ${u.beleg.datum?.toISOString().slice(0, 10) ?? ""} ${u.beleg.brutto} ${u.beleg.waehrung}` : "ohne Beleg"}`),
    belege: belege.map((b) => `${b.datum?.toISOString().slice(0, 10) ?? "?"} ${b.brutto} ${b.waehrung} ${b.typ} ${b.nummer ?? ""} uid=${b.gmiUid} ${b.bankTransactionId ? `zugeordnet (${b.zuordnung})` : "frei"}`),
  };
}

/** Alle Ausgaben seit 1.1., die einen Beleg brauchen und keinen haben (für Eigenbelege und Nachfragen). */
async function offeneZahlungen() {
  const { brauchtBeleg, anbieterName } = await import("@/lib/belege/abgleich");
  const rows = await prisma.bankTransaction.findMany({
    where: { bookingDate: { gte: new Date("2026-01-01T00:00:00Z") }, amount: { lt: 0 }, beleg: { is: null } },
    orderBy: { bookingDate: "asc" },
    select: { id: true, bookingDate: true, amount: true, accountKey: true, counterparty: true, purpose: true, status: true },
  });
  return rows
    .filter((r) => brauchtBeleg({ betrag: Number(r.amount), gegenpartei: r.counterparty, zweck: r.purpose, status: r.status }))
    .map((r) => ({
      id: r.id,
      datum: r.bookingDate.toISOString().slice(0, 10),
      betrag: Number(r.amount),
      konto: r.accountKey,
      anbieter: anbieterName({ gegenpartei: r.counterparty, zweck: r.purpose }),
      gegenpartei: r.counterparty,
      zweck: r.purpose?.replace(/\s+/g, " ").slice(0, 100) ?? null,
    }));
}

/** Alle Belege eines Zeitraums (ohne Dateien), z. B. für den Vergleich mit den Auswertungen des Steuerbüros. */
async function alleBelege(von: string, bis: string) {
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const rows = await prisma.beleg.findMany({
    where: { datum: { gte: new Date(`${ok(von) ? von : "2026-01-01"}T00:00:00Z`), lte: new Date(`${ok(bis) ? bis : "2026-12-31"}T00:00:00Z`) } },
    orderBy: { datum: "asc" },
    select: { id: true, datum: true, typ: true, firma: true, nummer: true, netto: true, ustSatz: true, brutto: true, waehrung: true, dateiname: true, quelle: true, bankTransactionId: true },
  });
  return rows.map((b) => ({ ...b, datum: b.datum?.toISOString().slice(0, 10) ?? null, netto: b.netto == null ? null : Number(b.netto), ustSatz: b.ustSatz == null ? null : Number(b.ustSatz), brutto: b.brutto == null ? null : Number(b.brutto), zugeordnet: !!b.bankTransactionId, bankTransactionId: undefined }));
}
