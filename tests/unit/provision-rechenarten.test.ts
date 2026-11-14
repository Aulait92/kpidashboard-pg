// Provision, Bestand und Gewinn (Ole, 14.11.2026): Rechenarten je Sparte (Leben/BU nach Beitragssumme,
// KFZ, PKV-Deckel § 50 VAG, Honorar Tarifoptimierung), eigene Stornoquote in allen Prognosen,
// „Vertrag gekündigt bzw. storniert“ mit Rückbelastung, tatsächliche Stornoquote, Gewinn „Inkl. Bestand“
// (Kohorte) und der Monatsbericht mit beiden Zahlen. Reine Funktionen ohne Datenbank.
import { describe, expect, it } from "vitest";
import {
  beitragssummeExample,
  bestandInYears,
  cohortFutureTrail,
  contractProvision,
  effectiveRates,
  monthsBetween,
  parseCustomRates,
  parseStorno,
  PKV_MAX_MONTHS,
  premiumFieldForSparte,
  realStornoQuote,
  standardRate,
  stornoFor,
  suggestedChargeback,
  trailNextYears,
  type ProvisionOverrides,
} from "@/lib/provision";
import { bestandOf, summarizeBestand, summarizeProvision, type ErtragData } from "@/lib/ertrag";
import type { CustomerContract } from "@/lib/vertraege";
import { parseCancelInput, parseContractInput } from "@/lib/vertraege";
import {
  bestandForecastNote,
  checkGewinnPair,
  gewinnPairText,
  reportNumbers,
  reportSectionsHtml,
  reportSectionsText,
  type ReportModel,
} from "@/lib/monatsbericht/bericht";

const D = (s: string) => new Date(`${s}T12:00:00.000Z`);
const nbsp = (s: string) => s.replace(/ /g, " ");
const vertreter = effectiveRates("vertreter");
const makler = effectiveRates("makler");

describe("Leben, BU, Rente, Kindersparplan: Rechenart Beitragssumme", () => {
  it("Beitragssumme = Monatsbeitrag × 12 × Laufzeit, 25 ‰ Abschluss, 1,5 % Bestand ab dem 1. Jahr", () => {
    // 80 € im Monat, 30 Jahre: 28.800 € → 720 € Abschluss, 14,40 € Bestand pro Jahr
    const p = contractProvision({ sparte: "bu", premium: 960, termYears: 30 }, vertreter);
    expect(p).toMatchObject({ basis: "beitragssumme", beitragssumme: 28800, abschluss: 720, trailPerYear: 14.4, trailFromYear2: false, firstYear: 734.4, termYears: 30, monthlyPremium: 80, haftungMonate: 60 });
    // Makler: 35 ‰ Abschlusscourtage plus kleine Bestandscourtage
    expect(contractProvision({ sparte: "bu", premium: 960, termYears: 30 }, makler)).toMatchObject({ abschluss: 1008, trailPerYear: 14.4 });
  });

  it("Laufzeit: eingetragen, sonst Endalter minus Alter, sonst Standard; Beitragssumme direkt geht vor", () => {
    // BU bis 67: Alter 37 → 30 Jahre; Alter 47 → 20 Jahre
    expect(contractProvision({ sparte: "bu", premium: 960, customerAge: 47 }, vertreter)).toMatchObject({ termYears: 20, beitragssumme: 19200, abschluss: 480 });
    expect(contractProvision({ sparte: "bu", premium: 960, customerAge: 30, endAge: 60 }, vertreter).termYears).toBe(30);
    expect(contractProvision({ sparte: "bu", premium: 960, termYears: 10, customerAge: 30 }, vertreter).termYears).toBe(10);
    // Beitragssumme direkt: 40.000 € → 1.000 €
    expect(contractProvision({ sparte: "leben_bu", premium: 1200, beitragssumme: 40000 }, vertreter)).toMatchObject({ beitragssumme: 40000, abschluss: 1000, trailPerYear: 18 });
    // nur Beitragssumme, kein Beitrag: Monatsbeitrag daraus (40.000 / 12 / 30)
    expect(contractProvision({ sparte: "leben_bu", premium: null, beitragssumme: 36000 }, vertreter)).toMatchObject({ abschluss: 900, monthlyPremium: 100, premiumMissing: false });
  });

  it("Standardwerte je Sparte (ohne Angabe)", () => {
    expect(contractProvision({ sparte: "bu", premium: null }, vertreter)).toMatchObject({ monthlyPremium: 80, termYears: 30, abschluss: 720, premiumMissing: true });
    expect(contractProvision({ sparte: "kindersparplan", premium: null }, vertreter)).toMatchObject({ monthlyPremium: 50, termYears: 18, abschluss: 270 });
    expect(contractProvision({ sparte: "leben_bu", premium: null }, vertreter)).toMatchObject({ monthlyPremium: 100, termYears: 30, abschluss: 900, trailPerYear: 18 });
  });

  it("Bestehende Verträge: eingetragener Jahresbeitrag = Monatsbeitrag × 12, Laufzeit Standard; fester Altwert bleibt", () => {
    expect(contractProvision({ sparte: "leben_bu", premium: 1200 }, vertreter)).toMatchObject({ monthlyPremium: 100, termYears: 30, abschluss: 900 });
    expect(contractProvision({ sparte: "kindersparplan", premium: null, provisionValue: 500 }, vertreter)).toMatchObject({ basis: "fest", abschluss: 500, firstYear: 500 });
  });

  it("Beispieltext unter den Feldern", () => {
    const bu = standardRate("bu", "vertreter");
    if (bu.kind !== "beitragssumme") throw new Error();
    expect(nbsp(beitragssummeExample(bu))).toBe("Bei 80 € im Monat und 30 Jahren (28.800 € Beitragssumme): ≈ 720 € Abschlussprovision, ≈ 14 € Bestand pro Jahr");
  });

  it("Eingabe als Monatsbeitrag, gespeichert als Jahresbeitrag; Laufzeit, Alter, Endalter geprüft", () => {
    expect(premiumFieldForSparte("bu", vertreter)).toMatchObject({ label: "Monatsbeitrag", factor: 12 });
    const ok = parseContractInput({ sparte: "bu", premium: "80", termYears: "25", beitragssumme: "" }, D("2026-11-14"));
    expect(ok.ok && ok.value).toMatchObject({ premium: 960, termYears: 25, beitragssumme: null });
    expect(parseContractInput({ sparte: "bu", customerAge: "40", endAge: "35" }, D("2026-11-14")).ok).toBe(false);
    expect(parseContractInput({ sparte: "bu", termYears: "0" }, D("2026-11-14")).ok).toBe(false);
    // Sach: keine Laufzeitfelder, Beitrag unverändert
    const sach = parseContractInput({ sparte: "hausrat", premium: "120", termYears: "30" }, D("2026-11-14"));
    expect(sach.ok && sach.value).toMatchObject({ premium: 120, termYears: null });
  });
});

describe("Stornohaftung: anteilige Rückbelastung", () => {
  const c = { sparte: "bu", premium: 960, termYears: 30, signedAt: D("2026-01-15") };
  it("verbleibende Monate / 60 der Abschlussprovision", () => {
    expect(monthsBetween(D("2026-01-15"), D("2026-07-14"))).toBe(5);
    expect(monthsBetween(D("2026-01-15"), D("2026-07-15"))).toBe(6);
    // nach 12 Monaten: 48 / 60 von 720 € = 576 €
    expect(suggestedChargeback(c, D("2027-01-15"), "kunde", vertreter)).toBe(576);
    // nach Ablauf der Haftungszeit: 0
    expect(suggestedChargeback(c, D("2031-02-01"), "kunde", vertreter)).toBe(0);
    // eigene Haftungszeit 24 Monate: nach 12 Monaten die Hälfte
    const own = effectiveRates("vertreter", { bu: { ...standardRate("bu", "vertreter"), haftungMonate: 24 } });
    expect(suggestedChargeback(c, D("2027-01-15"), "kunde", own)).toBe(360);
  });
  it("Widerruf: volle Abschlussprovision; Sach ohne Vorschlag", () => {
    expect(suggestedChargeback(c, D("2026-01-20"), "widerruf", vertreter)).toBe(720);
    expect(suggestedChargeback({ sparte: "hausrat", premium: 200, signedAt: D("2026-01-15") }, D("2026-06-01"), "kunde", vertreter)).toBeNull();
    expect(suggestedChargeback({ sparte: "hausrat", premium: 200, signedAt: D("2026-01-15") }, D("2026-01-20"), "widerruf", vertreter)).toBe(110);
  });
  it("Kündigung: Datum, Grund und Betrag geprüft", () => {
    const now = D("2026-11-14");
    expect(parseCancelInput({ cancelledAt: "2026-11-10", reason: "kunde", chargeback: "1.234,50" }, D("2026-01-01"), now)).toEqual({
      ok: true,
      value: { cancelledAt: D("2026-11-10"), reason: "kunde", chargeback: 1234.5 },
    });
    expect(parseCancelInput({ cancelledAt: "2026-11-10", reason: "quatsch" }, null, now).ok).toBe(false);
    expect(parseCancelInput({ cancelledAt: "2025-12-01", reason: "kunde" }, D("2026-01-01"), now).ok).toBe(false);
    expect(parseCancelInput({ cancelledAt: "", reason: "kunde" }, null, now).ok).toBe(false);
  });
});

describe("PKV, Honorar, KFZ, Sach", () => {
  it("PKV-Neugeschäft: Standard 9, höchstens 9,9 Monatsbeiträge (§ 50 VAG)", () => {
    expect(PKV_MAX_MONTHS).toBe(9.9);
    expect(standardRate("pkv", "vertreter")).toEqual({ kind: "monthly", months: 9, fallbackAmount: 2500 });
    const ok = parseCustomRates({ pkv: { kind: "monthly", months: "9,9", fallbackAmount: 2500 } });
    expect(ok.errors).toEqual([]);
    const over = parseCustomRates({ pkv: { kind: "monthly", months: 12, fallbackAmount: 2500 } });
    expect(over.errors[0]).toContain("§ 50 VAG");
    expect(over.rates.pkv).toEqual({ kind: "monthly", months: 9.9, fallbackAmount: 2500 });
    // Gespeicherter Altwert über 9,9 rechnet mit 9,9
    expect(contractProvision({ sparte: "pkv", premium: 500 }, effectiveRates("makler", { pkv: { kind: "monthly", months: 12, fallbackAmount: 2500 } })).abschluss).toBe(4950);
  });

  it("PKV-Tarifoptimierung: Honorar vom Kunden, Ersparnis × Monate oder fester Betrag, kein Bestand", () => {
    expect(contractProvision({ sparte: "pkv_tarif", premium: 150 }, makler)).toMatchObject({ basis: "honorar", honorar: true, abschluss: 900, trailPerYear: 0, firstYear: 900 });
    expect(contractProvision({ sparte: "pkv_tarif", premium: null }, makler)).toMatchObject({ abschluss: 600, premiumMissing: true });
    const own = effectiveRates("makler", { pkv_tarif: { kind: "honorar", months: 8, defaultSavings: 100 } });
    expect(contractProvision({ sparte: "pkv_tarif", premium: 150 }, own).abschluss).toBe(1200);
    const fix = effectiveRates("makler", { pkv_tarif: { kind: "honorar", months: 6, defaultSavings: 100, fixedAmount: 1500 } });
    expect(contractProvision({ sparte: "pkv_tarif", premium: 150 }, fix)).toMatchObject({ abschluss: 1500, premiumMissing: false });
    expect(premiumFieldForSparte("pkv_tarif", makler)).toMatchObject({ label: "Monatliche Ersparnis des Kunden", factor: 1 });
    expect(premiumFieldForSparte("pkv_tarif", makler).hint).toContain("Honorarvereinbarung");
    // Gewinn: Honorar zählt als Ertrag
    const s = summarizeProvision([contract({ sparte: "pkv_tarif", premium: 150 })], makler, nov);
    expect(s).toMatchObject({ firstYear: 900, honorar: 900 });
  });

  it("KFZ: keine Abschlussprovision, 5 % laufend ab dem 1. Jahr, typischer Beitrag 600 €", () => {
    for (const r of [vertreter, makler]) {
      expect(contractProvision({ sparte: "kfz", premium: null }, r)).toMatchObject({ abschluss: 0, trailPerYear: 30, trailFromYear2: false, firstYear: 30, premiumUsed: 600 });
    }
    expect(contractProvision({ sparte: "kfz", premium: 800 }, vertreter).firstYear).toBe(40);
  });

  it("Sach: typischer Beitrag 0 € nicht zulässig, Standardbeiträge je Sparte", () => {
    const want: Record<string, number> = { privatschutz: 600, tkv: 350, unfall: 180, hausrat: 120, wohngebaeude: 500, rechtsschutz: 300, sonstiges: 300 };
    for (const [k, v] of Object.entries(want)) {
      for (const typ of ["vertreter", "makler"] as const) {
        const s = standardRate(k as never, typ);
        expect(s.kind === "percent" && s.defaultPremium).toBe(v);
      }
    }
    const zero = parseCustomRates({ hausrat: { kind: "percent", rate: 0.3, trail: 0.1, defaultPremium: 0 } });
    expect(zero.errors[0]).toContain("über 0 €");
    // Beim Laden bleibt der eigene Satz, der Beitrag kommt aus dem Standard
    expect(zero.rates.hausrat).toEqual({ kind: "percent", rate: 0.3, trail: 0.1, defaultPremium: 120 });
  });

  it("Prozent-Sätze aus der Zeit vor den Rechenarten gelten bei Leben/BU nicht mehr", () => {
    const r = effectiveRates("vertreter", { leben_bu: { kind: "percent", rate: 0.55, trail: 0.1, defaultPremium: 1200 } });
    expect(r.leben_bu?.kind).toBe("beitragssumme");
  });
});

// ─── Verträge, Bestand, Stornoquote, Gewinn ─────────────────────────────────

const nov = { from: D("2026-11-01"), to: D("2026-11-30") };
const okt = { from: D("2026-10-01"), to: D("2026-10-31") };
const NOW = D("2026-11-30");

function contract(over: Partial<CustomerContract>): CustomerContract {
  return {
    id: Math.random().toString(36),
    leadId: Math.random().toString(36),
    primary: true,
    sparte: "katze",
    premium: 400,
    provisionValue: null,
    signedAt: D("2026-11-05"),
    periodAt: D("2026-11-05"),
    origin: "paid",
    assignedUserId: null,
    leadCreatedAt: D("2026-11-01"),
    status: "aktiv",
    cancelledAt: null,
    cancelReason: null,
    chargeback: null,
    ...over,
  };
}

describe("Stornoquote aus der Einstellung in allen Prognosen", () => {
  const rows = [contract({ signedAt: D("2025-06-01"), periodAt: D("2025-06-01") }), contract({ sparte: "kfz", premium: 600, signedAt: D("2026-10-01"), periodAt: D("2026-10-01") })];
  it("Standard 10 %, eigene Quote ändert Bestand in 5 Jahren, Diagramm und Kohorte", () => {
    const std = summarizeBestand(rows, vertreter, "vertreter", NOW);
    const low = summarizeBestand(rows, vertreter, "vertreter", NOW, 0.02, true);
    const high = summarizeBestand(rows, vertreter, "vertreter", NOW, 0.3, true);
    expect(std.storno).toBe(0.1);
    expect(low).toMatchObject({ storno: 0.02, stornoCustom: true });
    expect(low.inYears).toBeGreaterThan(std.inYears);
    expect(high.inYears).toBeLessThan(std.inYears);
    expect(low.growth[4].total).toBeGreaterThan(high.growth[4].total);
    const cohortLow = summarizeProvision(rows, vertreter, okt, { now: NOW, storno: 0.02 }).futureTrail;
    const cohortHigh = summarizeProvision(rows, vertreter, okt, { now: NOW, storno: 0.3 }).futureTrail;
    expect(cohortLow).toBeGreaterThan(cohortHigh);
    // Monatsbericht: verwendete Quote im Text
    expect(bestandForecastNote({ label: "Bestandsprovision", perYear: 1, contracts: 1, fromYear2: true, inYears: 1, storno: 0.02, perMonth: 1, years: [] })).toContain("2 % Storno pro Jahr");
  });

  it("bestandOf nimmt die Quote des Kunden (loadErtragData)", () => {
    const data: ErtragData = { typ: "vertreter", rates: vertreter, contracts: rows, agencyCfg: null, storno: 0.25, stornoCustom: true };
    expect(bestandOf(data, NOW)).toMatchObject({ storno: 0.25, stornoCustom: true });
    expect(bestandOf({ ...data, storno: undefined, stornoCustom: undefined }, NOW)).toMatchObject({ storno: 0.1, stornoCustom: false });
  });

  it("je Sparte eigene Quote; Bereich 0 bis 50 %", () => {
    const own = effectiveRates("vertreter", { kfz: { kind: "percent", rate: 0, trail: 0.05, defaultPremium: 600, storno: 0.2 } });
    expect(stornoFor("kfz", own, 0.1)).toBe(0.2);
    expect(stornoFor("katze", own, 0.1)).toBe(0.1);
    const kfz = { trailPerYear: 30, trailFromYear2: false, signedAt: NOW };
    expect(trailNextYears({ ...kfz, storno: 0.2 }, NOW)[3]).toBeLessThan(trailNextYears(kfz, NOW)[3]);
    expect(parseStorno("0,125")).toEqual({ ok: true, value: 0.125 });
    expect(parseStorno("")).toEqual({ ok: true, value: null });
    expect(parseStorno(0.6).ok).toBe(false);
    expect(parseCustomRates({ kfz: { kind: "percent", rate: 0, trail: 0.05, defaultPremium: 600, storno: 0.7 } }).errors[0]).toContain("Stornoquote");
  });
});

describe("Vertrag gekündigt bzw. storniert", () => {
  const cancelled = contract({ sparte: "hausrat", premium: 200, signedAt: D("2025-11-05"), periodAt: D("2025-11-05"), status: "storniert", cancelledAt: D("2026-11-10"), cancelReason: "kunde", chargeback: 50 });
  const active = contract({ sparte: "hausrat", premium: 200, signedAt: D("2025-11-05"), periodAt: D("2025-11-05") });

  it("nimmt den Vertrag ab dem Datum aus dem Bestand", () => {
    const withCancel = summarizeBestand([active, cancelled], vertreter, "vertreter", NOW);
    expect(withCancel.perYear).toBe(20);
    expect(withCancel.contracts).toBe(1);
    const before = summarizeBestand([active, cancelled], vertreter, "vertreter", D("2026-11-01"));
    expect(before.perYear).toBe(40);
    // Bestand der nächsten Jahre: nur bis zum Kündigungsdatum
    expect(bestandInYears([{ trailPerYear: 20, trailFromYear2: true, signedAt: D("2025-11-05"), endsAt: D("2026-11-10") }], NOW)).toBe(0);
    expect(bestandInYears([{ trailPerYear: 20, trailFromYear2: true, signedAt: D("2025-11-05"), endsAt: D("2027-11-05") }], NOW)).toBeCloseTo(20 * (340 / 365.25), 0);
  });

  it("Rückbelastung mindert Provision und Gewinn im Monat der Buchung, die Abschlussprovision bleibt im Abschlussmonat", () => {
    const s = summarizeProvision([cancelled, contract({})], vertreter, nov, { now: NOW });
    expect(s).toMatchObject({ chargeback: 50, chargebackContracts: 1, firstYear: 220 - 50, abschluss: 220 - 50, contracts: 1 });
    const signing = summarizeProvision([cancelled], vertreter, { from: D("2025-11-01"), to: D("2025-11-30") }, { now: NOW });
    expect(signing).toMatchObject({ firstYear: 110, chargeback: 0 });
    // Bestand pro Jahr aus dem Zeitraum: gekündigter Vertrag nicht mehr
    expect(signing.trailPerYear).toBe(0);
  });

  it("tatsächliche Quote erst ab 20 Verträgen", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ signedAt: D("2025-01-10"), cancelledAt: i < 2 ? D("2026-06-01") : null }));
    const q = realStornoQuote(many, NOW);
    expect(q.enough).toBe(true);
    // 2 Kündigungen / Bestand im Jahresmittel (20 bis Juni, dann 18) ≈ 10,5 %
    expect(q.quote).toBeGreaterThan(0.1);
    expect(q.quote).toBeLessThan(0.11);
    const few = realStornoQuote(many.slice(0, 19), NOW);
    expect(few).toMatchObject({ quote: null, enough: false, contracts: 19 });
    // Kündigungen älter als 12 Monate zählen nicht
    expect(realStornoQuote(many.map((c) => ({ ...c, cancelledAt: c.cancelledAt ? D("2025-06-01") : null })), NOW).cancelled).toBe(0);
  });
});

describe("Gewinn „Inkl. Bestand“: Kohorte über 5 Jahre", () => {
  const novKatze = contract({ sparte: "katze", premium: 400, signedAt: D("2026-11-10"), periodAt: D("2026-11-10") });
  const altBestand = contract({ sparte: "katze", premium: 4000, signedAt: D("2024-01-10"), periodAt: D("2024-01-10") });

  it("Kohorte statt Gesamtbestand", () => {
    const only = summarizeProvision([novKatze], vertreter, nov, { now: NOW }).futureTrail;
    const withOld = summarizeProvision([novKatze, altBestand], vertreter, nov, { now: NOW }).futureTrail;
    expect(only).toBeGreaterThan(0);
    expect(withOld).toBe(only);
  });

  it("Vertreter ab dem 2. Jahr, Makler ab dem 1. Jahr; ohne Storno genau 4 bzw. 5 Jahresbeträge", () => {
    const tv = { trailPerYear: 40, trailFromYear2: true, signedAt: NOW };
    expect(cohortFutureTrail(tv, NOW, 5, 0)).toBe(160);
    const v = summarizeProvision([novKatze], vertreter, nov, { now: NOW, storno: 0 });
    expect(v.firstYear + v.futureTrail).toBe(220 + 160);
    const m = summarizeProvision([novKatze], makler, nov, { now: NOW, storno: 0 });
    // Makler: 22,5 % von 400 = 90 im 1. Jahr (schon in „Nur jetzt“), dazu 4 weitere Jahre
    expect(m.firstYear).toBe(90);
    expect(m.firstYear + m.futureTrail).toBe(450);
    // mit Storno weniger, keine Abzinsung
    expect(summarizeProvision([novKatze], vertreter, nov, { now: NOW, storno: 0.1 }).futureTrail).toBeLessThan(160);
  });

  it("gekündigte Verträge ab Kündigungsdatum raus", () => {
    const c = contract({ sparte: "katze", premium: 400, signedAt: D("2026-11-10"), periodAt: D("2026-11-10"), status: "storniert", cancelledAt: D("2028-11-10"), cancelReason: "kunde" });
    // Vertreter: Jahr 2 (Nov 2027 bis Nov 2028) noch bezahlt, danach nichts
    expect(summarizeProvision([c], vertreter, nov, { now: NOW, storno: 0.1 }).futureTrail).toBe(40);
  });

  it("Zeitraumwechsel: zwei Hälften ergeben den Monat; Vorzeitraum mit derselben Rechnung", () => {
    const a = contract({ signedAt: D("2026-11-03"), periodAt: D("2026-11-03") });
    const b = contract({ sparte: "kfz", premium: 600, signedAt: D("2026-11-20"), periodAt: D("2026-11-20") });
    const c = contract({ sparte: "hausrat", premium: 200, signedAt: D("2026-10-20"), periodAt: D("2026-10-20"), status: "storniert", cancelledAt: D("2026-11-18"), cancelReason: "widerruf", chargeback: 110 });
    const rows = [a, b, c];
    const whole = summarizeProvision(rows, vertreter, nov, { now: NOW });
    const h1 = summarizeProvision(rows, vertreter, { from: D("2026-11-01"), to: D("2026-11-15") }, { now: NOW });
    const h2 = summarizeProvision(rows, vertreter, { from: D("2026-11-16"), to: D("2026-11-30") }, { now: NOW });
    expect(h1.futureTrail + h2.futureTrail).toBeCloseTo(whole.futureTrail, -1);
    expect(h1.chargeback + h2.chargeback).toBe(whole.chargeback);
    expect(h1.firstYear + h2.firstYear).toBeCloseTo(whole.firstYear, 2);
    // Oktober: Abschluss des später widerrufenen Vertrags zählt dort, Kohorte ohne Bestand nach Widerruf
    const o = summarizeProvision(rows, vertreter, okt, { now: NOW });
    expect(o).toMatchObject({ firstYear: 110, chargeback: 0, futureTrail: 0 });
  });
});

describe("Monatsbericht: immer beide Zahlen", () => {
  const model: ReportModel = {
    version: 2,
    month: "2026-10",
    makler: false,
    closings: 4,
    funnel: null,
    result: {
      lines: [
        { key: "paid", label: "Abschlussprovision aus Leads (einmalig)", amount: 1650, sign: "+" },
        { key: "rueckbelastung", label: "Rückbelastung (gekündigte Verträge)", amount: 110, sign: "-" },
        { key: "leadkosten", label: "Lead-Kosten", amount: 800, sign: "-" },
        { key: "betreuung", label: "Betreuung & Software (inkl. USt., Gutschriften abgezogen)", amount: 250, sign: "-" },
      ],
      gewinn: 490,
      gewinnMitBestand: 2590,
      kuenftigerBestand: 2100,
    },
    bestand: null,
    empfehlungen: null,
    bestandskampagnen: null,
    measures: [],
    tips: [],
    links: { zahlen: "https://app.test/buyer/zahlen", gespraech: null },
  };

  it("E-Mail und Textfassung zeigen Gewinn und Gewinn mit künftigem Bestand", () => {
    expect(nbsp(gewinnPairText(model.result!))).toBe("Gewinn: 490 €, mit künftigem Bestand: 2.590 €");
    const text = nbsp(reportSectionsText(model, "https://app.test").join("\n"));
    expect(text).toContain("Gewinn: 490 €, mit künftigem Bestand: 2.590 €");
    expect(text).toContain("Rückbelastung (gekündigte Verträge)");
    const html = nbsp(reportSectionsHtml(model, "https://app.test"));
    expect(html).toContain("Gewinn mit künftigem Bestand");
    expect(html).toContain("2.590");
    expect(html).toContain("Prognose");
    // Ältere Berichte ohne die zweite Zahl bleiben wie sie sind
    const old = { ...model, result: { lines: model.result!.lines, gewinn: 490 } };
    expect(reportSectionsText(old, "https://app.test").join("\n")).not.toContain("künftigem Bestand");
  });

  it("Prüfung: Gewinn nur mit beiden Zahlen, beide Zahlen erlaubt", () => {
    expect(checkGewinnPair("Ihr Gewinn lag bei 490 €.", model.result)).toContain("beiden Zahlen");
    expect(checkGewinnPair("Gewinn: 490 €, mit künftigem Bestand: 2.590 €.", model.result)).toBeNull();
    expect(checkGewinnPair("Sie hatten 4 Abschlüsse.", model.result)).toBeNull();
    const allowed = reportNumbers(model);
    expect(allowed.has("2590")).toBe(true);
    expect(allowed.has("2100")).toBe(true);
  });
});

describe("Stornoquote der Sparte über die Sätze", () => {
  it("contractProvision meldet die eigene Quote der Sparte", () => {
    const own: ProvisionOverrides = effectiveRates("vertreter", { hausrat: { kind: "percent", rate: 0.55, trail: 0.1, defaultPremium: 120, storno: 0.15 } });
    expect(contractProvision({ sparte: "hausrat", premium: 100 }, own).storno).toBe(0.15);
    expect(contractProvision({ sparte: "katze", premium: 100 }, own).storno).toBeNull();
  });
});
