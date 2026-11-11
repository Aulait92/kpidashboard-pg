import { generateKeyPairSync, createVerify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classify, matchRule, netCost, overlappingRecurring, suggestPattern, type Rule } from "@/lib/bank/rules";
import { parseAmount, parseBankCsv, parseDate } from "@/lib/bank/csv";
import { fetchTransactions, makeJwt, normalizePem } from "@/lib/bank/enable-banking";
import { fromEnableBanking } from "@/lib/bank/server";

describe("Bank: Regeln", () => {
  it("Standardregeln: Tools, Meta ignorieren, Einnahmen ignorieren", () => {
    expect(classify({ amount: -21.5, counterparty: "ANTHROPIC, PBC", purpose: "Claude Pro" }, [])).toMatchObject({ status: "zugeordnet", costPurpose: "software" });
    expect(classify({ amount: -97, counterparty: "Instantly.ai", purpose: null }, [])).toMatchObject({ status: "zugeordnet", costPurpose: "akquise" });
    expect(classify({ amount: -500, counterparty: "FACEBK *ABC123", purpose: "Facebook Ads" }, [])).toMatchObject({ status: "ignoriert" });
    expect(classify({ amount: -1234, counterparty: "AMERICAN EXPRESS EUROPE", purpose: "Abrechnung" }, [])).toMatchObject({ status: "ignoriert" });
    expect(classify({ amount: 2000, counterparty: "Stripe", purpose: "Auszahlung" }, [])).toMatchObject({ status: "ignoriert", reason: "Einnahme" });
    expect(classify({ amount: -40, counterparty: "Bäckerei Schmidt", purpose: null }, [])).toMatchObject({ status: "neu" });
  });
  it("eigene Regel geht vor, längeres Muster vor kürzerem", () => {
    const own: Rule[] = [
      { id: "a", pattern: "google", action: "betrieb" },
      { id: "b", pattern: "google ads", action: "akquise" },
    ];
    expect(matchRule({ counterparty: "Google Ads Ireland", purpose: null }, own)?.id).toBe("b");
    expect(matchRule({ counterparty: "Google Cloud", purpose: null }, own)?.id).toBe("a");
    expect(classify({ amount: -10, counterparty: "LinkedIn Premium", purpose: null }, [{ pattern: "linkedin", action: "betrieb" }]).costPurpose).toBe("betrieb");
  });
  it("netto aus brutto (inkl. 19 % USt) und Einnahmen = 0", () => {
    expect(netCost(-119, true)).toBe(100);
    expect(netCost(-119, false)).toBe(119);
    expect(netCost(50, true)).toBe(0);
  });
  it("Muster-Vorschlag ohne Nummern und Rechtsform", () => {
    expect(suggestPattern({ counterparty: "Zapier Inc. 123456789", purpose: "x" })).toBe("zapier");
    expect(suggestPattern({ counterparty: "", purpose: "RAILWAY CORPORATION 2026-11" })).toBe("railway corporation");
  });
  it("Doppelzählung mit laufenden Kosten erkennen", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    const rec = [
      { name: "Instantly", endsAt: null },
      { name: "Zapier (Pay-per-Lead)", endsAt: null },
      { name: "Railway", endsAt: new Date("2026-10-01") },
    ];
    const tx = [
      { counterparty: "INSTANTLY.AI", purpose: null, bookingDate: new Date("2026-11-03") },
      { counterparty: "Railway", purpose: null, bookingDate: new Date("2026-11-03") },
      { counterparty: "Zapier", purpose: null, bookingDate: new Date("2026-08-01") },
    ];
    expect(overlappingRecurring(rec, tx, now).map((r) => r.name)).toEqual(["Instantly"]);
  });
});

describe("Bank: CSV", () => {
  it("Zahlen und Datumsformate", () => {
    expect(parseAmount("-1.234,56")).toBe(-1234.56);
    expect(parseAmount("12,34 €")).toBe(12.34);
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("12.34")).toBe(12.34);
    expect(parseAmount("1.000")).toBe(1000);
    expect(parseAmount("12,00-")).toBe(-12);
    expect(parseAmount("")).toBeNull();
    expect(parseDate("31.10.2026")).toBe("2026-10-31");
    expect(parseDate("1/2/26")).toBe("2026-02-01");
    expect(parseDate("2026-10-31")).toBe("2026-10-31");
    expect(parseDate("32.13.2026")).toBeNull();
  });
  it("Commerzbank-Export: Ausgaben negativ, Gegenpartei aus Buchungstext, idempotente IDs", () => {
    const csv = [
      "Buchungstag;Wertstellung;Umsatzart;Buchungstext;Betrag;Währung;Auftraggeberkonto;Bankleitzahl Auftraggeberkonto;IBAN Auftraggeberkonto;Kategorie",
      '03.11.2026;03.11.2026;Lastschrift;"ANTHROPIC, PBC 4711 End-to-End-Ref.: ABC";-21,50;EUR;;;;Software',
      "03.11.2026;03.11.2026;Lastschrift;Railway Corporation 99881;-20,00;EUR;;;;",
      "03.11.2026;03.11.2026;Lastschrift;Railway Corporation 99881;-20,00;EUR;;;;",
      "05.11.2026;05.11.2026;Gutschrift;Stripe Payments Europe Auszahlung;1.500,00;EUR;;;;",
    ].join("\r\n");
    const r = parseBankCsv(csv);
    expect(r.source).toBe("commerzbank");
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0]).toMatchObject({ bookingDate: "2026-11-03", amount: -21.5, currency: "EUR" });
    expect(r.rows[0].counterparty).toContain("ANTHROPIC");
    expect(r.rows[3].amount).toBe(1500);
    // gleiche Buchung zweimal am selben Tag → zwei verschiedene IDs; erneutes Einlesen → dieselben IDs
    expect(r.rows[1].externalId).not.toBe(r.rows[2].externalId);
    expect(parseBankCsv(csv).rows.map((x) => x.externalId)).toEqual(r.rows.map((x) => x.externalId));
  });
  it("Amex-Export: Belastungen positiv → Ausgabe negativ, Referenz als ID, Kopfzeilen davor", () => {
    const csv = [
      "Umsätze;;;",
      "Datum,Beschreibung,Betrag,Erweiterte Details,Erscheint auf Ihrer Abrechnung als,Adresse,Stadt/Postleitzahl,Land,Referenz,Kategorie",
      '02/11/2026,"OPENAI *CHATGPT SUBSCR","22,13",,"OPENAI *CHATGPT SUBSCR",,,"USA","\'AT263080012345\'",Software',
      '04/11/2026,"ZAHLUNG ERHALTEN - DANKE","-500,00",,,,,,"\'AT263080099999\'",',
    ].join("\n");
    const r = parseBankCsv(csv);
    expect(r.source).toBe("amex");
    expect(r.rows[0]).toMatchObject({ bookingDate: "2026-11-02", amount: -22.13, externalId: "ref:AT263080012345", counterparty: "OPENAI *CHATGPT SUBSCR" });
    expect(r.rows[1].amount).toBe(500);
  });
  it("unbekanntes Format → verständlicher Fehler", () => {
    expect(parseBankCsv("a;b;c\n1;2;3").error).toMatch(/Datum/);
  });
});

describe("Bank: Enable Banking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  it("JWT: RS256, kid = App-ID, feste iss/aud, gültige Signatur", () => {
    const jwt = makeJwt("app-123", pem, new Date("2026-11-11T10:00:00Z"));
    const [h, b, sig] = jwt.split(".");
    const dec = (x: string) => JSON.parse(Buffer.from(x.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    expect(dec(h)).toEqual({ typ: "JWT", alg: "RS256", kid: "app-123" });
    expect(dec(b)).toMatchObject({ iss: "enablebanking.com", aud: "api.enablebanking.com", exp: dec(b).iat + 3600 });
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${b}`);
    expect(v.verify(publicKey, Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64"))).toBe(true);
  });
  it("PEM mit \\n aus Railway wird wiederhergestellt", () => {
    expect(normalizePem(pem.replace(/\n/g, "\\n"))).toBe(pem.trim());
  });
  it("Umsätze über mehrere Seiten (continuation_key)", async () => {
    vi.stubEnv("ENABLE_BANKING_APP_ID", "app-123");
    vi.stubEnv("ENABLE_BANKING_PRIVATE_KEY", pem);
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
        calls.push(url);
        expect(init.headers.Authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
        const page2 = url.includes("continuation_key=k2");
        return new Response(JSON.stringify({ transactions: [{ transaction_id: page2 ? "t2" : "t1" }], continuation_key: page2 ? null : "k2" }), { status: 200 });
      }),
    );
    const t = await fetchTransactions("acc-1", "2026-08-01");
    expect(t.map((x) => x.transaction_id)).toEqual(["t1", "t2"]);
    expect(calls[0]).toContain("/accounts/acc-1/transactions?date_from=2026-08-01");
  });
  it("Buchung umwandeln: DBIT negativ mit Empfänger, nur gebuchte", () => {
    const base = { transaction_amount: { amount: "21.50", currency: "EUR" }, booking_date: "2026-11-03", remittance_information: ["Claude Pro", "Nov"] };
    expect(fromEnableBanking({ ...base, credit_debit_indicator: "DBIT", creditor: { name: "Anthropic" }, transaction_id: "x1", status: "BOOK" })).toEqual({
      externalId: "x1",
      bookingDate: "2026-11-03",
      amount: -21.5,
      currency: "EUR",
      counterparty: "Anthropic",
      purpose: "Claude Pro Nov",
    });
    expect(fromEnableBanking({ ...base, credit_debit_indicator: "CRDT", debtor: { name: "Kunde" } })?.amount).toBe(21.5);
    expect(fromEnableBanking({ ...base, credit_debit_indicator: "DBIT", status: "PDNG" })).toBeNull();
  });
});

describe("Regeln: Gegenpartei vor Verwendungszweck", () => {
  it("Privat-Regel auf den eigenen Namen fängt keine Rechnung mit dem Namen im Text", async () => {
    const { matchRule, suggestPattern } = await import("@/lib/bank/rules");
    const own = [
      { pattern: "ole kannapinn", action: "ignore" as const },
      { pattern: "xing", action: "akquise" as const },
    ];
    expect(matchRule({ counterparty: "XING SE + Co. KG", purpose: "XING PRM123 Ole Kannapinn Vielen Dank" }, own)?.action).toBe("akquise");
    expect(matchRule({ counterparty: "Ole Kannapinn", purpose: "Umbuchung privat" }, own)?.action).toBe("ignore");
    expect(suggestPattern({ counterparty: "XING SE + Co. KG" })).toBe("xing");
  });
});

describe("Regeln: nur Gegenpartei", () => {
  it("counterpartyOnly greift nicht im Verwendungszweck", async () => {
    const { matchRule } = await import("@/lib/bank/rules");
    const own = [{ pattern: "ole kannapinn", action: "ignore" as const, counterpartyOnly: true }];
    expect(matchRule({ counterparty: "Unbekannt GmbH", purpose: "Rechnung für Ole Kannapinn" }, own, [])).toBeNull();
    expect(matchRule({ counterparty: "Ole Kannapinn", purpose: "" }, own, [])?.action).toBe("ignore");
  });
});
