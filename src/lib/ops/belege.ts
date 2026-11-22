// Diagnose-Abfrage „belege“ (Ole, 22.11.2026): nur lesend. Stand des Belegabgleichs mit GetMyInvoices.
//   GET /api/ops/diagnose?q=belege[&anbieter=slack]  (mit anbieter: Umsätze und Belege dieses Anbieters samt Zuordnung)

import { prisma } from "@/lib/prisma";
import { ausgabenOhneBeleg } from "@/lib/belege/server";
import { gmiKonfiguriert } from "@/lib/belege/gmi";

export async function belegeStatus(p?: URLSearchParams) {
  const anbieter = (p?.get("anbieter") ?? "").trim();
  if (anbieter.length >= 3) return belegeJeAnbieter(anbieter);
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
  return {
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
