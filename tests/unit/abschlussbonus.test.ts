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

  it("Vorschlag: heute, ab 18 Uhr der Folgetag", () => {
    expect(abschlussBonusStandardTag(new Date("2026-11-16T16:59:00Z"))).toBe("2026-11-16");
    expect(abschlussBonusStandardTag(new Date("2026-11-16T17:00:00Z"))).toBe("2026-11-17");
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

describe("Abschlussbonus: Präsentation und Mail", () => {
  it("Folie direkt nach „Ihr Paket“, Bildnummern bleiben wie in den PPTX", () => {
    for (const a of ["vertreter", "makler"] as const) {
      const ohne = folienListe(a, false);
      const mit = folienListe(a);
      expect(mit.length).toBe(ohne.length + 1);
      const i = mit.findIndex((f) => f.art === "bonus");
      expect(mit[i - 1].art).toBe("paket");
      expect(mit[i + 1].bild).toBe(ohne[i].bild);
      expect(mit.map((f) => f.nr)).toEqual(mit.map((_, k) => k + 1));
    }
  });

  it("Listenpreise: 300 € heute; ohne Bonus im Angebot keine Folie", () => {
    const p = paketDaten(null, "vertreter");
    expect(p.bonus).toMatchObject({ betrag: 300, bis: null });
    expect(verkaufsFolien("vertreter", p).some((f) => f.titel === "Ihr Abschlussbonus")).toBe(true);
    expect(verkaufsFolien("vertreter", { ...p, bonus: null }).some((f) => f.titel === "Ihr Abschlussbonus")).toBe(false);
    const html = bonusFolie(p, p.bonus!, 21, 23);
    expect(html).toContain("heute bis 23:59 Uhr");
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
