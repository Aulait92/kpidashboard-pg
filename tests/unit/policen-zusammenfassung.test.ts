// Fragen für den Termin (Policen auslesen, Paket 1, 19.11.2026): Fristen vorsichtig (minus 1 Tag, Europe/Berlin),
// Kündigungen und Fragen nur Sach, „doppelt“ nur Haftpflicht/Hausrat/Rechtsschutz (K8), feste Vorlagen ohne Wertung.
import { describe, expect, it } from "vitest";
import type { AuslesenSparte, Felder } from "@/lib/policen/auslesen/felder";
import { fristBis, heuteBerlin, kuendigungsfenster, VORLAGEN, zusammenfassung, type VertragKurz } from "@/lib/policen/auslesen/zusammenfassung";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";

const f = (x: Record<string, unknown>): Felder => Object.fromEntries(Object.entries(x).map(([k, w]) => [k, { w: w as never, s: "ok" as const }]));
const v = (id: string, sparte: AuslesenSparte, felder: Record<string, unknown>, geprueft = false): VertragKurz => ({ id, sparte, felder: f(felder), geprueft });
// 19.11.2026, 10 Uhr Berlin
const now = new Date("2026-11-19T09:00:00Z");

describe("Frist vorsichtig berechnet", () => {
  it("bis = (Termin minus Frist) minus 1 Tag", () => {
    expect(fristBis("2027-01-01", 1)).toBe("2026-11-30");
    expect(fristBis("2027-03-01", 1)).toBe("2027-01-31");
    expect(fristBis("2027-01-01", 3)).toBe("2026-09-30");
    expect(fristBis("2027-03-31", 1)).toBe("2027-02-27");
  });

  it("Ablauf 01.01.2027 mit 1 Monat: bis 30.11.2026, noch 11 Tage", () => {
    const z = zusammenfassung([v("a", "kfz", { versicherer: "HUK", ablauf: "2027-01-01", kuendigungsfrist_monate: 1, beitrag: 612, zahlweise: "jaehrlich" })], now);
    expect(z.kuendigungen).toEqual([{ id: "a", sparte: "kfz", versicherer: "HUK", zum: "2027-01-01", bis: "2026-11-30", jahresbetrag: 612, tageBis: 11, verpasst: null, genannt: false }]);
    expect(z.fragen[0]).toMatchObject({ typ: "kuendigung", ids: ["a"], tage: 11 });
    expect(z.fragen[0].text).toBe("Kfz (HUK), 612 € im Jahr laut Unterlage: Kündigung bis 30.11., noch 11\u00a0Tage.");
  });

  it("Ablauf 01.03.2027 mit 1 Monat: bis 31.01.2027 (Jahr ausgeschrieben)", () => {
    const z = zusammenfassung([v("a", "hausrat", { ablauf: "2027-03-01", kuendigungsfrist_monate: 1 })], now);
    expect(z.kuendigungen[0]).toMatchObject({ zum: "2027-03-01", bis: "2027-01-31", tageBis: 73, jahresbetrag: null });
    expect(z.fragen[0].text).toBe("Hausrat: Kündigung bis 31.01.2027, noch 73\u00a0Tage.");
  });

  it("ohne Frist im Dokument: kein tageBis, keine angenommene Frist", () => {
    const z = zusammenfassung([v("a", "kfz", { versicherer: "HUK", ablauf: "2027-01-01" })], now);
    expect(z.kuendigungen[0]).toMatchObject({ bis: null, tageBis: null });
    expect(z.fragen[0].text).toBe("Kfz (HUK), Ablauf 01.01.2027: Kündigungsfrist im Original prüfen.");
    const g = zusammenfassung([v("a", "haftpflicht", { naechster_kuendigungstermin: "2027-01-15" })], now);
    expect(g.fragen[0].text).toBe("Haftpflicht, kündbar zum 15.01.2027: Kündigungsfrist im Original prüfen.");
  });

  it("Kfz ohne Ablauf: Hauptfälligkeit im Original prüfen", () => {
    const z = zusammenfassung([v("a", "kfz", { versicherer: "HUK" })], now, { unterlagenSparten: ["haftpflicht", "hausrat", "rechtsschutz"] });
    expect(z.kuendigungen).toEqual([]);
    expect(z.fragen.map((q) => q.text)).toEqual(["Kfz (HUK): Hauptfälligkeit im Original prüfen."]);
  });

  it("verpasste Frist: nächste Kündigung ein Jahr später", () => {
    const k = kuendigungsfenster(f({ ablauf: "2020-01-01", kuendigungsfrist_monate: 3 }), "2026-11-19");
    expect(k).toEqual({ zum: "2028-01-01", bis: "2027-09-30", verpasst: "2026-09-30", genannt: false });
    const z = zusammenfassung([v("a", "hausrat", { versicherer: "R+V", ablauf: "2020-01-01", kuendigungsfrist_monate: 3 })], now);
    expect(z.kuendigungen[0]).toMatchObject({ verpasst: "2026-09-30", bis: "2027-09-30", tageBis: 315 });
    expect(z.fragen[0].text).toBe("Hausrat (R+V): Frist 30.09. verpasst, nächste Kündigung bis 30.09.2027.");
  });

  it("Tagesgrenze Europe/Berlin: kurz nach Mitternacht zählt schon der neue Tag", () => {
    expect(heuteBerlin(new Date("2026-11-29T23:30:00Z"))).toBe("2026-11-30");
    const z = zusammenfassung([v("a", "kfz", { ablauf: "2027-01-01", kuendigungsfrist_monate: 1 })], new Date("2026-11-29T23:30:00Z"));
    expect(z.kuendigungen[0].tageBis).toBe(0);
    expect(z.fragen[0].text).toContain("heute letzter Tag");
    const morgen = zusammenfassung([v("a", "kfz", { ablauf: "2027-01-01", kuendigungsfrist_monate: 1 })], new Date("2026-11-30T23:30:00Z"));
    expect(morgen.kuendigungen[0]).toMatchObject({ verpasst: "2026-11-30", bis: "2027-11-30" });
  });

  it("Fristen außerhalb von 3 Monaten erzeugen keine Frage", () => {
    const z = zusammenfassung([v("a", "hausrat", { ablauf: "2027-09-01", kuendigungsfrist_monate: 3 })], now);
    expect(z.kuendigungen).toEqual([]);
    expect(z.fragen.filter((q) => q.typ === "kuendigung")).toEqual([]);
  });
});

describe("Doppelt nur Haftpflicht, Hausrat, Rechtsschutz (K8)", () => {
  it("zwei BU, zwei PKV, zwei Leben, zwei Kfz, zwei Wohngebäude: keine Doppelt-Frage", () => {
    for (const s of ["bu", "pkv", "leben", "kfz", "wohngebaeude"] as AuslesenSparte[]) {
      const z = zusammenfassung([v("a", s, { versicherer: "A", beitrag: 10, zahlweise: "monatlich" }), v("b", s, { versicherer: "B", beitrag: 20, zahlweise: "monatlich" })], now);
      expect(z.doppelt, s).toEqual([]);
      expect(z.fragen.filter((q) => q.typ === "doppelt"), s).toEqual([]);
    }
  });

  it("zwei Haftpflicht mit Beiträgen: beide Versicherer und Summe", () => {
    const z = zusammenfassung(
      [v("a", "haftpflicht", { versicherer: "HUK", beitrag: 60, zahlweise: "jaehrlich" }), v("b", "haftpflicht", { versicherer: "ERGO", beitrag: 8, zahlweise: "monatlich" })],
      now,
    );
    expect(z.doppelt).toEqual([{ sparte: "haftpflicht", ids: ["a", "b"], versicherer: ["HUK", "ERGO"], monatSumme: 13 }]);
    const q = z.fragen.find((x) => x.typ === "doppelt");
    expect(q).toMatchObject({ ids: ["a", "b"], jahresbetrag: 156 });
    expect(q?.text).toBe("Haftpflicht zweimal (HUK und ERGO, zusammen 13 € im Monat laut Unterlagen): Werden beide noch gebraucht?");
  });

  it("ohne alle Beiträge: keine Summe, kein Euro", () => {
    const z = zusammenfassung([v("a", "hausrat", { versicherer: "HUK", beitrag: 60, zahlweise: "jaehrlich" }), v("b", "hausrat", { versicherer: "ERGO" })], now);
    expect(z.doppelt[0].monatSumme).toBeNull();
    expect(z.fragen.find((x) => x.typ === "doppelt")?.text).toBe("Hausrat zweimal (HUK und ERGO): Werden beide noch gebraucht?");
  });

  it("gleiche Police zweimal geschickt ist nicht doppelt", () => {
    const x = { versicherer: "HUK", versicherungsnummer: "…1234", beitrag: 60, zahlweise: "jaehrlich" };
    expect(zusammenfassung([v("a", "rechtsschutz", x), v("b", "rechtsschutz", x)], now).doppelt).toEqual([]);
  });
});

describe("Keine Fragen und Kündigungen zu PKV, BU, Leben", () => {
  it("auch mit Ablauf, Frist und Kündigungstermin in den nächsten Wochen", () => {
    const felder = { versicherer: "X", ablauf: "2027-01-01", kuendigungsfrist_monate: 1, naechster_kuendigungstermin: "2027-01-01", beitrag: 300, zahlweise: "monatlich" };
    const z = zusammenfassung([v("a", "pkv", felder), v("b", "bu", felder), v("c", "leben", felder), v("d", "pkv", felder)], now);
    expect(z.kuendigungen).toEqual([]);
    // nur „Nicht geschickt“ (Sach) darf kommen, keine Frage zu den Personenversicherungen
    expect(z.fragen.every((q) => q.typ === "nicht_geschickt")).toBe(true);
    for (const q of z.fragen) expect(q.text).not.toMatch(/Kranken|Berufsunf|Leben|Rente/);
    expect(z.monatSumme).toBe(1200);
    expect(z.jahrSumme).toBe(14400);
  });
});

describe("Nicht geschickt", () => {
  const eine = [v("a", "kfz", { versicherer: "HUK" })];
  it("Haftpflicht, Hausrat, Rechtsschutz gegen alle Unterlagen", () => {
    const z = zusammenfassung(eine, now, { unterlagenSparten: ["kfz", "hausrat"] });
    expect(z.nichtGeschickt).toEqual(["haftpflicht", "rechtsschutz"]);
    expect(z.fragen.at(-1)?.text).toBe("Nicht geschickt: Haftpflicht, Rechtsschutz. Fragen Sie: Wo sind Sie dafür versichert?");
  });
  it("ausgeblendet ohne KI, ohne Auszug oder mit Unterlagen ohne Sparte", () => {
    expect(zusammenfassung(eine, now, { ohneKi: true }).nichtGeschickt).toEqual([]);
    expect(zusammenfassung([], now, { unterlagenSparten: ["kfz"] }).nichtGeschickt).toEqual([]);
    expect(zusammenfassung(eine, now, { unterlagenOhneSparte: 1 }).nichtGeschickt).toEqual([]);
  });
  it("alles da: keine Frage", () => {
    const z = zusammenfassung(eine, now, { unterlagenSparten: ["haftpflicht", "hausrat", "rechtsschutz"] });
    expect(z.fragen.some((q) => q.typ === "nicht_geschickt")).toBe(false);
  });
});

describe("Reihenfolge und Summen", () => {
  it("Kündigung nach Tagen, dann Beitrag; dann doppelt, Bausteine, nicht geschickt", () => {
    const z = zusammenfassung(
      [
        v("h1", "haftpflicht", { versicherer: "HUK", beitrag: 60, zahlweise: "jaehrlich", forderungsausfall: false }),
        v("h2", "haftpflicht", { versicherer: "ERGO", beitrag: 8, zahlweise: "monatlich" }),
        v("k1", "kfz", { versicherer: "Allianz", ablauf: "2027-01-01", kuendigungsfrist_monate: 1, beitrag: 400, zahlweise: "jaehrlich" }),
        v("k2", "kfz", { versicherer: "HUK", ablauf: "2027-01-01", kuendigungsfrist_monate: 1, beitrag: 700, zahlweise: "jaehrlich" }),
        v("r", "hausrat", { versicherer: "R+V", ablauf: "2027-01-15", kuendigungsfrist_monate: 3, elementar: false, beitrag: 120, zahlweise: "jaehrlich" }),
        v("w", "wohngebaeude", { ablauf: "2027-02-01", kuendigungsfrist_monate: 1 }),
      ],
      now,
    );
    expect(z.fragen.map((q) => `${q.typ}:${q.ids.join(",")}`)).toEqual([
      "kuendigung:k2",
      "kuendigung:k1",
      "kuendigung:w",
      "kuendigung:r",
      "doppelt:h1,h2",
      "baustein:r",
      "baustein:h1",
      "nicht_geschickt:",
    ]);
    expect(z.jahrSumme).toBe(60 + 96 + 400 + 700 + 120);
    expect(z.monatSumme).toBeCloseTo(114.66, 2);
  });
});

describe("Vorlagen ohne Wertung", () => {
  const VERBOTEN = /zu teuer|sparen|sollte|empfehl|lücke|luecke|\bfehlt|garantie|unterversichert\b|lohnt sich|umsatzpotenzial|günstiger|billiger|[–—]/i;
  it("alle Vorlagen über viele Fälle ohne verbotene Wörter und ohne Gedankenstriche", () => {
    const k = { id: "a", sparte: "kfz" as const, versicherer: "HUK", zum: "2027-01-01", bis: "2026-11-30", jahresbetrag: 612.4, tageBis: 11, verpasst: "2026-09-30", genannt: true };
    const texte = [
      VORLAGEN.kuendigungBis(k, "2026-11-19"),
      VORLAGEN.kuendigungBis({ ...k, tageBis: 1, jahresbetrag: null }, "2026-11-19"),
      VORLAGEN.kuendigungVerpasst(k, "2026-11-19"),
      VORLAGEN.kuendigungOhneFrist(k),
      VORLAGEN.kuendigungOhneFrist({ ...k, genannt: false }),
      VORLAGEN.kfzOhneAblauf(null),
      VORLAGEN.doppelt({ sparte: "hausrat", ids: ["a", "b", "c"], versicherer: ["A", "B", "C"], monatSumme: 33.5 }),
      VORLAGEN.doppelt({ sparte: "rechtsschutz", ids: ["a", "b"], versicherer: [], monatSumme: null }),
      VORLAGEN.baustein("Hausrat ohne Unterversicherungsverzicht", false),
      VORLAGEN.baustein("Haftpflicht ohne Schlüsselverlust", true),
      VORLAGEN.nichtGeschickt(["haftpflicht", "hausrat", "rechtsschutz"]),
    ];
    const z = zusammenfassung(
      [
        v("a", "haftpflicht", { forderungsausfall: false, schluesselverlust: false, ablauf: "2027-01-01", kuendigungsfrist_monate: 1 }),
        v("b", "haftpflicht", { versicherer: "X" }),
        v("c", "hausrat", { elementar: false, unterversicherungsverzicht: false, ablauf: "2020-01-01", kuendigungsfrist_monate: 3 }),
        v("d", "wohngebaeude", { elementar: false, ablauf: "2027-02-01" }),
        v("e", "kfz", {}),
      ],
      now,
    );
    texte.push(...z.fragen.map((q) => q.text), ...z.bausteine.map((b) => b.text));
    expect(z.fragen.length).toBeGreaterThanOrEqual(9);
    for (const t of texte) {
      expect(t, t).not.toMatch(VERBOTEN);
      expect(ohneGedankenstriche(t)).toBe(t);
    }
  });
});
