// Diagnose-Abfrage „bank-anbieter“ (Ole, 22.11.2026, Belege automatisieren): nur lesend. Ausgaben je Gegenpartei aus
// allen Kontoumsätzen (Commerzbank, Amex, N26-Import) ab einem Datum: Anzahl, Summe, Konten, Kostenart, erster/letzter
// Umsatz. Grundlage, um je Anbieter die Rechnungen zu suchen bzw. das Belegwerkzeug einzurichten.
//   GET /api/ops/diagnose?q=bank-anbieter[&ab=2026-01-01][&detail=klarna]
// Mit detail=<Teil des Namens> zusätzlich die einzelnen Umsätze dieses Anbieters samt Verwendungszweck (z. B. um zu klären,
// wofür Zahlungen waren).

import { prisma } from "@/lib/prisma";

const norm = (s: string | null) =>
  (s ?? "(ohne Name)")
    .replace(/\s+/g, " ")
    .replace(/[*#].*$/, "")
    .replace(/\b(pending|help\.uber\.c\S*)\b/gi, "")
    .trim()
    .toLowerCase() || "(ohne name)";

export async function bankAnbieter(p: URLSearchParams) {
  const ab = /^\d{4}-\d{2}-\d{2}$/.test(p.get("ab") ?? "") ? new Date(`${p.get("ab")}T00:00:00Z`) : new Date("2026-01-01T00:00:00Z");
  const rows = await prisma.bankTransaction.findMany({
    // &eingang=1: Zahlungseingänge je Zahler statt Ausgaben je Anbieter (Ole, 23.11.2026: Umsatz je Kunde)
    where: { bookingDate: { gte: ab }, amount: p.get("eingang") === "1" ? { gt: 0 } : { lt: 0 } },
    select: {
      accountKey: true,
      bookingDate: true,
      amount: true,
      counterparty: true,
      purpose: true,
      costPurpose: true,
      status: true,
      note: true,
      beleg: { select: { nummer: true, datum: true, brutto: true, netto: true } },
    },
  });
  const m = new Map<string, { anbieter: string; anzahl: number; summe: number; konten: Set<string>; kostenarten: Set<string>; status: Set<string>; erster: string; letzter: string }>();
  for (const r of rows) {
    const k = norm(r.counterparty);
    const tag = r.bookingDate.toISOString().slice(0, 10);
    const e = m.get(k) ?? { anbieter: r.counterparty ?? "(ohne Name)", anzahl: 0, summe: 0, konten: new Set(), kostenarten: new Set(), status: new Set(), erster: tag, letzter: tag };
    e.anzahl++;
    e.summe += Number(r.amount);
    e.konten.add(r.accountKey.startsWith("csv:") ? r.accountKey.slice(4) : "bank");
    if (r.costPurpose) e.kostenarten.add(r.costPurpose);
    e.status.add(r.status);
    if (tag < e.erster) e.erster = tag;
    if (tag > e.letzter) e.letzter = tag;
    m.set(k, e);
  }
  const anbieter = [...m.values()]
    .map((e) => ({ ...e, summe: Math.round(e.summe * 100) / 100, konten: [...e.konten], kostenarten: [...e.kostenarten], status: [...e.status] }))
    .sort((a, b) => a.summe - b.summe);
  const detail = (p.get("detail") ?? "").trim().toLowerCase();
  const einzeln = detail
    ? rows
        .filter((r) => norm(r.counterparty).includes(detail))
        .sort((a, b) => a.bookingDate.getTime() - b.bookingDate.getTime())
        .map((r) => ({
          datum: r.bookingDate.toISOString().slice(0, 10),
          betrag: Number(r.amount),
          konto: r.accountKey.startsWith("csv:") ? r.accountKey.slice(4) : "bank",
          anbieter: r.counterparty,
          zweck: r.purpose,
          status: r.status,
          notiz: r.note,
          // Beleg zur Buchung (Belegnummer, Rechnungsdatum, Betrag laut Beleg), sonst null
          beleg: r.beleg
            ? { nummer: r.beleg.nummer, rechnungsdatum: r.beleg.datum?.toISOString().slice(0, 10) ?? null, brutto: r.beleg.brutto != null ? Number(r.beleg.brutto) : null, netto: r.beleg.netto != null ? Number(r.beleg.netto) : null }
            : null,
        }))
    : undefined;
  return { ab: ab.toISOString().slice(0, 10), umsaetze: rows.length, anbieter, ...(einzeln ? { einzeln } : {}) };
}
