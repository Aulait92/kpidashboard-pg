// Garantien (AGB „Garantien“): Lead-Garantie (30 aktive Tage) und
// Break-even-Garantie (ab 90 aktiven Tagen, monatlich, längstens 6 Monate).
import { describe, expect, it } from "vitest";
import {
  betreuungKosten,
  bewerteBreakEven,
  bewerteGarantien,
  bewerteLeadGarantie,
  bewerteVertragsGarantie,
  ergebnisQuote,
  fortschritt,
  freeMonthsOf,
  gutschriftBetrag,
  heuteTitel,
  isGuaranteeProduct,
  offerHasGuarantee,
  regelnAus,
  startDatum,
  terminQuote,
  type GarantieInput,
} from "@/lib/garantien";
import { DEFAULT_CONFIG, GARANTIE_FRISTEN, VERTRAGS_GARANTIE_MIN_VERTRAEGE, breakEvenTageFuer, type RechnerConfig } from "@/lib/rechner";
import { retainerRows, type RetainerInput } from "@/lib/revenue-ledger";

const DAY = 86_400_000;
const D = (s: string) => new Date(`${s}T10:00:00Z`);
const regeln = regelnAus(DEFAULT_CONFIG);

function tage(from: string, n: number, amount: number) {
  return Array.from({ length: n }, (_, i) => ({ date: new Date(D(from).getTime() + i * DAY), amount }));
}
function leads(n: number, from: string, opts: { source?: string; status?: string | null; spreadDays?: number } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    createdAt: new Date(D(from).getTime() + (i % (opts.spreadDays ?? 20)) * DAY),
    source: opts.source ?? "TKV Katze Meta",
    status: opts.status === undefined ? "Im Gespräch" : opts.status,
  }));
}

const retainer: RetainerInput = { customerId: "c1", monthly: 1000, start: D("2026-11-20"), end: null, softwareShare: 300, pauses: [] };

function input(over: Partial<GarantieInput> = {}): GarantieInput {
  return {
    now: D("2026-12-31"),
    start: D("2026-12-01"),
    startQuelle: "meta",
    spend: tage("2026-12-01", 120, 25),
    pausen: [],
    offeneRechnung: false,
    leads: [],
    abschluesse: [],
    termine: [],
    provisionssaetze: true,
    vermittlerTyp: "vertreter",
    retainer,
    faelle: [],
    ...over,
  };
}

describe("Regeln aus der Rechner-Konfiguration", () => {
  it("nimmt Mindest-Leads und Mindestbudget aus der Konfiguration, Fristen aus GARANTIE_FRISTEN", () => {
    expect(regeln.lead).toEqual({ aktiv: true, minLeads: 100, tage: 30 });
    expect(regeln.minBudgetPerDay).toBe(20);
    expect(regeln.breakeven).toEqual({ aktiv: true, tage: 120, quote: 0.8, maxFreiMonate: 6 });
    expect(regeln.vertrag).toEqual({ aktiv: true, tage: 90, minVertraege: 15, quote: 0.8, maxFreiMonate: 6 });
    expect(VERTRAGS_GARANTIE_MIN_VERTRAEGE).toBe(15);
    expect(GARANTIE_FRISTEN.leadTage).toBe(30);
  });
  it("übernimmt geänderte Werte und Schalter", () => {
    const cfg: RechnerConfig = structuredClone(DEFAULT_CONFIG);
    cfg.products[0].minLeads30 = 80;
    cfg.guarantees.leads.minBudgetPerDay = 25;
    cfg.guarantees.breakEven.enabled = false;
    const r = regelnAus(cfg);
    expect(r.lead.minLeads).toBe(80);
    expect(r.minBudgetPerDay).toBe(25);
    expect(bewerteGarantien(input(), r).map((e) => e.art)).toEqual(["lead"]);
  });
});

describe("Geltung und Start", () => {
  it("Garantie-Produkte: Katze/TKV", () => {
    expect(isGuaranteeProduct("Katzenversicherung (TKV)")).toBe(true);
    expect(isGuaranteeProduct("Tierkrankenversicherung")).toBe(true);
    expect(isGuaranteeProduct("Privatschutz")).toBe(false);
  });
  it("nur angenommene Angebote ab 11.11.2026 mit Garantie-Produkt", () => {
    const products = [{ name: "Katze", dailyBudget: 20 }];
    expect(offerHasGuarantee({ status: "accepted", createdAt: D("2026-11-12"), products })).toBe(true);
    expect(offerHasGuarantee({ status: "accepted", createdAt: D("2026-11-09"), products })).toBe(false);
    expect(offerHasGuarantee({ status: "sent", createdAt: D("2026-11-12"), products })).toBe(false);
    expect(offerHasGuarantee({ status: "accepted", createdAt: D("2026-11-12"), products: [{ name: "PKV" }] })).toBe(false);
  });
  it("Start = erste Meta-Kosten ab Annahme, sonst Go-live, sonst nicht gestartet", () => {
    const spend = [
      { date: D("2026-11-01"), amount: 30 }, // vor Annahme (altes Konto) zählt nicht
      { date: D("2026-11-20"), amount: 0 },
      { date: D("2026-11-21"), amount: 12 },
    ];
    expect(startDatum(spend, D("2026-11-15"), D("2026-11-19"))).toEqual({ start: D("2026-11-21"), quelle: "meta" });
    expect(startDatum([], D("2026-11-15"), D("2026-11-19"))).toEqual({ start: D("2026-11-19"), quelle: "live" });
    expect(startDatum([], D("2026-11-15"), null)).toEqual({ start: null, quelle: null });
    expect(bewerteLeadGarantie(input({ start: null, startQuelle: null }), regeln).status).toBe("nicht_gestartet");
  });
});

describe("Lead-Garantie", () => {
  it("läuft: Tag 12 von 30 mit Fortschritt", () => {
    const e = bewerteLeadGarantie(input({ now: D("2026-12-12"), leads: leads(41, "2026-12-01", { spreadDays: 11 }) }), regeln);
    expect(e.status).toBe("laeuft");
    expect(e.kennzahlen.tag).toBe(12);
    expect(fortschritt(e)).toBe("Tag 12 von 30 · 41 von 100 Leads");
  });
  it("genau 100 Leads in 30 Tagen = erfüllt", () => {
    const e = bewerteLeadGarantie(input({ leads: leads(100, "2026-12-01") }), regeln);
    expect(e.status).toBe("erfuellt");
    expect(e.kennzahlen.ende).toBe("2026-12-30");
  });
  it("99 Leads bei Ø 25 € = Anspruch auf Betreuung + Software im Folgemonat", () => {
    const e = bewerteLeadGarantie(input({ leads: leads(99, "2026-12-01") }), regeln);
    expect(e.status).toBe("anspruch");
    expect(e.kennzahlen.monat).toBe("2027-01");
    expect(e.kennzahlen.betrag).toBe(1000);
    expect(e.fehlend).toEqual([]);
    expect(heuteTitel("Muster", "lead", e.kennzahlen)).toBe(
      "Garantiefall: Muster – Lead-Garantie (99 von 100 Leads) → Betreuung + Software im Januar 2027 kostenlos",
    );
  });
  it("Leads außerhalb des Zeitraums und andere Produkte zählen nicht", () => {
    const e = bewerteLeadGarantie(
      input({ leads: [...leads(90, "2026-12-01"), ...leads(20, "2026-12-01", { source: "Privatschutz" }), ...leads(20, "2026-12-31", { spreadDays: 1 })] }),
      regeln,
    );
    expect(e.kennzahlen.leads).toBe(90);
  });
  it("Budget genau 20 €/Tag reicht, darunter fehlt die Bedingung", () => {
    expect(bewerteLeadGarantie(input({ spend: tage("2026-12-01", 40, 20) }), regeln).status).toBe("anspruch");
    const e = bewerteLeadGarantie(input({ spend: tage("2026-12-01", 40, 15) }), regeln);
    expect(e.status).toBe("bedingungen_fehlen");
    expect(e.fehlend).toEqual(["Werbebudget nur Ø 15 € pro Tag (mind. 20 €)"]);
  });
  it("Tage ohne Ausgaben senken den Schnitt", () => {
    const spend = [...tage("2026-12-01", 15, 30), ...tage("2026-12-16", 15, 0)];
    const e = bewerteLeadGarantie(input({ spend }), regeln);
    expect(e.kennzahlen.budgetSchnitt).toBe(15);
    expect(e.status).toBe("bedingungen_fehlen");
  });
  it("Pause (Urlaub/Krankheit) verlängert den Zeitraum und zählt nicht ins Budget", () => {
    const spend = tage("2026-12-01", 40, 25).map((s) => (s.date >= D("2026-12-10") && s.date <= D("2026-12-14") ? { ...s, amount: 0 } : s));
    const pausen = [{ from: D("2026-12-10"), to: D("2026-12-14") }];
    const lauf = bewerteLeadGarantie(input({ spend, pausen }), regeln);
    expect(lauf.kennzahlen.ende).toBe("2027-01-04");
    expect(lauf.kennzahlen.pausenTage).toBe(5);
    expect(lauf.status).toBe("laeuft");
    expect(fortschritt(lauf)).toBe("Tag 26 von 30 (+5 Pausentage) · 0 von 100 Leads");
    const e = bewerteLeadGarantie(input({ spend, pausen, now: D("2027-01-05"), leads: leads(99, "2026-12-15", { spreadDays: 20 }) }), regeln);
    expect(e.kennzahlen.budgetSchnitt).toBe(25);
    expect(e.status).toBe("anspruch");
    expect(e.kennzahlen.monat).toBe("2027-02");
  });
  it("Zahlungsverzug verlängert ebenfalls, offene Rechnung zum Prüfzeitpunkt verhindert die Gewährung", () => {
    const pausen = [{ from: D("2026-12-20"), to: D("2026-12-21") }];
    const e = bewerteLeadGarantie(input({ pausen, now: D("2027-01-02"), offeneRechnung: true }), regeln);
    expect(e.kennzahlen.ende).toBe("2027-01-01");
    expect(e.status).toBe("bedingungen_fehlen");
    expect(e.fehlend).toEqual(["Offene Rechnung (Zahlungsverzug)"]);
  });
  it("laufende Pause ohne Ende verschiebt das Ende bis heute", () => {
    const e = bewerteLeadGarantie(input({ now: D("2026-12-31"), pausen: [{ from: D("2026-12-20"), to: null }] }), regeln);
    expect(e.status).toBe("laeuft");
    expect(e.kennzahlen.tag).toBe(19);
  });
});

describe("Break-even-Garantie (Bestandsverträge: 90 Tage)", () => {
  // Start 1.12., 90. aktiver Tag = 28.02.2027, erste Prüfung am 1.3.
  const be = (over: Partial<GarantieInput> = {}) => bewerteBreakEven(input({ now: D("2027-03-01"), breakEvenTage: 90, ...over }), regeln);
  const termine = (ok: number, nein: number) => [
    ...Array.from({ length: ok }, () => ({ startsAt: D("2026-12-10"), status: "completed" })),
    ...Array.from({ length: nein }, (_, i) => ({ startsAt: D("2026-12-11"), status: i % 2 ? "no_show" : "booked" })),
  ];

  it("vor Tag 90: läuft mit Provision/Kosten", () => {
    const e = be({ now: D("2027-01-15"), abschluesse: [{ at: D("2026-12-20"), provision: 1240 }] });
    expect(e.status).toBe("laeuft");
    expect(e.kennzahlen.ende).toBe("2027-02-28");
    expect(fortschritt(e)).toMatch(/^Tag 46 von 90 · Provision 1\.240 € \/ Kosten /);
  });
  it("Provision unter Kosten, alle Bedingungen erfüllt → Anspruch auf Betreuung im laufenden Monat", () => {
    const e = be({ abschluesse: [{ at: D("2027-01-10"), provision: 1240 }], termine: termine(8, 2), leads: leads(50, "2026-12-01") });
    expect(e.status).toBe("anspruch");
    expect(e.kennzahlen.monat).toBe("2027-03");
    expect(e.kennzahlen.freiMonatNr).toBe(1);
    expect(e.kennzahlen.werbebudget).toBe(2275); // 1.12.–1.3. = 91 Tage × 25 €
    expect(e.kennzahlen.betreuung).toBeCloseTo(3032.26, 2); // Dez–Feb + 1 Tag März
    expect(e.kennzahlen.betrag).toBe(700); // nur Betreuung (1.000 − 300 Software)
    expect(heuteTitel("Muster", "breakeven", e.kennzahlen)).toBe(
      "Garantiefall: Muster – Break-even-Garantie (Provision 1.240 € / Kosten 5.307 €) → Betreuung im März 2027 kostenlos",
    );
  });
  it("Break-even erreicht → erfüllt", () => {
    expect(be({ abschluesse: [{ at: D("2027-01-10"), provision: 6000 }] }).status).toBe("erfuellt");
  });
  it("Termine: 80 % reicht, 79 % nicht; keine Termine = erfüllt", () => {
    expect(terminQuote(termine(4, 1), D("2027-03-01")).quote).toBe(0.8);
    expect(be({ termine: termine(4, 1) }).status).toBe("anspruch");
    const e = be({ termine: termine(79, 21) });
    expect(e.status).toBe("bedingungen_fehlen");
    expect(e.fehlend).toEqual(["Termine nur zu 79 % wahrgenommen (mind. 80 %)"]);
    expect(be({ termine: [] }).bedingungen.find((b) => b.key === "termine")?.ok).toBe(true);
  });
  it("zukünftige und abgesagte Termine zählen nicht", () => {
    const t = [...termine(4, 0), { startsAt: D("2027-03-05"), status: "booked" }, { startsAt: D("2026-12-12"), status: "cancelled" }];
    expect(terminQuote(t, D("2027-03-01"))).toEqual({ n: 4, quote: 1 });
  });
  it("Ergebnisse: 54 % eingetragen → Bedingung fehlt mit klarem Text", () => {
    const l = [...leads(27, "2026-12-01"), ...leads(23, "2026-12-01", { status: "Neuer Lead" })];
    const e = be({ leads: l });
    expect(e.status).toBe("bedingungen_fehlen");
    expect(e.fehlend).toEqual(["Ergebnisse nur bei 54 % der Leads eingetragen (mind. 80 %)"]);
  });
  it("Ergebnisse: genau 80 % reicht, ganz junge Leads zählen nicht mit, null = kein Ergebnis", () => {
    expect(be({ leads: [...leads(8, "2026-12-01"), ...leads(2, "2026-12-01", { status: null })] }).status).toBe("anspruch");
    expect(ergebnisQuote([{ createdAt: D("2027-02-28"), source: "TKV", status: null }], D("2027-03-01"))).toEqual({ n: 0, quote: null });
  });
  it("ohne eigene Provisionssätze fehlt die Bedingung", () => {
    const e = be({ provisionssaetze: false });
    expect(e.status).toBe("bedingungen_fehlen");
    expect(e.fehlend).toEqual(["Keine eigenen Provisionssätze unter „Meine Provisionen“ hinterlegt"]);
  });
  it("Budget unter 20 € pro aktivem Tag fehlt, Pausen verlängern die 90 Tage", () => {
    expect(be({ spend: tage("2026-12-01", 120, 10) }).fehlend).toEqual(["Werbebudget nur Ø 10 € pro Tag (mind. 20 €)"]);
    const e = be({ pausen: [{ from: D("2027-01-01"), to: D("2027-01-14") }] });
    expect(e.status).toBe("laeuft");
    expect(e.kennzahlen.ende).toBe("2027-03-14");
  });
  it("monatlich neu: zweiter Monat zählt gewährte Betreuung nicht als Kosten", () => {
    const faelle = [{ art: "breakeven" as const, monat: "2027-03", status: "gewaehrt" as const }];
    const e = be({ now: D("2027-04-02"), faelle });
    expect(e.kennzahlen.monat).toBe("2027-04");
    expect(e.kennzahlen.freiMonatNr).toBe(2);
    // März: nur Software (300 €), Betreuung kostenlos
    const ohne = betreuungKosten(retainer, D("2026-12-01"), D("2027-04-02"), []);
    expect(e.kennzahlen.betreuung).toBeCloseTo(ohne - 700, 2);
  });
  it("längstens 6 Monate: ab dem 7. Monat abgelaufen, ebenso nach 6 gewährten Monaten", () => {
    expect(be({ now: D("2027-08-15") }).kennzahlen.freiMonatNr).toBe(6);
    expect(be({ now: D("2027-09-01") }).status).toBe("abgelaufen");
    const sechs = ["2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08"].map((monat) => ({ art: "breakeven" as const, monat, status: "gewaehrt" as const }));
    expect(be({ now: D("2027-08-20"), faelle: sechs }).status).toBe("abgelaufen");
  });
  it("Break-even geht vor Ablauf: erreicht → erfüllt, auch nach 6 Monaten", () => {
    expect(be({ now: D("2027-09-01"), abschluesse: [{ at: D("2027-05-01"), provision: 20_000 }] }).status).toBe("erfuellt");
  });
});

describe("Makler", () => {
  it("Makler: Lead- und Vertrags-Garantie statt Break-even; Vertreter: keine Vertrags-Garantie", () => {
    const i = input({ vermittlerTyp: "makler", now: D("2027-03-01"), leads: leads(40, "2026-12-01"), abschluesse: [] });
    const [lead, zweite, dritte] = bewerteGarantien(i, regeln);
    expect(lead.status).toBe("anspruch");
    expect(zweite.art).toBe("vertrag");
    expect(dritte).toBeUndefined();
    const be = bewerteBreakEven(i, regeln);
    expect(be.status).toBe("nicht_anwendbar");
    expect(be.kennzahlen.monat).toBeUndefined();
    expect(be.bedingungen).toEqual([]);
    expect(fortschritt(be)).toBe("Für Makler gilt die Vertrags-Garantie");
    // Vertreter: Lead + Break-even, Vertrags-Garantie nicht anwendbar
    expect(bewerteGarantien(input({ now: D("2027-03-01") }), regeln).map((e) => e.art)).toEqual(["lead", "breakeven"]);
    const vg = bewerteVertragsGarantie(input({ now: D("2027-03-01") }), regeln);
    expect(vg.status).toBe("nicht_anwendbar");
    expect(fortschritt(vg)).toBe("Für Vertreter gilt die Break-even-Garantie");
  });
  it("Schalter der zweiten Garantie aus → auch keine Vertrags-Garantie", () => {
    const cfg: RechnerConfig = structuredClone(DEFAULT_CONFIG);
    cfg.guarantees.breakEven.enabled = false;
    expect(bewerteGarantien(input({ vermittlerTyp: "makler" }), regelnAus(cfg)).map((e) => e.art)).toEqual(["lead"]);
  });
});

describe("Vertrags-Garantie (Makler)", () => {
  // Start 1.12., 90. aktiver Tag = 28.02.2027, erste Prüfung am 1.3.
  const vertraege = (n: number, at = "2027-01-10") => Array.from({ length: n }, () => ({ at: D(at), provision: 80 }));
  const vg = (over: Partial<GarantieInput> = {}) => bewerteVertragsGarantie(input({ vermittlerTyp: "makler", now: D("2027-03-01"), ...over }), regeln);

  it("vor Tag 90: läuft mit Fortschritt", () => {
    const e = vg({ now: D("2027-01-10"), abschluesse: vertraege(6, "2026-12-20") });
    expect(e.status).toBe("laeuft");
    expect(e.kennzahlen.ende).toBe("2027-02-28");
    expect(fortschritt(e)).toBe("Tag 41 von 90 · 6 von 15 Verträgen");
  });
  it("14 Verträge nach 90 Tagen, alle Bedingungen erfüllt → Anspruch auf Betreuung + Software im laufenden Monat", () => {
    const e = vg({ abschluesse: vertraege(14), leads: leads(50, "2026-12-01") });
    expect(e.status).toBe("anspruch");
    expect(e.kennzahlen.vertraege).toBe(14);
    expect(e.kennzahlen.monat).toBe("2027-03");
    expect(e.kennzahlen.freiMonatNr).toBe(1);
    expect(e.kennzahlen.betrag).toBe(1000); // Betreuung + Software
    expect(e.bedingungen.map((b) => b.key)).toEqual(["budget", "termine", "ergebnisse", "rechnung"]);
    expect(heuteTitel("Muster", "vertrag", e.kennzahlen)).toBe(
      "Garantiefall: Muster – Vertrags-Garantie (14 von 15 Verträgen) → Betreuung + Software im März 2027 kostenlos",
    );
  });
  it("15 Verträge = erfüllt, auch schon vor Tag 90", () => {
    expect(vg({ abschluesse: vertraege(15) }).status).toBe("erfuellt");
    const frueh = vg({ now: D("2027-01-20"), abschluesse: vertraege(15) });
    expect(frueh.status).toBe("erfuellt");
    expect(fortschritt(frueh)).toBe("15 von 15 Verträgen");
  });
  it("Verträge vor dem Start zählen nicht", () => {
    expect(vg({ abschluesse: [...vertraege(10), ...vertraege(10, "2026-11-25")] }).kennzahlen.vertraege).toBe(10);
  });
  it("keine Bedingung „Provisionssätze“", () => {
    expect(vg({ provisionssaetze: false }).status).toBe("anspruch");
  });
  it("Bedingungen: Budget, Termine, Ergebnisse, offene Rechnung", () => {
    expect(vg({ spend: tage("2026-12-01", 120, 10) }).fehlend).toEqual(["Werbebudget nur Ø 10 € pro Tag (mind. 20 €)"]);
    const termine = [
      ...Array.from({ length: 7 }, () => ({ startsAt: D("2026-12-10"), status: "completed" })),
      ...Array.from({ length: 3 }, () => ({ startsAt: D("2026-12-11"), status: "no_show" })),
    ];
    expect(vg({ termine }).fehlend).toEqual(["Termine nur zu 70 % wahrgenommen (mind. 80 %)"]);
    const l = [...leads(7, "2026-12-01"), ...leads(3, "2026-12-01", { status: "Neuer Lead" })];
    expect(vg({ leads: l }).fehlend).toEqual(["Ergebnisse nur bei 70 % der Leads eingetragen (mind. 80 %)"]);
    const e = vg({ offeneRechnung: true });
    expect(e.status).toBe("bedingungen_fehlen");
    expect(e.fehlend).toEqual(["Offene Rechnung (Zahlungsverzug)"]);
  });
  it("Pausen verlängern die 90 Tage", () => {
    const e = vg({ pausen: [{ from: D("2027-01-01"), to: D("2027-01-14") }] });
    expect(e.status).toBe("laeuft");
    expect(e.kennzahlen.ende).toBe("2027-03-14");
  });
  it("monatlich weiter bis 15 erreicht, längstens 6 Monate", () => {
    expect(vg({ now: D("2027-04-02"), faelle: [{ art: "vertrag", monat: "2027-03", status: "gewaehrt" }] }).kennzahlen.freiMonatNr).toBe(2);
    expect(vg({ now: D("2027-08-15") }).kennzahlen.freiMonatNr).toBe(6);
    expect(vg({ now: D("2027-09-01") }).status).toBe("abgelaufen");
    const sechs = ["2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08"].map((monat) => ({ art: "vertrag" as const, monat, status: "gewaehrt" as const }));
    expect(vg({ now: D("2027-08-20"), faelle: sechs }).status).toBe("abgelaufen");
    // im 4. Monat nachgetragen → erfüllt
    expect(vg({ now: D("2027-06-05"), abschluesse: vertraege(15, "2027-05-30") }).status).toBe("erfuellt");
  });
  it("gewährter Monat ist komplett kostenlos (wie Lead-Garantie)", () => {
    const free = retainerRows({ ...retainer, freeMonths: freeMonthsOf([{ art: "vertrag", monat: "2027-03", status: "gewaehrt" }]) }, ["2027-03"], "2027-03");
    expect(free).toEqual([]);
    expect(gutschriftBetrag(retainer, "2027-03", "vertrag")).toBe(1000);
  });
});

describe("Umsatzbuch und Gutschrift", () => {
  it("gewährte Monate senken den Umsatz (Lead: alles, Break-even: nur Betreuung)", () => {
    const months = ["2027-01", "2027-02"];
    const base = retainerRows(retainer, months, "2027-02");
    expect(base.filter((r) => r.month === "2027-01").reduce((n, r) => n + r.amount, 0)).toBe(1000);
    const free = retainerRows({ ...retainer, freeMonths: freeMonthsOf([{ art: "lead", monat: "2027-01", status: "gewaehrt" }, { art: "breakeven", monat: "2027-02", status: "gewaehrt" }]) }, months, "2027-02");
    expect(free.filter((r) => r.month === "2027-01")).toEqual([]);
    expect(free.filter((r) => r.month === "2027-02").map((r) => [r.stream, r.amount])).toEqual([["software", 300]]);
  });
  it("offene oder abgelehnte Fälle ändern nichts", () => {
    expect(freeMonthsOf([{ art: "lead", monat: "2027-01", status: "abgelehnt" }, { art: "lead", monat: "2027-02", status: "offen" }])).toEqual({});
  });
  it("Gutschrift: voller Monat mit Zusätzen (Lead) bzw. nur Betreuung (Break-even)", () => {
    const r = { ...retainer, extras: 49 };
    expect(gutschriftBetrag(r, "2027-02", "lead")).toBe(1049);
    expect(gutschriftBetrag(r, "2027-02", "breakeven")).toBe(700);
    expect(gutschriftBetrag(null, "2027-02", "lead")).toBe(0);
  });
});

describe("Break-even-Garantie ab 13.11.2026: spätestens ab dem 5. Monat profitabel (Prüfung nach 120 aktiven Tagen)", () => {
  it("Frist je Angebot: vor dem Stichtag 90 Tage, danach 120", () => {
    expect(breakEvenTageFuer(new Date("2026-11-12T10:00:00+01:00"))).toBe(90);
    expect(breakEvenTageFuer(new Date("2026-11-14T10:00:00+01:00"))).toBe(120);
  });
  it("neue Verträge: nach 90 Tagen läuft sie noch, Prüfung erst nach dem 120. aktiven Tag", () => {
    const e90 = bewerteBreakEven(input({ now: D("2027-03-01"), abschluesse: [{ at: D("2027-01-10"), provision: 1240 }] }), regeln);
    expect(e90.status).toBe("laeuft");
    expect(e90.kennzahlen.ende).toBe("2027-03-30"); // Start 1.12. + 120 aktive Tage
    expect(fortschritt(e90)).toMatch(/von 120/);
    const e121 = bewerteBreakEven(input({ now: D("2027-04-01"), abschluesse: [{ at: D("2027-01-10"), provision: 1240 }] }), regeln);
    expect(e121.status).not.toBe("laeuft");
  });
});
