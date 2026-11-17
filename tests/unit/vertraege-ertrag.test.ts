// Cross-Selling, Abschluss- vs. Bestandsprovision, Gewinn minus Agenturkosten, Empfehlungen im Gewinn,
// Tipps „So holen Sie mehr raus“ (Ole, 14.11.2026). Reine Funktionen ohne Datenbank.
import { describe, expect, it } from "vitest";
import { EMPFEHLUNG_MODULE_AVAILABLE } from "@/lib/empfehlung/shared";
import {
  bestandGrowth,
  bestandInYears,
  contractProvision,
  effectiveRates,
  premiumFieldForSparte,
  sparteForSource,
  trailNextYears,
} from "@/lib/provision";
import { agencyCostsForRange, proratedMonthly, seatSegments, setupMonths, type AgencyCostConfig } from "@/lib/agenturkosten";
import { leadOrigin, originWhere } from "@/lib/lead-herkunft";
import { contractsPerCustomer, gewinnOf, provisionAusText, summarizeBestand, summarizeProvision } from "@/lib/ertrag";
import type { CustomerContract } from "@/lib/vertraege";
import { crossSellNote, parseContractInput } from "@/lib/vertraege";
import { candidateTips, earlyHint, isDismissed, KOLLEGEN_TIPP_AKTIV, pickTips, withDismissed, type TipSignals } from "@/lib/zahlen-tipps";

const D = (s: string) => new Date(`${s}T12:00:00.000Z`);
const vertreter = effectiveRates("vertreter");
const makler = effectiveRates("makler");

describe("Sparten und Provision je Vertrag", () => {
  it("Sparte aus dem Lead-Produkt (wie die Migration)", () => {
    expect(sparteForSource("TKV-Katze")).toBe("katze");
    expect(sparteForSource("Hund-OP")).toBe("hund");
    expect(sparteForSource("Pferd OP")).toBe("pferd");
    expect(sparteForSource("Hundehaftpflicht")).toBe("privatschutz");
    expect(sparteForSource("Allianz Privatschutz")).toBe("privatschutz");
    expect(sparteForSource("PKV-Tarifoptimierung")).toBe("pkv_tarif");
    expect(sparteForSource("Wechsel")).toBe("pkv_tarif");
    expect(sparteForSource("PKV-Wechsel")).toBe("pkv_tarif");
    expect(sparteForSource("PKV-Neugeschäft")).toBe("pkv");
    expect(sparteForSource("Neugeschäft")).toBe("pkv");
    expect(sparteForSource("BU-Absicherung")).toBe("bu");
    expect(sparteForSource("Berufsunfähigkeit")).toBe("bu");
    expect(sparteForSource("Private Rente")).toBe("leben_bu");
    expect(sparteForSource("Risikoleben")).toBe("leben_bu");
    expect(sparteForSource("Kindersparplan")).toBe("kindersparplan");
    expect(sparteForSource("Empfehlung")).toBeNull();
    expect(sparteForSource(null)).toBeNull();
  });

  it("Vertreter: 55 % Abschluss, Bestand 10 % ab dem 2. Jahr, Gewinn-Basis ohne Bestand", () => {
    const p = contractProvision({ sparte: "katze", premium: 400 }, vertreter);
    expect(p).toMatchObject({ abschluss: 220, trailPerYear: 40, trailFromYear2: true, firstYear: 220, premiumMissing: false });
    // Neue Sparte ohne eigenen Satz: Sach-Standard
    expect(contractProvision({ sparte: "hausrat", premium: 300 }, vertreter)).toMatchObject({ abschluss: 165, trailPerYear: 30, firstYear: 165 });
    // Ohne Beitrag: Standardbeitrag der Sparte (TKV 350 €, Hausrat 120 €; 0 € gibt es nicht mehr)
    expect(contractProvision({ sparte: "hund", premium: null }, vertreter)).toMatchObject({ abschluss: 192.5, premiumMissing: true });
    expect(contractProvision({ sparte: "hausrat", premium: null }, vertreter)).toMatchObject({ abschluss: 66, premiumUsed: 120 });
  });

  it("Makler: keine Abschlussprovision bei Sach, Courtage 1. Jahr = 22,5 % Bestand", () => {
    const p = contractProvision({ sparte: "privatschutz", premium: 600 }, makler);
    expect(p).toMatchObject({ abschluss: 0, trailPerYear: 135, trailFromYear2: false, firstYear: 135 });
    expect(contractProvision({ sparte: "unfall", premium: 200 }, makler).firstYear).toBe(45);
    // PKV-Neugeschäft: 9 Monatsbeiträge
    expect(contractProvision({ sparte: "pkv", premium: 300 }, makler)).toMatchObject({ abschluss: 2700, trailPerYear: 0, firstYear: 2700 });
  });

  it("eigene Sätze je Sparte, Storno = 0, fester Altwert ohne Beitrag", () => {
    const own = effectiveRates("vertreter", { hausrat: { kind: "percent", rate: 0.3, trail: 0.05, defaultPremium: 250 } });
    expect(contractProvision({ sparte: "hausrat", premium: null }, own)).toMatchObject({ abschluss: 75, trailPerYear: 12.5, trailFromYear2: true });
    expect(contractProvision({ sparte: "hausrat", premium: 1000, status: "storniert" }, own).firstYear).toBe(0);
    expect(contractProvision({ sparte: "sonstiges", premium: null, provisionValue: 480 }, vertreter)).toMatchObject({ abschluss: 480, trailPerYear: 0, firstYear: 480 });
    // Mit Beitrag gilt die Rate, nicht der Altwert
    expect(contractProvision({ sparte: "sonstiges", premium: 1000, provisionValue: 480 }, vertreter).firstYear).toBe(550);
  });

  it("Beitragsfeld je Sparte", () => {
    expect(premiumFieldForSparte("pkv", makler).label).toBe("Monatsbeitrag netto");
    expect(premiumFieldForSparte("katze", vertreter).hint).toContain("10 % Bestand pro Jahr ab dem 2. Jahr");
  });
});

describe("Bestandsprovision: in 5 Jahren, Storno, Wachstum", () => {
  const now = D("2026-11-14");
  it("Vertreter: im 1. Vertragsjahr kein Bestand, danach mit 10 % Storno pro Jahr", () => {
    const years = trailNextYears({ trailPerYear: 100, trailFromYear2: true, signedAt: now }, now);
    expect(years[0]).toBe(0);
    expect(years[1]).toBeGreaterThan(80);
    expect(years[1]).toBeLessThan(100);
    expect(years[4]).toBeLessThan(years[1]);
    // Makler: ab sofort
    const m = trailNextYears({ trailPerYear: 100, trailFromYear2: false, signedAt: now }, now);
    expect(m[0]).toBeGreaterThan(90);
    expect(bestandInYears([{ trailPerYear: 100, trailFromYear2: false, signedAt: now }], now)).toBeLessThan(500);
    expect(bestandInYears([{ trailPerYear: 100, trailFromYear2: false, signedAt: now }], now, 5, 0)).toBe(500);
  });

  it("Storno zählt ab heute, nicht ab Abschluss: ein Vertrag von vor 3 Jahren hat diese Jahre überstanden", () => {
    const alt = { trailPerYear: 100, trailFromYear2: false, signedAt: D("2023-11-14") };
    const neu = { trailPerYear: 100, trailFromYear2: false, signedAt: now };
    // gleiche Zukunft wie ein heute abgeschlossener Vertrag (Makler, Bestand ab sofort)
    expect(trailNextYears(alt, now).map((v) => Math.round(v * 100))).toEqual(trailNextYears(neu, now).map((v) => Math.round(v * 100)));
    // 100 € pro Jahr, 10 % Storno: 100 · 0,9^(j+0,5) über 5 Jahre ≈ 388 € (vorher ab Abschluss gerechnet ≈ 283 €)
    expect(bestandInYears([alt], now)).toBeCloseTo(100 * Math.sqrt(0.9) * ((1 - 0.9 ** 5) / 0.1), 0);
    // Vertreter (ab dem 2. Jahr): ein 2 Jahre alter Vertrag zahlt sofort, Storno ebenfalls ab heute
    const v = trailNextYears({ trailPerYear: 100, trailFromYear2: true, signedAt: D("2024-11-14") }, now);
    expect(v[0]).toBeCloseTo(100 * Math.sqrt(0.9), 0);
    // halbes Jahr alt: erst ab dem Jahrestag bezahlt, Storno ab heute bis zur Mitte des bezahlten Teils
    const halb = trailNextYears({ trailPerYear: 100, trailFromYear2: true, signedAt: D("2026-05-15") }, now);
    expect(halb[0]).toBeGreaterThan(45);
    expect(halb[0]).toBeLessThan(50);
  });

  it("Wachstum bei gleichem Tempo steigt Jahr für Jahr", () => {
    const g = bestandGrowth({ existing: [], newPerMonth: 2, avgTrail: 40, fromYear2: true, now });
    expect(g).toHaveLength(5);
    expect(g[0].total).toBeLessThan(g[1].total);
    expect(g[4].total).toBeGreaterThan(g[3].total);
    expect(bestandGrowth({ existing: [], newPerMonth: 0, avgTrail: 40, fromYear2: true, now }).every((x) => x.total === 0)).toBe(true);
  });
});

const contract = (over: Partial<CustomerContract>): CustomerContract => ({
  id: Math.random().toString(36),
  leadId: "l1",
  primary: true,
  sparte: "katze",
  premium: 400,
  provisionValue: null,
  signedAt: D("2026-11-05"),
  periodAt: D("2026-11-01"),
  origin: "paid",
  campaignId: null,
  assignedUserId: null,
  leadCreatedAt: D("2026-11-01"),
  ...over,
});

describe("Provision im Zeitraum: Cross-Selling, Empfehlungen, Zeitraumwechsel", () => {
  const nov = { from: D("2026-11-01"), to: D("2026-11-30") };
  const okt = { from: D("2026-10-01"), to: D("2026-10-31") };
  const rows = [
    contract({ leadId: "a", periodAt: D("2026-10-20"), signedAt: D("2026-10-25") }),
    // Cross-Selling am Oktober-Lead: zählt im November (Abschlussdatum)
    contract({ leadId: "a", primary: false, sparte: "privatschutz", premium: 600, signedAt: D("2026-11-10"), periodAt: D("2026-11-10") }),
    contract({ leadId: "b", origin: "empfehlung", sparte: "hund", premium: 500 }),
    contract({ leadId: "c", origin: "bestand", sparte: "hausrat", premium: 200 }),
  ];
  it("summiert Abschlussprovision, davon Cross-Selling und Herkunft", () => {
    const s = summarizeProvision(rows, vertreter, nov);
    expect(s.contracts).toBe(3);
    expect(s.leads).toBe(3);
    expect(s.firstYear).toBe(330 + 275 + 110);
    expect(s.crossSell).toEqual({ contracts: 1, amount: 330 });
    expect(s.byOrigin.empfehlung).toEqual({ amount: 275, contracts: 1, leads: 1 });
    expect(s.byOrigin.bestand.leads).toBe(1);
    expect(s.trailPerYear).toBe(60 + 50 + 20);
    expect(summarizeProvision(rows, vertreter, okt).firstYear).toBe(220);
    expect(contractsPerCustomer(rows)).toBe(1.3);
  });

  it("Zeile „aus N Abschlüssen“: Verträge und Cross-Selling nennen, „einmalig“ nur ohne Bestand im 1. Jahr", () => {
    const s = summarizeProvision(rows, vertreter, nov);
    expect(provisionAusText(s, false)).toBe("aus 2 Abschlüssen (3 Verträge, davon 1 Cross-Selling), einmalig");
    expect(provisionAusText(summarizeProvision(rows, vertreter, okt), false)).toBe("aus 1 Abschluss, einmalig");
    // KFZ: Bestand ab dem 1. Jahr steckt im Betrag, also nicht „einmalig“
    const kfz = summarizeProvision([contract({ sparte: "kfz", premium: 600 })], vertreter, nov);
    expect(kfz.firstYear).toBeGreaterThan(kfz.abschluss);
    expect(provisionAusText(kfz, false)).toBe("aus 1 Abschluss, inkl. Bestand im 1. Jahr");
    expect(provisionAusText(s, true)).toBe("aus 2 Abschlüssen (3 Verträge, davon 1 Cross-Selling), im 1. Jahr");
  });

  it("Bestand aus allen Verträgen seit Start, Vertreter ab dem 2. Jahr", () => {
    const b = summarizeBestand(rows, vertreter, "vertreter", D("2026-11-14"));
    expect(b.perYear).toBe(40 + 60 + 50 + 20);
    expect(b.contracts).toBe(4);
    expect(b.fromYear2).toBe(true);
    expect(b.inYears).toBeGreaterThan(0);
    expect(b.perMonth).toBeCloseTo(4 / 3, 1);
    const m = summarizeBestand(rows, makler, "makler", D("2026-11-14"));
    expect(m.fromYear2).toBe(false);
  });

  it("Gewinn ehrlich ohne künftigen Bestand", () => {
    expect(gewinnOf(715, 300, 1200)).toBe(-785);
  });
});

describe("Herkunft: Quoten nur aus bezahlten Leads", () => {
  it("erkennt Empfehlung, Bestandskunde und bezahlte Leads", () => {
    expect(leadOrigin({ source: "TKV-Katze", adChannel: "Meta" })).toBe("paid");
    expect(leadOrigin({ source: null, adChannel: null })).toBe("paid");
    expect(leadOrigin({ source: "Empfehlung", adChannel: "Empfehlung" })).toBe("empfehlung");
    expect(leadOrigin({ source: "Privatschutz", referralLinkId: "x" })).toBe("empfehlung");
    expect(leadOrigin({ source: "Bestandskunde" })).toBe("bestand");
  });
  it("Prisma-Filter schließt Leads ohne Quelle ein", () => {
    const w = JSON.stringify(originWhere("paid"));
    expect(w).toContain('{"source":null}');
    expect(w).toContain('{"adChannel":null}');
  });
});

describe("Agenturkosten", () => {
  const now = D("2026-12-31");
  const base: AgencyCostConfig = {
    vatRate: 0.19,
    annualFactor: 1,
    base: [],
    baseInLeadCosts: false,
    logins: [],
    modules: [],
    setup: null,
    whatsapp: [],
    credits: [],
  };
  const nov = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-30T23:59:59Z") };

  it("Abo-Kunde: Monatspreis tagesanteilig und brutto", () => {
    const c = agencyCostsForRange({ ...base, base: [{ from: new Date("2026-11-16T00:00:00Z"), until: null, monthly: 1000 }] }, nov, now);
    expect(c.betreuung).toBeCloseTo(15 * (1000 / 30) * 1.19, 1);
    expect(c.total).toBe(c.betreuung);
  });

  it("Retainer-Kunde: Betreuung steckt in den Lead-Kosten, hier nur die USt", () => {
    const c = agencyCostsForRange({ ...base, baseInLeadCosts: true, base: [{ from: null, until: null, monthly: 1000 }] }, nov, now);
    expect(c.betreuung).toBe(190);
    expect(c.baseInLeadCosts).toBe(true);
  });

  it("Setup über die Mindestlaufzeit verteilt (12 bzw. 3 Monate, ohne Laufzeit 12)", () => {
    expect(setupMonths("12m")).toBe(12);
    expect(setupMonths("3m")).toBe(3);
    expect(setupMonths("none")).toBe(12);
    const setup12 = { ...base, setup: { amount: 1200, from: new Date("2026-01-01T00:00:00Z"), months: 12 } };
    const nov12 = agencyCostsForRange(setup12, nov, now).setup;
    expect(nov12).toBeCloseTo((1200 * 1.19 * 30) / 365, 0);
    const all = agencyCostsForRange(setup12, { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-12-31T23:59:59Z") }, now).setup;
    expect(all).toBeCloseTo(1428, 0);
    const setup3 = { ...base, setup: { amount: 990, from: new Date("2026-11-01T00:00:00Z"), months: 3 } };
    expect(agencyCostsForRange(setup3, nov, now).setup).toBeCloseTo((990 * 1.19 * 30) / 92, 0);
  });

  it("Zeitraumwechsel: zwei Hälften ergeben den Monat, keine Zukunft", () => {
    const cfg = { ...base, base: [{ from: null, until: null, monthly: 1000 }], logins: [{ from: null, until: null, monthly: 49 }] };
    const a = agencyCostsForRange(cfg, { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-15T23:59:59Z") }, now).total;
    const b = agencyCostsForRange(cfg, { from: new Date("2026-11-16T00:00:00Z"), to: new Date("2026-11-30T23:59:59Z") }, now).total;
    expect(a + b).toBeCloseTo(agencyCostsForRange(cfg, nov, now).total, 1);
    expect(agencyCostsForRange(cfg, nov, new Date("2026-11-10T12:00:00Z")).total).toBeCloseTo((10 * 1049 * 1.19) / 30, 1);
    expect(proratedMonthly(300, nov, { from: null, until: null }, now)).toBeCloseTo(300, 5);
  });

  it("Kollegen-Gutschrift mindert die Agenturkosten im Monat der Gutschrift", () => {
    const cfg = { ...base, base: [{ from: null, until: null, monthly: 1000 }], credits: [{ at: new Date("2026-11-20T10:00:00Z"), amount: 1000 }] };
    const c = agencyCostsForRange(cfg, nov, now);
    expect(c.gutschrift).toBe(1190);
    expect(c.total).toBe(0);
    expect(agencyCostsForRange(cfg, { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-31T23:59:59Z") }, now).gutschrift).toBe(0);
  });

  it("WhatsApp-Gebühren und Module; weitere Logins aus dem Abrechnungsprotokoll", () => {
    const c = agencyCostsForRange({ ...base, whatsapp: [{ month: "2026-11", amount: 10 }], modules: [{ from: null, until: null, monthly: 149 }] }, nov, now);
    expect(c.whatsapp).toBeCloseTo(11.9, 1);
    expect(c.module).toBeCloseTo(177.31, 1);
    const segs = seatSegments(2, 49, [{ at: new Date("2026-11-16T00:00:00Z"), details: { from: 0, to: 2 } }], new Date("2026-01-01T00:00:00Z"));
    expect(segs).toEqual([{ from: new Date("2026-11-16T00:00:00Z"), until: null, monthly: 98 }]);
    expect(seatSegments(1, 49, [], null)).toEqual([{ from: null, until: null, monthly: 49 }]);
    expect(seatSegments(3, 0, [], null)).toEqual([]);
  });
});

describe("Eingabe und Erinnerung", () => {
  it("prüft Sparte, Beitrag und Datum", () => {
    const now = D("2026-11-14");
    const ok = parseContractInput({ sparte: "hausrat", premium: "1.234,50", signedAt: "2026-11-01", insurer: " Allianz ", contractNo: "" }, now);
    expect(ok).toEqual({
      ok: true,
      value: { sparte: "hausrat", premium: 1234.5, signedAt: D("2026-11-01"), insurer: "Allianz", contractNo: null, fileId: null, termYears: null, customerAge: null, endAge: null, beitragssumme: null, productName: null, rateAbschluss: null, rateBestand: null },
    });
    expect(parseContractInput({ sparte: "quatsch" }, now).ok).toBe(false);
    expect(parseContractInput({ sparte: "kfz", premium: "-5" }, now).ok).toBe(false);
    expect(parseContractInput({ sparte: "kfz", signedAt: "2027-01-01" }, now).ok).toBe(false);
  });
  it("Hinweis auf naheliegende Sparten", () => {
    expect(crossSellNote(["katze"])).toBe("Weiteres Produkt anbieten? Naheliegend: Privatschutz/Haftpflicht, Unfall");
    expect(crossSellNote(["privatschutz"])).toContain("Hausrat");
    // Cross-Selling A6: erkannte Lücken aus der Terminvorbereitung gehen vor
    expect(crossSellNote(["privatschutz"], [{ label: "Rechtsschutz", status: "luecke" }, { label: "Unfall", status: "woanders" }])).toBe(
      "Weiteres Produkt anbieten? Aus dem Termin: Rechtsschutz (Lücke), Unfall (woanders versichert)",
    );
  });
});

describe("Tipps „So holen Sie mehr raus“", () => {
  const signals: TipSignals = {
    avgProvision: 200,
    paidLeadsPerMonth: 40,
    closedCustomers: 10,
    empfehlungEnabled: false,
    notAskedForReferral: 0,
    kollegenPraemie: 500,
    kollegenEnabled: true,
    bestandImported: true,
    bestandCampaigns: 2,
    withoutCrossSell: 6,
    missingPremium: 0,
    rates: { reach: { own: 0.5, avg: 0.7 }, termin: { own: 0.4, avg: 0.4 }, close: { own: 0.3, avg: 0.3 } },
  };
  const now = D("2026-11-14");

  it("höchstens 3, nach geschätzter Wirkung sortiert, nur Schwachstellen", () => {
    const tips = pickTips(signals, null, now);
    // Wirkung: Empfehlungen 10 × 10 % × 200 € = 200, Erreichbarkeit 40 × 20 Pp. × 12 % × 200 € = 192, Cross-Selling 6 × 15 % × 200 € = 180
    // Empfehlungs-Tipp nur, solange das Modul buchbar ist (Ole, 15.11.2026: vorerst aus)
    expect(tips.map((t) => t.key)).toEqual(EMPFEHLUNG_MODULE_AVAILABLE ? ["empfehlung_an", "erreichbarkeit", "cross_sell"] : ["erreichbarkeit", "cross_sell"]);
    expect(tips.length).toBeLessThanOrEqual(3);
    // Quoten im Schnitt: kein Quoten-Tipp
    expect(candidateTips({ ...signals, rates: { ...signals.rates, reach: { own: 0.7, avg: 0.7 } } }).some((t) => t.key === "erreichbarkeit")).toBe(false);
    // Erledigt (Modul an, alle gefragt) → fällt weg
    expect(candidateTips({ ...signals, empfehlungEnabled: true }).some((t) => t.key.startsWith("empfehlung"))).toBe(false);
  });

  it("Kollegen-Tipp ist vorerst aus (Schalter)", () => {
    expect(KOLLEGEN_TIPP_AKTIV).toBe(false);
    expect(candidateTips(signals).some((t) => t.key === "kollegen")).toBe(false);
  });

  it("Wegklicken für 30 Tage, danach wieder sichtbar", () => {
    const d = withDismissed(null, "erreichbarkeit", now);
    expect(isDismissed(d, "erreichbarkeit", new Date(now.getTime() + 29 * 86_400_000))).toBe(true);
    expect(isDismissed(d, "erreichbarkeit", new Date(now.getTime() + 31 * 86_400_000))).toBe(false);
    expect(pickTips(signals, d, now).map((t) => t.key)).toEqual(EMPFEHLUNG_MODULE_AVAILABLE ? ["empfehlung_an", "cross_sell"] : ["cross_sell"]);
  });

  it("Sie-Form, ohne Gedankenstriche und ohne Garantie", () => {
    const all = candidateTips({ ...signals, kollegenEnabled: true, missingPremium: 2, bestandImported: false, rates: { reach: { own: 0.4, avg: 0.7 }, termin: { own: 0.2, avg: 0.4 }, close: { own: 0.1, avg: 0.3 } } });
    for (const t of all) {
      const txt = `${t.title} ${t.text} ${t.cta}`;
      expect(txt).not.toMatch(/[–—]| - /);
      expect(txt).not.toMatch(/garantie/i);
      expect(txt).not.toMatch(/\b(du|dein|deine|dir)\b/i);
    }
    expect(earlyHint(1, 1234)).toContain("in 5 Jahren");
    expect(earlyHint(5, 1234)).toBeNull();
  });
});
