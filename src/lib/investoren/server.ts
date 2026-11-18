// Investoren-Kennzahlen aus der Datenbank (Geld › Auswertung, /admin/neu/zahlen/auswertung): Umsatzbuch und Kosten wie
// die Übersicht (zahlen.ts loadLedger/loadCosts), Rechnung im Rechenkern (kennzahlen.ts), dazu die Datenlücken, die
// eine Zahl unsicher machen. Gleiche Quelle für Seite, Export (CSV/PDF) und Diagnose q=investoren.

import { prisma } from "@/lib/prisma";
import { FIRST_MONTH, loadCosts, loadKpiSettings, loadLedger, type MonthCosts } from "@/lib/zahlen";
import { costsForSicht, rowsForSicht, type Sicht } from "@/lib/zahlen-sicht";
import { monthLabel } from "@/lib/revenue-ledger";
import { CAC_FENSTER, investorKennzahlen, type InvestorKennzahlen } from "@/lib/investoren/kennzahlen";

export type Luecke = {
  /** Kurzschlüssel (Diagnose, Tests) */
  key: string;
  /** Ein Satz, was fehlt und was es bewirkt */
  text: string;
  anzahl?: number;
  /** Wo man es behebt */
  href?: string;
  link?: string;
};

export type InvestorenDaten = {
  generatedAt: string;
  sicht: Sicht;
  k: InvestorKennzahlen;
  gruender: { stunden: number; satz: number; monat: number };
  pplPilot: { from: string; to: string | null };
  luecken: Luecke[];
  /** KI-Dienste je Monat aus Bank & Karten (netto, in den Software-Kosten enthalten) */
  kiJeMonat: { month: string; ki: number }[];
};

const DAY = 86_400_000;

/** Sicht der Auswertung: Standard Kerngeschäft (wie die Investoren-Ansicht der Übersicht). */
export function parseInvestorSicht(v: string | null | undefined): Sicht {
  return v === "gesamt" ? "gesamt" : "kern";
}

export async function loadInvestoren(now = new Date(), sicht: Sicht = "kern"): Promise<InvestorenDaten> {
  const settings = await loadKpiSettings();
  const { ledger } = await loadLedger(now);
  const keys = ledger.months.map((m) => m.key);
  const { costs } = await loadCosts(keys, settings, now);
  const gruenderMonat = (settings.founderHoursPerWeek * 52 * settings.founderHourlyRate) / 12;
  const k = investorKennzahlen({
    rows: rowsForSicht(ledger.rows, sicht),
    rowsAlle: ledger.rows,
    months: keys,
    current: ledger.current,
    kosten: costsForSicht(costs, sicht),
    kostenAlle: costs,
    gruenderMonat,
  });
  return {
    generatedAt: now.toISOString(),
    sicht,
    k,
    gruender: { stunden: settings.founderHoursPerWeek, satz: settings.founderHourlyRate, monat: Math.round(gruenderMonat * 100) / 100 },
    pplPilot: { from: FIRST_MONTH, to: settings.pplPilotEnd },
    luecken: await datenluecken(k, costs, now),
    kiJeMonat: costs.map((c) => ({ month: c.month, ki: c.ki ?? 0 })),
  };
}

/** Datenlücken, die eine Kennzahl unsicher machen (nur Anzahlen, mit Weg zur Behebung). */
export async function datenluecken(k: InvestorKennzahlen, costs: MonthCosts[], now = new Date()): Promise<Luecke[]> {
  const out: Luecke[] = [];
  const [kandidatenOhneGebuehr, offeneBank, letzteBank, archiviertOhneEnde, retainerAktiv, angenommen] = await Promise.all([
    // Live mit Paket Betreuung/Software, aber ohne Betreuungsgebühr und ohne Angebot (fehlt im MRR); wie zahlen.ts missingRetainer
    prisma.customer.findMany({
      where: { archived: false, isTest: false, plan: { in: ["software", "service"] }, retainerMonthly: null, OR: [{ onboarding: { liveAt: { not: null } } }, { retainerStart: { lte: now } }] },
      select: { onboarding: { select: { offerId: true } } },
    }),
    prisma.bankTransaction.count({ where: { status: "neu", amount: { lt: 0 } } }),
    prisma.bankTransaction.findFirst({ orderBy: { bookingDate: "desc" }, select: { bookingDate: true } }),
    // Archivierte Retainer ohne Vertragsende von Hand: Ende nur aus Abo oder letztem Lead geschätzt
    prisma.customer.count({ where: { archived: true, isTest: false, plan: { not: "internal" }, retainerMonthly: { not: null }, retainerEnd: null } }),
    // Laufende Retainer (ohne Vertragsende oder Ende in der Zukunft)
    prisma.customer.findMany({
      where: { archived: false, isTest: false, plan: { not: "internal" }, retainerMonthly: { not: null }, OR: [{ retainerEnd: null }, { retainerEnd: { gt: now } }] },
      select: { onboarding: { select: { offerId: true } } },
    }),
    prisma.offer.findMany({ where: { status: "accepted" }, select: { id: true } }),
  ]);
  const ok = new Set(angenommen.map((o) => o.id));
  const mitAngebot = (c: { onboarding: { offerId: string | null } | null }) => !!c.onboarding?.offerId && ok.has(c.onboarding.offerId);
  const ohneGebuehr = kandidatenOhneGebuehr.filter((c) => !mitAngebot(c)).length;
  // Retainer ohne angenommenes Angebot: Software-Anteil unbekannt, alles zählt als Betreuung
  const ohneAngebot = retainerAktiv.filter((c) => !mitAngebot(c)).length;
  if (ohneGebuehr) out.push({ key: "ohne-betreuungsgebuehr", anzahl: ohneGebuehr, text: `${ohneGebuehr} ${ohneGebuehr === 1 ? "Kunde" : "Kunden"} live ohne Betreuungsgebühr, fehlt im MRR.`, href: "/admin/neu/zahlen/umsatz", link: "Umsatz & Buchungen" });
  if (offeneBank) out.push({ key: "bank-offen", anzahl: offeneBank, text: `${offeneBank} ${offeneBank === 1 ? "Ausgabe" : "Ausgaben"} auf Konto oder Karte noch nicht zugeordnet, Marge und CAC können zu gut aussehen.`, href: "/admin/neu/zahlen/kosten/zuordnen", link: "Ausgaben zuordnen" });
  if (!letzteBank) out.push({ key: "bank-fehlt", text: "Kein Bankkonto verbunden: Tools, KI und Server fehlen in Marge und CAC.", href: "/admin/neu/zahlen/kosten", link: "Kosten & Bank" });
  else if (now.getTime() - letzteBank.bookingDate.getTime() > 35 * DAY) {
    out.push({ key: "bank-alt", text: `Letzte Bankbuchung vom ${letzteBank.bookingDate.toLocaleDateString("de-DE")}: Kosten danach fehlen.`, href: "/admin/neu/zahlen/kosten", link: "Kosten & Bank" });
  }
  if (k.cac.neukunden > 0 && !(k.cac.kosten > 0)) {
    out.push({ key: "cac-ohne-kosten", text: `Keine Kosten der Kundengewinnung in den letzten ${CAC_FENSTER} Monaten erfasst, CAC wäre 0 €.`, href: "/admin/neu/zahlen/kosten", link: "Kosten & Bank" });
  }
  const kiLetzter = costs.find((c) => c.month === k.lastComplete)?.ki ?? 0;
  if (letzteBank && !(kiLetzter > 0)) {
    out.push({ key: "ki-fehlt", text: `Keine KI-Kosten im ${monthLabel(k.lastComplete, true)} erkannt (Zweck „Direkt: KI-Dienste“).`, href: "/admin/neu/zahlen/kosten/zuordnen", link: "Ausgaben zuordnen" });
  }
  if (archiviertOhneEnde) out.push({ key: "ende-geschaetzt", anzahl: archiviertOhneEnde, text: `${archiviertOhneEnde} archivierte ${archiviertOhneEnde === 1 ? "Kunde" : "Kunden"} ohne Vertragsende von Hand, Ende aus Abo oder letztem Lead geschätzt.` });
  if (ohneAngebot) out.push({ key: "ohne-angebot", anzahl: ohneAngebot, text: `${ohneAngebot} ${ohneAngebot === 1 ? "Kunde" : "Kunden"} ohne Online-Angebot: Software-Anteil unbekannt, zählt als Betreuung.` });
  return out;
}
