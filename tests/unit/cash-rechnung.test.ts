// Diagnose q=cash: Einordnung der Buchungen und Umsatzsteuer-Schätzung (reine Funktionen).
import { describe, expect, it } from "vitest";
import {
  ausgabeZweck,
  bewegungen,
  datenHinweise,
  eingangsArt,
  gegenbuchungen,
  kontoArt,
  kostenJeMonat,
  kurzerFehler,
  moeglicheDoppelte,
  steuerArt,
  tageZurueck,
  ustAusBrutto,
  ustSchaetzung,
  vorigeMonate,
  type Buchung,
  type IgnoreRegel,
} from "@/lib/ops/cash-rechnung";
import { pickBalance } from "@/lib/bank/enable-banking";

const GK = "eb-konto-1";
const AMEX = "csv:amex";
const b = (date: string, amount: number, extra: Partial<Buchung> = {}): Buchung => ({
  accountKey: GK,
  bookingDate: new Date(`${date}T00:00:00Z`),
  amount,
  status: amount > 0 ? "ignoriert" : "neu",
  costPurpose: null,
  vatIncluded: false,
  counterparty: null,
  purpose: null,
  ...extra,
});
const REGELN: IgnoreRegel[] = [
  { pattern: "ole kannapinn", label: "Privat", counterpartyOnly: true },
  { pattern: "stripe", label: "Stripe (Auszahlung/Gebühren)", counterpartyOnly: false },
  { pattern: "meta platforms ireland", label: "Meta", counterpartyOnly: true },
];

describe("Einordnung", () => {
  it("Konto-Art aus dem Schlüssel", () => {
    expect(kontoArt("csv:amex")).toBe("amex");
    expect(kontoArt("csv:commerzbank")).toBe("commerzbank");
    expect(kontoArt("3f2a-uid")).toBe("commerzbank");
  });

  it("Ausgaben-Zweck: ki zählt in software, ohne Zweck = neu", () => {
    expect(ausgabeZweck({ status: "zugeordnet", costPurpose: "ki" })).toBe("software");
    expect(ausgabeZweck({ status: "zugeordnet", costPurpose: "ppl" })).toBe("ppl");
    expect(ausgabeZweck({ status: "zugeordnet", costPurpose: null })).toBe("neu");
    expect(ausgabeZweck({ status: "ignoriert", costPurpose: null })).toBe("ignoriert");
    expect(ausgabeZweck({ status: "neu", costPurpose: null })).toBe("neu");
  });

  it("Steuerzahlungen: nur mit Finanzamt/Steuernummer, Art soweit erkennbar", () => {
    expect(steuerArt({ counterparty: "Finanzamt Hamburg-Mitte", purpose: "StNr 12/345/67890 USt 10.26" })).toBe("ust");
    expect(steuerArt({ counterparty: "Bundeskasse", purpose: "Umsatzsteuer-Vorauszahlung" })).toBe("ust");
    expect(steuerArt({ counterparty: null, purpose: "Umsatzsteuervorauszahlung 09/2026" })).toBe("ust");
    expect(steuerArt({ counterparty: "FA Hamburg-Nord", purpose: "Einkommensteuer 2025" })).toBe("sonstige");
    expect(steuerArt({ counterparty: "Finanzamt Hamburg", purpose: "ESt-VZ III/26" })).toBe("sonstige");
    expect(steuerArt({ counterparty: "Finanzamt Hamburg", purpose: "Zahlung" })).toBe("unklar");
    expect(steuerArt({ counterparty: "Finanzamt Hamburg", purpose: "USt und ESt" })).toBe("unklar");
    // Lieferanten-Rechnung mit „inkl. USt“ und Steuerberater sind keine Steuerzahlung
    expect(steuerArt({ counterparty: "Telekom Deutschland GmbH", purpose: "Rechnung inkl. 19% USt" })).toBeNull();
    expect(steuerArt({ counterparty: "PHDRMUELLER Steuerberatung", purpose: "Steuerberatung 10/2026" })).toBeNull();
    expect(steuerArt({ counterparty: "Sofa Fabrik", purpose: "August Zustellung" })).toBeNull();
  });

  it("Eingänge: Stripe, direkt, Einlage per Regel, vermutet, Finanzamt, Erstattung, Amex", () => {
    const art = (x: Partial<Buchung>, gegenbuchung = false) => eingangsArt(b("2026-03-01", 100, x), { regeln: REGELN, gegenbuchung });
    expect(art({ counterparty: "STRIPE", purpose: "Payout" })).toBe("kunde_stripe");
    expect(art({ counterparty: "Maklerbüro Muster GmbH", purpose: "RE-2026-0012" })).toBe("kunde_direkt");
    expect(art({ counterparty: "Ole Kannapinn", purpose: "Geld" })).toBe("einlage");
    expect(art({ counterparty: "O. Kannapinn", purpose: "Darlehen" })).toBe("einlage_vermutet");
    expect(art({ counterparty: "Privat", purpose: "Einlage" })).toBe("einlage_vermutet");
    expect(art({ counterparty: "Finanzamt Hamburg", purpose: "Erstattung USt 03/26" })).toBe("steuererstattung");
    expect(art({ counterparty: "Shop", purpose: "Rückerstattung Bestellung" })).toBe("erstattung");
    expect(art({ counterparty: "American Express", purpose: "Guthaben" })).toBe("umbuchung");
    expect(art({ counterparty: "Maklerbüro", purpose: "x" }, true)).toBe("umbuchung");
    // Ignorier-Regel ohne Privat-Bezug macht keinen Eingang zur Einlage
    expect(art({ counterparty: "Meta Platforms Ireland", purpose: "Refund" })).toBe("erstattung");
    expect(eingangsArt(b("2026-03-01", 500, { accountKey: AMEX, counterparty: "Zahlung erhalten. Vielen Dank" }), { regeln: REGELN })).toBe("kartenausgleich");
    expect(eingangsArt(b("2026-03-01", 20, { accountKey: AMEX, counterparty: "Amazon", purpose: "Gutschrift" }), { regeln: REGELN })).toBe("erstattung");
  });

  it("Umbuchung zwischen eigenen Konten: gleicher Tag und Betrag auf anderem Konto, jede Ausgabe einmal", () => {
    const aus = b("2026-05-10", -300, { accountKey: "eb-konto-2", status: "ignoriert" });
    const ein1 = b("2026-05-10", 300);
    const ein2 = b("2026-05-10", 300);
    const gleichesKonto = b("2026-05-11", 50);
    const s = gegenbuchungen([aus, ein1, ein2, gleichesKonto, b("2026-05-11", -50)]);
    expect(s.size).toBe(1);
    expect(s.has(ein1) || s.has(ein2)).toBe(true);
    expect(s.has(gleichesKonto)).toBe(false);
  });
});

describe("Bewegungen und Kosten", () => {
  it("Bewegungen ab Stichtag, Ausgaben je Zweck brutto", () => {
    const list = [
      b("2026-11-01", 1000),
      b("2026-11-02", -119, { status: "zugeordnet", costPurpose: "betrieb", vatIncluded: true }),
      b("2026-11-03", -50, { status: "zugeordnet", costPurpose: "ki" }),
      b("2026-11-04", -10),
      b("2026-11-05", -400, { status: "ignoriert" }),
      b("2026-09-01", -999, { status: "zugeordnet", costPurpose: "ppl" }),
    ];
    const r = bewegungen(list, tageZurueck(new Date("2026-11-19T12:00:00Z"), 30));
    expect(r).toEqual({ eingaenge: 1000, ausgaben: 579, saldo: 421, ausgabenNachZweck: { ppl: 0, software: 50, akquise: 0, betrieb: 119, ignoriert: 400, neu: 10 } });
  });

  it("Stichtag ist der ganze Tag (Buchungsdaten ohne Uhrzeit)", () => {
    expect(tageZurueck(new Date("2026-11-19T15:00:00Z"), 30).toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });

  it("Letzte 3 volle Monate, auch über den Jahreswechsel", () => {
    expect(vorigeMonate(new Date("2026-11-19T10:00:00Z"))).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(vorigeMonate(new Date("2027-02-03T10:00:00Z"))).toEqual(["2026-11", "2026-12", "2027-01"]);
    // 31.12. 23:30 UTC ist in Berlin schon Januar
    expect(vorigeMonate(new Date("2026-12-31T23:30:00Z"))).toEqual(["2026-10", "2026-11", "2026-12"]);
  });

  it("Kosten je Monat: Durchschnitt netto (wo inkl. USt), ohne ignorierte und offene", () => {
    const list = [
      b("2026-08-05", -119, { status: "zugeordnet", costPurpose: "betrieb", vatIncluded: true }),
      b("2026-09-05", -238, { status: "zugeordnet", costPurpose: "betrieb", vatIncluded: true }),
      b("2026-10-05", -90, { status: "zugeordnet", costPurpose: "ki" }),
      b("2026-10-06", -500, { status: "ignoriert" }),
      b("2026-10-07", -60),
      b("2026-11-01", -1000, { status: "zugeordnet", costPurpose: "ppl" }),
    ];
    const r = kostenJeMonat(list, ["2026-08", "2026-09", "2026-10"]);
    expect(r.jeZweck).toEqual({ ppl: 0, software: 30, akquise: 0, betrieb: 100 });
    expect(r.summe).toBe(130);
  });
});

describe("Umsatzsteuer-Schätzung", () => {
  const daten: Buchung[] = [
    b("2026-01-05", 1190, { counterparty: "Maklerbüro Muster", purpose: "RE-1" }),
    b("2026-03-05", 2380, { counterparty: "STRIPE", purpose: "Payout" }),
    b("2026-04-01", 5000, { counterparty: "Ole Kannapinn", purpose: "Einlage" }),
    b("2026-04-02", 1000, { counterparty: "Privatkonto", purpose: "Darlehen" }),
    b("2026-05-10", -300, { status: "ignoriert", purpose: "Umbuchung" }),
    b("2026-05-10", 300, { accountKey: "eb-konto-2", purpose: "Umbuchung" }),
    b("2026-02-10", -500, { status: "ignoriert", counterparty: "Finanzamt Hamburg-Mitte", purpose: "StNr 12/345/67890 USt 12.25" }),
    b("2026-03-10", -200, { status: "ignoriert", counterparty: "Finanzamt Hamburg-Mitte", purpose: "Einkommensteuer" }),
    b("2026-03-11", -50, { status: "ignoriert", counterparty: "Finanzamt Hamburg-Mitte", purpose: "Zahlung" }),
    b("2026-05-20", 100, { counterparty: "Finanzamt Hamburg-Mitte", purpose: "Erstattung USt 03.26" }),
    b("2026-05-25", 20, { counterparty: "Shop", purpose: "Rückerstattung" }),
    b("2026-05-15", -119, { status: "zugeordnet", costPurpose: "betrieb", vatIncluded: true }),
    b("2026-06-01", -238, { status: "zugeordnet", costPurpose: "software", vatIncluded: false }),
    b("2026-06-05", -59.5),
    b("2026-06-02", -400, { status: "ignoriert", counterparty: "Meta Platforms Ireland" }),
    b("2026-04-15", -238, { accountKey: AMEX, status: "zugeordnet", costPurpose: "betrieb", vatIncluded: true }),
    b("2026-05-03", 500, { accountKey: AMEX, counterparty: "Zahlung erhalten" }),
    b("2026-06-10", -47.6, { accountKey: AMEX, status: "zugeordnet", costPurpose: "ki", vatIncluded: true }),
    // anderes Jahr zählt nicht
    b("2025-12-30", 11900, { counterparty: "Kunde" }),
    b("2027-01-02", -1190, { status: "zugeordnet", costPurpose: "betrieb", vatIncluded: true }),
  ];

  it("Ausgangs-USt nur aus Kundenzahlungen, Vorsteuer aus Ausgaben inkl. USt, gezahlte USt abgezogen", () => {
    const r = ustSchaetzung(daten, { jahr: 2026, regeln: REGELN });
    expect(r.kundenzahlungen).toEqual({ brutto: 3570, stripeAuszahlungen: 2380, direkt: 1190, anzahl: 2 });
    expect(r.ausgangsUst).toBe(570);
    expect(r.ausgaben).toEqual({ mitUstBrutto: 404.6, ohneUstBrutto: 238, ignoriertBrutto: 700 });
    expect(r.vorsteuer).toBe(64.6);
    expect(r.finanzamt).toEqual({ ustZahlungen: 500, ustErstattungen: 100, sonstigeSteuern: 200, unklar: 50, sonstigeErstattungen: 0 });
    expect(r.bereitsGezahltUst).toBe(400);
    expect(r.zahllastGeschaetzt).toBe(105.4);
    expect(r.zahllastWennUnklarUst).toBe(55.4);
    expect(r.nichtAlsUmsatz).toEqual({ einlagenPerRegel: 5000, einlagenVermutet: 1000, umbuchungen: 300, steuererstattungen: 100, erstattungenAnbieter: 20, kartenausgleichAmex: 500 });
    expect(r.unzugeordnet).toEqual({ anzahl: 1, brutto: 59.5, vorsteuerHoechstens: 9.5 });
    expect(r.anzahlVermuteteEinlagen).toBe(1);
  });

  it("Gleiche Buchung per CSV und per Bankverbindung wird als möglich doppelt gemeldet", () => {
    const r = moeglicheDoppelte([
      b("2026-02-01", 1190),
      b("2026-02-01", 1190, { accountKey: "csv:commerzbank" }),
      b("2026-02-01", 1190, { accountKey: "csv:commerzbank" }),
      b("2026-02-02", -50),
      b("2026-02-02", -50, { accountKey: "csv:commerzbank" }),
      b("2026-02-03", 70, { accountKey: AMEX }),
      b("2026-02-03", 70, { accountKey: "csv:commerzbank" }),
    ]);
    expect(r).toEqual({ anzahl: 2, eingaenge: 1190 });
    expect(ustSchaetzung(daten, { jahr: 2026, regeln: REGELN }).moeglicheDoppelte).toEqual({ anzahl: 0, eingaenge: 0 });
  });

  it("19/119 kaufmännisch gerundet", () => {
    expect(ustAusBrutto(119)).toBe(19);
    expect(ustAusBrutto(100)).toBe(15.97);
    expect(ustAusBrutto(0)).toBe(0);
  });

  it("Datenlücken: später Beginn, alte letzte Buchung, keine Daten", () => {
    const h = datenHinweise(
      [
        { art: "commerzbank", erste: new Date("2026-08-20"), letzte: new Date("2026-11-18") },
        { art: "amex", erste: new Date("2025-11-01"), letzte: new Date("2026-09-30") },
      ],
      2026,
      new Date("2026-11-19T10:00:00Z"),
    );
    expect(h).toEqual(["Geschäftskonto: Buchungen erst ab 2026-08-20, davor fehlen Ein- und Ausgänge für 2026.", "Amex: letzte Buchung am 2026-09-30, neuere fehlen."]);
    expect(datenHinweise([], 2026, new Date("2026-11-19"))).toHaveLength(2);
  });
});

describe("Kontostand und Fehlertexte", () => {
  it("Kontostand: CLBD vor ITAV vor erstem", () => {
    const bal = (amount: string, balance_type: string) => ({ balance_amount: { amount, currency: "EUR" }, balance_type });
    expect(pickBalance([bal("10.00", "ITAV"), bal("12.345", "CLBD")])).toMatchObject({ betrag: 12.35, art: "CLBD" });
    expect(pickBalance([bal("5", "XPCD"), bal("10.00", "ITAV")])).toMatchObject({ betrag: 10, art: "ITAV" });
    expect(pickBalance([bal("5", "XPCD"), bal("7", "OTHR")])).toMatchObject({ betrag: 5, art: "XPCD" });
    expect(pickBalance([bal("-1.5", "closingBooked")])).toMatchObject({ betrag: -1.5 });
    expect(pickBalance([])).toBeNull();
  });

  it("Fehlertexte ohne IBAN und Schlüssel, gekürzt", () => {
    const f = kurzerFehler(new Error("Enable Banking: session 3fa85f64-5717-4562-b3fc-2c963f66afa6abcdef expired for DE89370400440532013000 (sk_live_abc123)"));
    expect(f).not.toMatch(/DE8937|3fa85f64|sk_live/);
    expect(kurzerFehler("x".repeat(400))!.length).toBeLessThanOrEqual(160);
    expect(kurzerFehler(null)).toBeNull();
  });
});
