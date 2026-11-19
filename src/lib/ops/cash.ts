// Diagnose (nur lesend, Ole 19.11.2026): Geld auf dem Konto, Bewegungen, Kosten je Monat, Stripe und eine
// Umsatzsteuer-Schätzung aus den Kontoauszügen.
//   GET /api/ops/diagnose?q=cash[&jahr=2026]
// - konten: je Bank-Verbindung Status, Ablauf, letzter Abruf/Fehler (gekürzt), Anzahl Konten und der Kontostand LIVE
//   über Enable Banking (wird nicht gespeichert); Amex nur als CSV (letzter Import, letzte Buchung).
// - bewegungen: je Konto-Art (Geschäftskonto/Amex) für 30 und 90 Tage Eingänge, Ausgaben, Ausgaben je Zweck (brutto).
// - kostenJeMonat: Durchschnitt der letzten 3 vollen Monate der zugeordneten Ausgaben, netto, je Zweck.
// - stripe: Guthaben, offene Rechnungen, Gegenprobe bezahlte Rechnungen im Jahr (mit enthaltener USt).
// - umsatzsteuer: Schätzung der Zahllast (Ist-Versteuerung) mit Annahmen und Unsicherheiten (lib/ops/cash-rechnung.ts).
// Nur Summen und Kategorien: keine Buchungstexte, Gegenparteien, IBANs, Kontonamen oder Kunden.

import { prisma } from "@/lib/prisma";
import * as eb from "@/lib/bank/enable-banking";
import {
  bewegungen,
  datenHinweise,
  kontoArt,
  kostenJeMonat,
  kurzerFehler,
  r2,
  tageZurueck,
  ustAnnahmen,
  ustSchaetzung,
  vorigeMonate,
  type Buchung,
  type KontoArt,
  type Zeitraum,
} from "@/lib/ops/cash-rechnung";

const tag = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

type KontoRef = { uid?: string };

async function kontostaende(conn: { status: string; validUntil: Date | null; accounts: unknown }, jetzt: Date) {
  const konten = (Array.isArray(conn.accounts) ? (conn.accounts as KontoRef[]) : []).filter((a) => typeof a?.uid === "string" && a.uid);
  const grundAllgemein =
    conn.status !== "active"
      ? `Verbindung nicht aktiv (${conn.status})`
      : conn.validUntil && conn.validUntil.getTime() < jetzt.getTime()
        ? "Zustimmung abgelaufen"
        : !eb.enableBankingConfigured()
          ? "Enable Banking nicht eingerichtet"
          : null;
  return Promise.all(
    konten.map(async (a, i) => {
      const konto = `Konto ${i + 1}`;
      if (grundAllgemein) return { konto, kontostand: null, grund: grundAllgemein };
      try {
        const b = eb.pickBalance(await eb.fetchBalances(a.uid!));
        if (!b) return { konto, kontostand: null, grund: "Bank liefert keinen Kontostand" };
        return { konto, kontostand: b.betrag, waehrung: b.waehrung, art: b.art, datum: b.datum };
      } catch (e) {
        return { konto, kontostand: null, grund: kurzerFehler(e) ?? "Fehler" };
      }
    }),
  );
}

type StripeBetrag = { amount: number; currency: string };
const eur = (list: StripeBetrag[] | undefined) => r2((list ?? []).filter((x) => x.currency?.toLowerCase() === "eur").reduce((a, x) => a + x.amount, 0) / 100);

async function stripeStand(jahr: number, jetzt: Date) {
  const { stripeClient } = await import("@/lib/billing");
  const s = stripeClient();
  if (!s) return { eingerichtet: false };
  const out: Record<string, unknown> = { eingerichtet: true };
  try {
    const b = await s.balance.retrieve();
    out.guthaben = { verfuegbar: eur(b.available), ausstehend: eur(b.pending) };
  } catch (e) {
    out.guthaben = { fehler: kurzerFehler(e) };
  }
  try {
    let anzahl = 0;
    let summe = 0;
    let ueberfaellig = 0;
    let naechste: number | null = null;
    for await (const inv of s.invoices.list({ status: "open", limit: 100 })) {
      anzahl++;
      summe += inv.amount_remaining ?? 0;
      if (inv.due_date) {
        if (inv.due_date * 1000 < jetzt.getTime()) ueberfaellig++;
        else if (naechste == null || inv.due_date < naechste) naechste = inv.due_date;
      }
      if (anzahl >= 1000) break;
    }
    out.offeneRechnungen = { anzahl, summe: r2(summe / 100), ueberfaellig, naechsteFaelligkeit: naechste ? tag(new Date(naechste * 1000)) : null };
  } catch (e) {
    out.offeneRechnungen = { fehler: kurzerFehler(e) };
  }
  try {
    // Gegenprobe zur Schätzung: im Jahr bezahlte Rechnungen (nach Zahlungsdatum) und die darin ausgewiesene Steuer
    const von = Date.UTC(jahr, 0, 1) / 1000;
    const bis = Date.UTC(jahr + 1, 0, 1) / 1000;
    let anzahl = 0;
    let brutto = 0;
    let ust = 0;
    let gelesen = 0;
    for await (const inv of s.invoices.list({ status: "paid", created: { gte: von - 90 * 86400, lt: bis }, limit: 100 })) {
      if (++gelesen > 3000) break;
      const paidAt = inv.status_transitions?.paid_at ?? inv.created;
      if (paidAt < von || paidAt >= bis) continue;
      anzahl++;
      brutto += inv.amount_paid ?? 0;
      ust += (inv.total_taxes ?? []).reduce((a, t) => a + (t.amount ?? 0), 0);
    }
    out.bezahltImJahr = { jahr, anzahl, brutto: r2(brutto / 100), darinUst: r2(ust / 100) };
  } catch (e) {
    out.bezahltImJahr = { fehler: kurzerFehler(e) };
  }
  return out;
}

export async function cashDiagnose(params: URLSearchParams, opts: { jetzt?: Date } = {}) {
  const jetzt = opts.jetzt ?? new Date();
  const jp = Number(params.get("jahr"));
  const jahr = Number.isInteger(jp) && jp >= 2020 && jp <= 2100 ? jp : Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric" }).format(jetzt));
  const monate = vorigeMonate(jetzt, 3);
  const ab = new Date(Math.min(Date.UTC(jahr, 0, 1), tageZurueck(jetzt, 90).getTime(), new Date(`${monate[0]}-01T00:00:00Z`).getTime()));
  const bis = new Date(Math.max(jetzt.getTime(), Date.UTC(jahr, 11, 31)));

  const [verbindungen, ersetzt, rows, gruppen, regeln] = await Promise.all([
    prisma.bankConnection.findMany({
      where: { status: { notIn: ["revoked", "pending"] } },
      orderBy: { createdAt: "desc" },
      select: { aspspName: true, status: true, validUntil: true, lastSyncAt: true, lastError: true, accounts: true, createdAt: true },
    }),
    prisma.bankConnection.count({ where: { status: "revoked" } }),
    prisma.bankTransaction.findMany({
      where: { bookingDate: { gte: ab, lte: bis } },
      select: { accountKey: true, bookingDate: true, amount: true, status: true, costPurpose: true, vatIncluded: true, counterparty: true, purpose: true },
    }),
    prisma.bankTransaction.groupBy({ by: ["accountKey"], where: { bookingDate: { lte: bis } }, _min: { bookingDate: true }, _max: { bookingDate: true, createdAt: true }, _count: { _all: true } }),
    prisma.costRule.findMany({ where: { action: "ignore" }, select: { pattern: true, label: true, counterpartyOnly: true } }),
  ]);

  const buchungen: Buchung[] = rows.map((r) => ({ ...r, amount: Number(r.amount) }));
  const jeArt = (art: KontoArt) => buchungen.filter((b) => kontoArt(b.accountKey) === art);

  // Zeitraum der Daten je Konto-Art (über alle Konten dieser Art)
  const zeitraum = new Map<KontoArt, Zeitraum & { anzahl: number; letzterImport: Date | null }>();
  for (const g of gruppen) {
    const art = kontoArt(g.accountKey);
    const z = zeitraum.get(art) ?? { art, erste: null, letzte: null, anzahl: 0, letzterImport: null };
    const min = g._min.bookingDate;
    const max = g._max.bookingDate;
    if (min && (!z.erste || min < z.erste)) z.erste = min;
    if (max && (!z.letzte || max > z.letzte)) z.letzte = max;
    if (g._max.createdAt && (!z.letzterImport || g._max.createdAt > z.letzterImport)) z.letzterImport = g._max.createdAt;
    z.anzahl += g._count._all;
    zeitraum.set(art, z);
  }

  const [konten, stripe] = await Promise.all([
    Promise.all(
      verbindungen.map(async (c) => {
        const staende = await kontostaende(c, jetzt);
        return {
          bank: c.aspspName,
          status: c.status,
          verbundenSeit: tag(c.createdAt),
          gueltigBis: tag(c.validUntil),
          letzterAbruf: c.lastSyncAt?.toISOString() ?? null,
          letzterFehler: kurzerFehler(c.lastError),
          anzahlKonten: Array.isArray(c.accounts) ? c.accounts.length : 0,
          kontostaende: staende,
        };
      }),
    ),
    stripeStand(jahr, jetzt).catch((e) => ({ fehler: kurzerFehler(e) })),
  ]);

  const bekannte = konten.flatMap((k) => k.kontostaende).filter((k) => k.kontostand != null && (!("waehrung" in k) || k.waehrung === "EUR"));
  const alleStaende = konten.flatMap((k) => k.kontostaende);
  const amex = zeitraum.get("amex");

  const bew = (art: KontoArt) => {
    const list = jeArt(art);
    return { tage30: bewegungen(list, tageZurueck(jetzt, 30)), tage90: bewegungen(list, tageZurueck(jetzt, 90)) };
  };

  const kosten = kostenJeMonat(buchungen, monate);
  const ersteBuchung = [...zeitraum.values()].map((z) => z.erste).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];
  const kostenHinweis =
    !ersteBuchung || ersteBuchung.getTime() > new Date(`${monate[0]}-01T00:00:00Z`).getTime() + 3 * 86_400_000
      ? `Buchungen erst ab ${tag(ersteBuchung) ?? "nie"}: Durchschnitt über ${monate.length} Monate ist zu niedrig.`
      : null;

  const ust = ustSchaetzung(buchungen, { jahr, regeln });
  const zeitraeume = (["commerzbank", "amex"] as KontoArt[]).map((art) => zeitraum.get(art) ?? { art, erste: null, letzte: null, anzahl: 0, letzterImport: null });
  const hinweise = datenHinweise(zeitraeume, jahr, jetzt);
  const aktiv = verbindungen.find((v) => v.status === "active");
  if (!aktiv) hinweise.push("Keine aktive Bankverbindung: neue Buchungen kommen nur per CSV.");
  if (ust.anzahlVermuteteEinlagen > 0) hinweise.push(`${ust.anzahlVermuteteEinlagen} Eingänge als Einlage vermutet (Name oder Stichwort), nicht als Umsatz gezählt: bitte prüfen.`);
  if (ust.unzugeordnet.anzahl > 0) hinweise.push(`${ust.unzugeordnet.anzahl} Ausgaben noch nicht zugeordnet: Vorsteuer bis ${ust.unzugeordnet.vorsteuerHoechstens.toFixed(2)} € fehlt eventuell.`);
  if (ust.moeglicheDoppelte.anzahl > 0)
    hinweise.push(`${ust.moeglicheDoppelte.anzahl} Geschäftskonto-Buchungen vermutlich doppelt (CSV und Bankverbindung), darin Eingänge ${ust.moeglicheDoppelte.eingaenge.toFixed(2)} €: Ausgangs-USt eventuell zu hoch.`);
  if (ust.finanzamt.unklar > 0) hinweise.push(`Finanzamt-Zahlungen ohne erkennbare Steuerart: ${ust.finanzamt.unklar.toFixed(2)} €.`);

  return {
    hinweis: "Nur lesend. Beträge in Euro. Umsatzsteuer ist eine Schätzung aus den Kontoauszügen: Steuerberater prüft.",
    stand: jetzt.toISOString(),
    konten: {
      verbindungen: konten,
      ersetzteVerbindungen: ersetzt,
      kontostandSumme: bekannte.length ? r2(bekannte.reduce((a, k) => a + (k.kontostand ?? 0), 0)) : null,
      kontostandVollstaendig: alleStaende.length > 0 && bekannte.length === alleStaende.length,
      amexCsv: amex ? { buchungen: amex.anzahl, ersteBuchung: tag(amex.erste), letzteBuchung: tag(amex.letzte), letzterImport: tag(amex.letzterImport) } : null,
    },
    bewegungen: { commerzbank: bew("commerzbank"), amex: bew("amex") },
    kostenJeMonat: { ...kosten, art: "netto, zugeordnete Ausgaben (ki in software)", hinweis: kostenHinweis },
    stripe,
    umsatzsteuer: {
      schaetzung: true,
      jahr: ust.jahr,
      zahllastGeschaetzt: ust.zahllastGeschaetzt,
      zahllastWennUnklarUst: ust.zahllastWennUnklarUst,
      ausgangsUst: ust.ausgangsUst,
      vorsteuer: ust.vorsteuer,
      bereitsGezahltUst: ust.bereitsGezahltUst,
      grundlagen: { kundenzahlungen: ust.kundenzahlungen, ausgaben: ust.ausgaben, finanzamt: ust.finanzamt, nichtAlsUmsatz: ust.nichtAlsUmsatz },
      annahmen: ustAnnahmen(ust.jahr),
      unsicherheit: {
        unzugeordneteAusgaben: ust.unzugeordnet,
        einlagen: { perRegel: ust.nichtAlsUmsatz.einlagenPerRegel, vermutet: ust.nichtAlsUmsatz.einlagenVermutet },
        finanzamtUnklar: ust.finanzamt.unklar,
        moeglicheDoppelte: ust.moeglicheDoppelte,
        zeitraum: zeitraeume.map((z) => ({ konto: z.art, ersteBuchung: tag(z.erste), letzteBuchung: tag(z.letzte) })),
        verbindungSeit: tag(aktiv?.createdAt) ?? null,
        hinweise,
      },
    },
  };
}
