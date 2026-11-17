import { describe, expect, it } from "vitest";
import {
  auffaellig,
  kampagnenHinweis,
  punkte,
  schnittAllerKunden,
  tippFuer,
  verlustTipps,
  verlustVergleich,
  verlustVerteilung,
  type VerlustZeile,
} from "@/lib/verlustgruende";
import { hasDash } from "@/lib/monatsbericht/shared";

const z = (lostReason: string | null, o: Partial<VerlustZeile> = {}): VerlustZeile => ({
  status: lostReason === "falsche_daten" || lostReason === "nicht_erreichbar" ? "Disqualifiziert" : "Kein Interesse",
  lostReason,
  reached: true,
  callAttempts: 0,
  ...o,
});
const viele = (n: number, reason: string | null, o: Partial<VerlustZeile> = {}) => Array.from({ length: n }, () => z(reason, o));

describe("Verlustgründe: Verteilung", () => {
  it("zählt je Grund, Anteil an allen verlorenen Leads, häufigster zuerst", () => {
    const v = verlustVerteilung([...viele(4, "nicht_erreichbar", { reached: false, callAttempts: 6 }), ...viele(2, "passt_nicht"), z("schon_versichert")]);
    expect(v.total).toBe(7);
    expect(v.gruende.map((g) => [g.key, g.count])).toEqual([
      ["nicht_erreichbar", 4],
      ["passt_nicht", 2],
      ["schon_versichert", 1],
    ]);
    expect(v.gruende[0].label).toBe("Nicht erreicht");
    expect(v.gruende[0].share).toBeCloseTo(4 / 7);
  });

  it("alte Leads ohne Grund: Kein Interesse gilt als „Kein Interesse“, Disqualifiziert ohne Grund als „Ohne Grund“, alter Grund wird abgebildet", () => {
    const v = verlustVerteilung([
      { status: "Kein Interesse", reached: true, callAttempts: 0 },
      { status: "Disqualifiziert", reached: false, callAttempts: 1 },
      { status: "Disqualifiziert", disqualifyReason: "falsche_nummer", reached: false, callAttempts: 1 },
    ]);
    expect(Object.fromEntries(v.gruende.map((g) => [g.key, g.count]))).toEqual({ kein_interesse: 1, ohne: 1, falsche_daten: 1 });
    // „Ohne Grund“ steht bei gleicher Anzahl hinten
    expect(v.gruende[v.gruende.length - 1].key).toBe("ohne");
  });

  it("zählt Leads, die nie erreicht und mit weniger als 6 Versuchen aufgegeben wurden (ohne falsche Daten)", () => {
    const v = verlustVerteilung([
      z("passt_nicht", { reached: false, callAttempts: 2 }),
      z("sonstiges", { reached: false, callAttempts: 5, lostEarly: true }),
      z("falsche_daten", { reached: false, callAttempts: 1 }),
      z("nicht_erreichbar", { reached: false, callAttempts: 6 }),
      z("passt_nicht", { reached: true, callAttempts: 1 }),
    ]);
    expect(v.unterVersuchen).toBe(2);
  });

  it("leer ohne verlorene Leads", () => {
    expect(verlustVerteilung([])).toEqual({ total: 0, gruende: [], unterVersuchen: 0 });
  });
});

describe("Verlustgründe: Schnitt aller Kunden (anonym)", () => {
  it("erst ab 5 Kunden mit je mindestens 5 verlorenen Leads", () => {
    const by = new Map<string, VerlustZeile[]>();
    for (let i = 0; i < 4; i++) by.set(`k${i}`, viele(5, "passt_nicht"));
    by.set("klein", viele(4, "kein_interesse"));
    expect(schnittAllerKunden(by)).toBeNull();
    by.set("k4", [...viele(4, "nicht_erreichbar"), z("passt_nicht")]);
    const avg = schnittAllerKunden(by)!;
    // jeder Kunde zählt gleich: (4 × 100 % + 20 %) / 5 = 84 %
    expect(avg.passt_nicht).toBeCloseTo(0.84);
    expect(avg.nicht_erreichbar).toBeCloseTo(0.16);
    expect(avg.kein_interesse).toBe(0);
  });
});

describe("Verlustgründe: Vergleich und Tipps", () => {
  const cur = verlustVerteilung([...viele(6, "nicht_erreichbar", { reached: false, callAttempts: 6 }), ...viele(3, "passt_nicht"), z("kein_interesse")]);
  const prev = verlustVerteilung([...viele(2, "nicht_erreichbar", { reached: false, callAttempts: 6 }), ...viele(8, "passt_nicht")]);

  it("Vorzeitraum und Schnitt je Grund", () => {
    const v = verlustVergleich(cur, prev, { nicht_erreichbar: 0.3, passt_nicht: 0.4 });
    const ne = v.find((x) => x.key === "nicht_erreichbar")!;
    expect(ne.share).toBeCloseTo(0.6);
    expect(ne.prevShare).toBeCloseTo(0.2);
    expect(ne.avgShare).toBeCloseTo(0.3);
    expect(v.find((x) => x.key === "kein_interesse")!.avgShare).toBe(0);
    expect(punkte(0.6, 0.2)).toBe("+40 Punkte");
    expect(punkte(0.2, 0.21)).toBe("−1 Punkt");
    expect(punkte(0.2, null)).toBeNull();
  });

  it("ohne Vorzeitraum bzw. Schnitt kein Vergleich", () => {
    const v = verlustVergleich(cur, null, null);
    expect(v.every((x) => x.prevShare == null && x.avgShare == null)).toBe(true);
  });

  it("Tipp nur für auffällige Gründe (häufig und über dem Schnitt), höchstens 2", () => {
    const v = verlustVergleich(cur, prev, { nicht_erreichbar: 0.3, passt_nicht: 0.4 });
    expect(auffaellig(v.find((x) => x.key === "nicht_erreichbar")!)).toBe(true);
    // 30 % liegen unter dem Schnitt von 40 %, im Vorzeitraum waren es 80 %
    expect(auffaellig(v.find((x) => x.key === "passt_nicht")!)).toBe(false);
    const tipps = verlustTipps(v, cur);
    expect(tipps.map((t) => t.key)).toEqual(["verlust_nicht_erreichbar"]);
    expect(tipps[0].title).toBe("Früher und öfter anrufen");
  });

  it("ohne Schnitt reicht ein häufiger Grund (ab 20 %, mindestens 3 Leads)", () => {
    const v = verlustVergleich(cur, null, null);
    expect(verlustTipps(v, cur).map((t) => t.key)).toEqual(["verlust_nicht_erreichbar", "verlust_passt_nicht"]);
  });

  it("Tipp „Nicht zu früh aufgeben“, wenn viele Leads unter 6 Versuchen aufgegeben wurden", () => {
    const v2 = verlustVerteilung([...viele(4, "kein_interesse", { reached: false, callAttempts: 1, lostEarly: true }), z("kein_interesse")]);
    // kein_interesse hat keinen Tipp für den Vermittler (liegt eher an der Kampagne)
    expect(verlustTipps(verlustVergleich(v2, null, null), v2).map((t) => t.key)).toEqual(["verlust_zu_frueh"]);
  });

  it("Kampagnen-Hinweis für den Admin ab 40 % ohne Interesse, falsche Daten oder ohne Anfrage (ab 10 Leads)", () => {
    expect(kampagnenHinweis(verlustVerteilung([...viele(5, "kein_interesse"), ...viele(5, "passt_nicht")]))?.anzahl).toBe(5);
    expect(kampagnenHinweis(verlustVerteilung([...viele(3, "kein_interesse"), ...viele(7, "passt_nicht")]))).toBeNull();
    expect(kampagnenHinweis(verlustVerteilung(viele(5, "kein_interesse")))).toBeNull();
  });

  it("Tipp-Texte ohne Gedankenstriche, Sie-Form, ohne „Garantie“", () => {
    for (const k of ["nicht_erreichbar", "schon_versichert", "passt_nicht"] as const) {
      const t = tippFuer(k)!;
      expect(hasDash(`${t.title} ${t.text}`)).toBe(false);
      expect(t.text).not.toMatch(/garantie|\bdu\b|\bdein/i);
    }
    expect(tippFuer("kein_interesse")).toBeNull();
  });
});
