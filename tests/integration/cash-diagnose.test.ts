// Diagnose q=cash gegen die Datenbank: Testbuchungen (Kunden-Eingang, Stripe-Auszahlung, Ole-Einlage, Finanzamt,
// Ausgaben mit/ohne USt, Amex), Kontostand live (Enable Banking gemockt), Stripe gemockt. Nur Summen im JSON:
// keine Gegenparteien, Verwendungszwecke, IBANs oder Kontonamen; nichts wird geschrieben.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ balances: [] as string[] }));

vi.mock("@/lib/bank/enable-banking", async (orig) => {
  const o = await orig<typeof import("@/lib/bank/enable-banking")>();
  return {
    ...o,
    enableBankingConfigured: () => true,
    fetchBalances: vi.fn(async (uid: string) => {
      mocks.balances.push(uid);
      if (uid.endsWith("-2")) throw new o.EnableBankingError("Enable Banking: consent expired for DE89370400440532013000 token abcdefghijklmnopqrstuvwxyz0123456789", 401);
      return [
        { balance_amount: { amount: "1234.56", currency: "EUR" }, balance_type: "ITAV" },
        { balance_amount: { amount: "1200.00", currency: "EUR" }, balance_type: "CLBD", reference_date: "2034-06-14" },
      ];
    }),
  };
});

async function* liste<T>(items: T[]) {
  for (const i of items) yield i;
}
const fakeStripe = {
  balance: { retrieve: async () => ({ available: [{ amount: 123456, currency: "eur" }, { amount: 999, currency: "usd" }], pending: [{ amount: 5000, currency: "eur" }] }) },
  invoices: {
    list: (p: { status: string }) =>
      p.status === "open"
        ? liste([
            { amount_remaining: 119000, due_date: Date.UTC(2034, 5, 1) / 1000, customer_email: "kundin@example.org", customer_name: "Kundin Geheim" },
            { amount_remaining: 50000, due_date: Date.UTC(2034, 6, 1) / 1000, customer_email: "kunde@example.org", customer_name: "Kunde Geheim" },
            { amount_remaining: 1000, due_date: null, customer_email: null, customer_name: null },
          ])
        : liste([
            { amount_paid: 119000, total_taxes: [{ amount: 19000 }], created: Date.UTC(2034, 2, 1) / 1000, status_transitions: { paid_at: Date.UTC(2034, 2, 2) / 1000 }, customer_name: "Kundin Geheim" },
            { amount_paid: 23800, total_taxes: [{ amount: 3800 }], created: Date.UTC(2033, 11, 20) / 1000, status_transitions: { paid_at: Date.UTC(2033, 11, 21) / 1000 } },
          ]),
  },
};
vi.mock("@/lib/billing", async (orig) => ({ ...(await orig<typeof import("@/lib/billing")>()), stripeClient: () => fakeStripe }));

import { GET } from "@/app/api/ops/diagnose/route";
import { cashDiagnose } from "@/lib/ops/cash";
import { prisma } from "@/lib/prisma";
import { requireTestDb } from "./db";

const TOKEN = "test-read-token-0123456789-0123456789-abcdef";
const tag = Math.random().toString(36).slice(2, 10);
const GK1 = `eb-cash-${tag}-1`;
const GK2 = `eb-cash-${tag}-2`;
const AMEX = `csv:amex-cash-${tag}`;
const JETZT = new Date("2034-06-15T10:00:00Z");
const req = (q: string, token?: string) => new Request(`https://app.test/api/ops/diagnose?q=${q}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

type Tx = { key?: string; d: string; a: number; cp?: string; p?: string | null; st?: string; zweck?: string; ust?: boolean };
const BUCHUNGEN: Tx[] = [
  { d: "2034-01-02", a: 1190, cp: `Maklerbuero Kundin ${tag}`, p: `Rechnung RE-${tag}` },
  { d: "2034-03-05", a: 2380, cp: "STRIPE", p: `Stripe Payout ${tag}` },
  { d: "2034-04-01", a: 5000, cp: "Ole Kannapinn", p: `Einlage ${tag}` },
  { d: "2034-04-02", a: 1000, cp: `Privatkonto ${tag}`, p: "Darlehen Gesellschafter" },
  { d: "2034-05-10", a: -300, cp: `Eigenes Konto ${tag}`, p: "Umbuchung", st: "ignoriert" },
  { key: GK2, d: "2034-05-10", a: 300, cp: `Eigenes Konto ${tag}`, p: "Umbuchung" },
  { d: "2034-02-10", a: -500, cp: "Finanzamt Hamburg-Mitte", p: "StNr 12/345/67890 USt 12.33", st: "ignoriert" },
  { d: "2034-03-10", a: -200, cp: "Finanzamt Hamburg-Mitte", p: "Einkommensteuer Vz 2034", st: "ignoriert" },
  { d: "2034-03-11", a: -50, cp: "Finanzamt Hamburg-Mitte", p: `Zahlung ${tag}`, st: "ignoriert" },
  { d: "2034-05-20", a: 100, cp: "Finanzamt Hamburg-Mitte", p: "Erstattung USt 03.34" },
  { d: "2034-05-25", a: 20, cp: `Haendler ${tag}`, p: "Rückerstattung Bestellung" },
  { d: "2034-05-15", a: -119, cp: `Telekom Deutschland ${tag}`, p: "Mobilfunk", st: "zugeordnet", zweck: "betrieb", ust: true },
  { d: "2034-06-01", a: -238, cp: `Railway Corp ${tag}`, p: "Hosting", st: "zugeordnet", zweck: "software" },
  { d: "2034-06-05", a: -59.5, cp: `Unbekannt ${tag}`, p: "Kartenzahlung", st: "neu" },
  { d: "2034-06-02", a: -400, cp: "Meta Platforms Ireland", p: `FB Ads ${tag}`, st: "ignoriert" },
  { key: AMEX, d: "2034-04-15", a: -238, cp: `Papierkram ${tag}`, p: "Abo", st: "zugeordnet", zweck: "betrieb", ust: true },
  { key: AMEX, d: "2034-05-03", a: 500, cp: "Zahlung erhalten. Vielen Dank", p: null },
  { key: AMEX, d: "2034-06-10", a: -47.6, cp: `KI Dienst ${tag}`, p: "Abo", st: "zugeordnet", zweck: "ki", ust: true },
];

describe("Diagnose cash", () => {
  const before = process.env.OPS_READ_TOKEN;
  let connId = "";
  let regelAngelegt = false;
  const geheim = [tag, "DE89370400440532013000", "Kannapinn", "Finanzamt Hamburg", "Maklerbuero", "Stripe Payout", "Telekom", "Geheim", "kundin@example.org", "Hamburg-Mitte", "Railway Corp", "Papierkram", "StNr", "Rücklage", "Zahlung erhalten"];

  beforeAll(async () => {
    requireTestDb();
    process.env.OPS_READ_TOKEN = TOKEN;
    await prisma.bankTransaction.deleteMany({ where: { bookingDate: { gte: new Date("2033-12-01"), lte: new Date("2034-12-31") } } });
    // Regel aus der Migration „kosten_regeln“ (Privat-Überweisungen von/an Ole), falls die Test-DB sie nicht hat
    if (!(await prisma.costRule.findUnique({ where: { pattern: "ole kannapinn" } }))) {
      await prisma.costRule.create({ data: { pattern: "ole kannapinn", action: "ignore", counterpartyOnly: true, label: "Privat" } });
      regelAngelegt = true;
    }
    const c = await prisma.bankConnection.create({
      data: {
        aspspName: `Commerzbank`,
        status: "active",
        validUntil: new Date("2034-12-01"),
        lastSyncAt: new Date("2034-06-15T04:00:00Z"),
        lastError: "Enable Banking: HTTP 500 for DE89370400440532013000",
        createdAt: new Date("2034-01-01T00:00:00Z"),
        accounts: [
          { uid: GK1, name: "Ole Kannapinn Geschäftskonto", iban: "DE89 … 3000", currency: "EUR" },
          { uid: GK2, name: "Ole Kannapinn Rücklage", iban: "DE89 … 3001", currency: "EUR" },
        ],
      },
    });
    connId = c.id;
    let i = 0;
    for (const t of BUCHUNGEN) {
      const key = t.key ?? GK1;
      await prisma.bankTransaction.create({
        data: {
          accountKey: key,
          externalId: `cash-${tag}-${i++}`,
          source: key.startsWith("csv:") ? "csv" : "enablebanking",
          connectionId: key.startsWith("csv:") ? null : connId,
          bookingDate: new Date(`${t.d}T00:00:00Z`),
          amount: t.a,
          counterparty: t.cp ?? null,
          purpose: t.p ?? null,
          status: t.st ?? (t.a > 0 ? "ignoriert" : "neu"),
          costPurpose: t.zweck ?? null,
          vatIncluded: !!t.ust,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.bankTransaction.deleteMany({ where: { accountKey: { in: [GK1, GK2, AMEX] } } });
    await prisma.bankConnection.deleteMany({ where: { id: connId } });
    if (regelAngelegt) await prisma.costRule.deleteMany({ where: { pattern: "ole kannapinn" } });
    process.env.OPS_READ_TOKEN = before;
  });

  it("ohne oder mit falschem Schlüssel: 401", async () => {
    expect((await GET(req("cash"))).status).toBe(401);
    expect((await GET(req("cash", "falsch"))).status).toBe(401);
  });

  it("über die API erreichbar", async () => {
    const r = await GET(req("cash", TOKEN));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { q: string; data: { umsatzsteuer: { schaetzung: boolean } } };
    expect(j.q).toBe("cash");
    expect(j.data.umsatzsteuer.schaetzung).toBe(true);
  });

  it("USt-Schätzung, Bewegungen, Kosten, Konten und Stripe aus den Testbuchungen", async () => {
    const vorher = { n: await prisma.bankTransaction.count(), c: await prisma.bankConnection.findUniqueOrThrow({ where: { id: connId } }) };
    const d = await cashDiagnose(new URLSearchParams("jahr=2034"), { jetzt: JETZT });

    const u = d.umsatzsteuer;
    expect(u.jahr).toBe(2034);
    expect(u.ausgangsUst).toBe(570); // (1.190 + 2.380) × 19/119
    expect(u.vorsteuer).toBe(64.6); // (119 + 238 + 47,60) × 19/119
    expect(u.bereitsGezahltUst).toBe(400); // 500 − 100 Erstattung
    expect(u.zahllastGeschaetzt).toBe(105.4);
    expect(u.zahllastWennUnklarUst).toBe(55.4);
    expect(u.grundlagen.kundenzahlungen).toEqual({ brutto: 3570, stripeAuszahlungen: 2380, direkt: 1190, anzahl: 2 });
    expect(u.grundlagen.ausgaben).toEqual({ mitUstBrutto: 404.6, ohneUstBrutto: 238, ignoriertBrutto: 700 });
    expect(u.grundlagen.finanzamt).toMatchObject({ ustZahlungen: 500, ustErstattungen: 100, sonstigeSteuern: 200, unklar: 50 });
    expect(u.unsicherheit.einlagen).toEqual({ perRegel: 5000, vermutet: 1000 });
    expect(u.unsicherheit.unzugeordneteAusgaben).toEqual({ anzahl: 1, brutto: 59.5, vorsteuerHoechstens: 9.5 });
    expect(u.unsicherheit.verbindungSeit).toBe("2034-01-01");
    expect(u.unsicherheit.hinweise.join(" ")).toMatch(/Amex: Buchungen erst ab 2034-04-15/);
    expect(u.annahmen.length).toBeGreaterThan(5);

    // 30 Tage ab 16.05.2034
    expect(d.bewegungen.commerzbank.tage30).toEqual({
      eingaenge: 120,
      ausgaben: 697.5,
      saldo: -577.5,
      ausgabenNachZweck: { ppl: 0, software: 238, akquise: 0, betrieb: 0, ignoriert: 400, neu: 59.5 },
    });
    expect(d.bewegungen.amex.tage90).toMatchObject({ eingaenge: 500, ausgaben: 285.6 });

    // März bis Mai: Telekom 100 + Papierkram 200 netto = 300 / 3
    expect(d.kostenJeMonat.monate).toEqual(["2034-03", "2034-04", "2034-05"]);
    expect(d.kostenJeMonat.jeZweck).toEqual({ ppl: 0, software: 0, akquise: 0, betrieb: 100 });

    const v = d.konten.verbindungen.find((x) => x.verbundenSeit === "2034-01-01")!;
    expect(v).toMatchObject({ bank: "Commerzbank", status: "active", anzahlKonten: 2, gueltigBis: "2034-12-01" });
    expect(v.kontostaende[0]).toMatchObject({ konto: "Konto 1", kontostand: 1200, art: "CLBD", waehrung: "EUR" });
    expect(v.kontostaende[1]).toMatchObject({ konto: "Konto 2", kontostand: null });
    expect(v.letzterFehler).toMatch(/HTTP 500/);
    expect(d.konten.kontostandVollstaendig).toBe(false);
    expect(d.konten.amexCsv).toMatchObject({ buchungen: 3, letzteBuchung: "2034-06-10" });

    expect(d.stripe).toMatchObject({
      guthaben: { verfuegbar: 1234.56, ausstehend: 50 },
      offeneRechnungen: { anzahl: 3, summe: 1700, ueberfaellig: 1, naechsteFaelligkeit: "2034-07-01" },
      bezahltImJahr: { jahr: 2034, anzahl: 1, brutto: 1190, darinUst: 190 },
    });

    // Keine Einzeldaten im JSON
    const json = JSON.stringify(d);
    for (const g of geheim) expect(json, g).not.toContain(g);
    expect(json).not.toMatch(/DE\d{2}/);

    // nur lesend: nichts geschrieben
    expect(await prisma.bankTransaction.count()).toBe(vorher.n);
    expect((await prisma.bankConnection.findUniqueOrThrow({ where: { id: connId } })).updatedAt).toEqual(vorher.c.updatedAt);
  });

  it("Stripe-Fehler werden abgefangen", async () => {
    const orig = fakeStripe.balance.retrieve;
    fakeStripe.balance.retrieve = async () => {
      throw new Error("Invalid API Key provided: sk_live_abcdefghijklmnop");
    };
    try {
      const d = await cashDiagnose(new URLSearchParams("jahr=2034"), { jetzt: JETZT });
      expect(d.stripe).toMatchObject({ guthaben: { fehler: expect.stringContaining("Invalid API Key") } });
      expect(JSON.stringify(d)).not.toContain("sk_live");
    } finally {
      fakeStripe.balance.retrieve = orig;
    }
  });
});
