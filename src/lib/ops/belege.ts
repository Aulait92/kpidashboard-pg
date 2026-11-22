// Diagnose-Abfrage „belege“ (Ole, 22.11.2026): nur lesend. Stand des Belegabgleichs mit GetMyInvoices.
//   GET /api/ops/diagnose?q=belege

import { prisma } from "@/lib/prisma";
import { ausgabenOhneBeleg } from "@/lib/belege/server";
import { gmiKonfiguriert } from "@/lib/belege/gmi";

export async function belegeStatus() {
  const [gesamt, zugeordnet, jeTyp, ohne, letzte] = await Promise.all([
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
  };
}
