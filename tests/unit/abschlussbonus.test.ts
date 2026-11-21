import { describe, expect, it } from "vitest";
import {
  abschlussBonusFrist,
  abschlussBonusJetzt,
  abschlussBonusStandardTag,
  berlinTagesende,
  berlinTagesendeIso,
} from "@/lib/offer-pricing";
import { bonusFolie, bonusFristText, folienListe, paketDaten, verkaufsFolien } from "@/lib/vertrieb/verkaufspraesentation";
import { offerBonusLine } from "@/lib/email";

describe("Abschlussbonus: Frist", () => {
  it("Tagesende in Berlin, Winter- und Sommerzeit", () => {
    expect(berlinTagesende(new Date("2026-11-16T10:00:00Z")).toISOString()).toBe("2026-11-16T22:59:59.000Z");
    expect(berlinTagesende(new Date("2026-07-01T23:30:00Z")).toISOString()).toBe("2026-07-02T21:59:59.000Z");
    expect(berlinTagesendeIso("2026-11-17").toISOString()).toBe("2026-11-17T22:59:59.000Z");
  });

  it("Vorschlag: morgen", () => {
    expect(abschlussBonusStandardTag(new Date("2026-11-16T08:00:00Z"))).toBe("2026-11-17");
    expect(abschlussBonusStandardTag(new Date("2026-11-16T23:30:00Z"))).toBe("2026-11-18");
  });

  it("gesetzte Frist geht vor, sonst Versandtag, sonst Erstellungstag", () => {
    const createdAt = new Date("2026-11-15T09:00:00Z");
    expect(abschlussBonusFrist({ abschlussBonus: 300, createdAt, setupFee: 990 })?.toISOString()).toBe("2026-11-15T22:59:59.000Z");
    expect(abschlussBonusFrist({ abschlussBonus: 300, createdAt, sentAt: new Date("2026-11-16T08:00:00Z"), setupFee: 990 })?.toISOString()).toBe("2026-11-16T22:59:59.000Z");
    expect(abschlussBonusFrist({ abschlussBonus: 300, createdAt, abschlussBonusBis: berlinTagesendeIso("2026-11-18"), setupFee: 990 })?.toISOString()).toBe("2026-11-18T22:59:59.000Z");
    expect(abschlussBonusFrist({ abschlussBonus: null, createdAt, setupFee: 990 })).toBeNull();
  });

  it("gilt bis zur Frist, höchstens das Setup", () => {
    const o = { abschlussBonus: 300, abschlussBonusBis: berlinTagesendeIso("2026-11-17"), createdAt: new Date("2026-11-16T20:00:00Z"), setupFee: 990 };
    expect(abschlussBonusJetzt(o, new Date("2026-11-17T22:00:00Z"))?.betrag).toBe(300);
    expect(abschlussBonusJetzt(o, new Date("2026-11-17T23:00:00Z"))).toBeNull();
    expect(abschlussBonusJetzt({ ...o, setupFee: 200 }, new Date("2026-11-17T10:00:00Z"))?.betrag).toBe(200);
    expect(abschlussBonusJetzt({ ...o, setupFee: 0 }, new Date("2026-11-17T10:00:00Z"))).toBeNull();
  });
});

describe("Abschlussbonus: später zahlen (Ole, 16.11.2026: Abschluss zählt)", () => {
  const bis = berlinTagesendeIso("2026-11-18");
  const basis = { abschlussBonus: 300, abschlussBonusBis: bis, createdAt: new Date("2026-11-16T10:00:00Z"), setupFee: 990, allowPayLater: true };
  const nachFrist = new Date("2026-11-25T10:00:00Z");

  it("rechtzeitig angenommen: Bonus bleibt auch bei späterer Zahlung", () => {
    const o = { ...basis, acceptedAt: new Date("2026-11-18T20:00:00Z") };
    expect(abschlussBonusJetzt(o, nachFrist)).toMatchObject({ betrag: 300, gesichert: true });
  });
  it("zu spät angenommen oder ohne „später zahlen“: nach der Frist kein Bonus", () => {
    expect(abschlussBonusJetzt({ ...basis, acceptedAt: new Date("2026-11-19T08:00:00Z") }, nachFrist)).toBeNull();
    expect(abschlussBonusJetzt({ ...basis, allowPayLater: false, acceptedAt: new Date("2026-11-18T20:00:00Z") }, nachFrist)).toBeNull();
  });
  it("vor der Annahme: wie bisher bis zur Frist, nicht gesichert", () => {
    expect(abschlussBonusJetzt(basis, new Date("2026-11-17T10:00:00Z"))).toMatchObject({ gesichert: false });
    expect(abschlussBonusJetzt(basis, nachFrist)).toBeNull();
  });
  it("Mailzeile mit „später zahlen“ verlangt nur die Annahme", () => {
    const t = offerBonusLine({ betrag: 300, bis }, false, true);
    expect(t).toContain("annehmen, sparen Sie 300 €");
    expect(t).toContain("auch später");
    expect(t).not.toMatch(/[–—]/);
  });
});

describe("Abschlussbonus: Präsentation und Mail (seit 21.11.2026 nur noch zugesagte Boni)", () => {
  it("Listenpreise: kein Bonus mehr, keine Bonusfolie", () => {
    const p = paketDaten(null, "vertreter");
    expect(p.bonus).toBeNull();
    expect(verkaufsFolien("vertreter", p).some((f) => f.titel === "Ihr Abschlussbonus")).toBe(false);
  });

  it("Angebot mit zugesagtem Bonus: Folie mit Frist, ohne Gedankenstriche", () => {
    const p = { ...paketDaten(null, "vertreter"), bonus: { betrag: 300, setupVorher: 2490, setupNachher: 2190, bis: berlinTagesendeIso("2026-11-23") } };
    const folien = verkaufsFolien("vertreter", p);
    expect(folien.some((f) => f.titel === "Ihr Abschlussbonus")).toBe(true);
    expect(folienListe("vertreter", { bonus: true }).findIndex((f) => f.art === "bonus")).toBe(folien.length - 2);
    const html = bonusFolie(p, p.bonus, 21, 23);
    expect(html).toContain("bis Montag, 23. November, 23:59 Uhr");
    expect(html).not.toMatch(/[–—]/);
  });

  it("Frist als Text und Mailzeile ohne Gedankenstriche", () => {
    expect(bonusFristText(berlinTagesendeIso("2026-11-17"))).toBe("bis Dienstag, 17. November, 23:59 Uhr");
    const sie = offerBonusLine({ betrag: 300, bis: berlinTagesendeIso("2026-11-17") }, false);
    expect(sie).toContain("Dienstag, 17. November, 23:59 Uhr");
    expect(sie).toContain("300 €");
    expect(offerBonusLine({ betrag: 300, bis: berlinTagesendeIso("2026-11-17") }, true)).toContain("sparst du");
    expect(sie).not.toMatch(/[–—]/);
  });
});
