// „3 aktive Verkäufer inklusive“ (Ole, 14.11.2026): reine Logik ohne Datenbank.
import { describe, expect, it } from "vitest";
import {
  addsSeatCost,
  addSeatCostHint,
  berlinDayStart,
  countActiveSellers,
  isActiveSeller,
  legacySeatsToBill,
  seatChange,
  seatsToBill,
  seatSummary,
} from "@/lib/seats";
import { cplSpanne, erfahrungswertText, parseRechnerConfig, resolveCpl, DEFAULT_PRODUCTS } from "@/lib/rechner";
import { NEU_BADGE, NEU_HINWEIS } from "@/lib/produkt-buchen-shared";

const DASH = /[–—]| - /;
/** Intl setzt geschützte Leerzeichen vor „€“ */
const sp = (t: string) => t.replace(/\u00a0/g, " ");

describe("Plätze: aktive Verkäufer", () => {
  const day = new Date("2026-11-14T00:00:00+01:00");

  it("Tagesbeginn Berliner Zeit, auch über Sommer-/Winterzeit", () => {
    expect(berlinDayStart(new Date("2026-11-14T15:30:00Z")).toISOString()).toBe("2026-11-13T23:00:00.000Z");
    expect(berlinDayStart(new Date("2026-11-13T23:30:00Z")).toISOString()).toBe("2026-11-13T23:00:00.000Z");
    expect(berlinDayStart(new Date("2026-07-01T10:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
    // Umstellung 25.10.2026 (03:00 → 02:00): Mitternacht war noch Sommerzeit
    expect(berlinDayStart(new Date("2026-10-25T12:00:00Z")).toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });

  it("aktiv = bekommt Leads oder heute Leads bekommen", () => {
    expect(isActiveSeller({ receivesLeads: true, leadReceivedAt: null }, day)).toBe(true);
    expect(isActiveSeller({ receivesLeads: false, leadReceivedAt: null }, day)).toBe(false);
    expect(isActiveSeller({ receivesLeads: false, leadReceivedAt: new Date("2026-11-14T08:00:00+01:00") }, day)).toBe(true);
    expect(isActiveSeller({ receivesLeads: false, leadReceivedAt: new Date("2026-11-13T23:59:00+01:00") }, day)).toBe(false);
    const team = [
      { receivesLeads: false, leadReceivedAt: null },
      { receivesLeads: true, leadReceivedAt: null },
      { receivesLeads: true, leadReceivedAt: null },
      { receivesLeads: true, leadReceivedAt: null },
    ];
    expect(countActiveSellers(team, day)).toBe(3);
  });

  it("berechnet nur aktive über den inklusiven, nie mehr als die alte Regel", () => {
    expect(seatsToBill({ active: 3, logins: 4, included: 3, price: 49 })).toBe(0);
    expect(seatsToBill({ active: 5, logins: 6, included: 3, price: 49 })).toBe(2);
    expect(seatsToBill({ active: 5, logins: 5, included: 3, price: 0 })).toBe(0);
    // Schutz: selbst eine fehlerhafte Zählung bleibt unter der alten Regel
    expect(seatsToBill({ active: 9, logins: 4, included: 3, price: 49 })).toBe(1);
    for (let logins = 0; logins <= 10; logins++) {
      for (let active = 0; active <= logins; active++) {
        const o = { active, logins, included: 3, price: 49 };
        expect(seatsToBill(o)).toBeLessThanOrEqual(legacySeatsToBill(o));
      }
    }
  });

  it("Kostenhinweis nur, wenn ein weiterer aktiver Verkäufer über die inklusiven kommt", () => {
    expect(addsSeatCost({ active: 2, included: 3, price: 49 })).toBe(false);
    expect(addsSeatCost({ active: 3, included: 3, price: 49 })).toBe(true);
    expect(addsSeatCost({ active: 5, included: 3, price: 0 })).toBe(false);
    expect(sp(addSeatCostHint(49))).toBe("Dieser Verkäufer kostet zusätzlich 49 € netto im Monat, tagesgenau abgerechnet.");
  });

  it("Texte der Team-Seite: Grammatik, ohne Gedankenstriche", () => {
    expect(sp(seatSummary({ included: 3, active: 2, price: 49 }))).toBe(
      "3 aktive Verkäufer sind inklusive, Sie haben 2. Mitglieder ohne Leads (z. B. Inhaber, der nur steuert) sind kostenlos. Jeder weitere Verkäufer kostet 49 € netto im Monat.",
    );
    expect(sp(seatSummary({ included: 3, active: 4, price: 49 }))).toMatch(/Sie haben 4\. .* 1 weiterer Verkäufer kostet 49 € netto im Monat\.$/);
    expect(sp(seatSummary({ included: 3, active: 5, price: 49.5 }))).toMatch(/2 weitere Verkäufer kosten je 49,50 € netto im Monat\.$/);
    expect(seatSummary({ included: 1, active: 1, price: 49 })).toMatch(/^1 aktiver Verkäufer ist inklusive/);
    for (const t of [seatSummary({ included: 3, active: 4, price: 49 }), addSeatCostHint(49)]) expect(t).not.toMatch(DASH);
  });

  it("Änderungsliste: weniger, gleich, Nachberechnung (nie über alter Regel)", () => {
    const base = { customerId: "c", name: "K", included: 3, price: 49 };
    expect(seatChange({ ...base, billed: 1, logins: 4, active: 3 })).toMatchObject({ legacy: 1, next: 0, kind: "weniger" });
    expect(seatChange({ ...base, billed: 1, logins: 4, active: 4 })).toMatchObject({ legacy: 1, next: 1, kind: "gleich" });
    expect(seatChange({ ...base, billed: 0, logins: 5, active: 4 })).toMatchObject({ legacy: 2, next: 1, kind: "nachberechnung" });
  });
});

describe("Leadpreis als Spanne", () => {
  it("Anzeige wie in Oles PDFs, gerechnet mit dem oberen Wert", () => {
    expect(cplSpanne(25, 20)).toBe("20–25 €");
    expect(cplSpanne(6, null)).toBe("6 €");
    expect(cplSpanne(12.5, 10)).toBe("10–12,50 €");
    expect(erfahrungswertText(25, 20, 30)).toBe("Erfahrungswert: ca. 20–25 € pro Lead · bei 30 €/Tag ca. 36 bis 45 Leads im Monat");
    expect(erfahrungswertText(6, null, 30)).toBe("Erfahrungswert: ca. 6 € pro Lead · bei 30 €/Tag ca. 150 Leads im Monat");
  });

  it("Feld „von“: optional, höchstens der obere Wert; ältere Konfiguration bekommt den Standard", () => {
    const raw = (patch: Record<string, unknown>) => ({ products: [{ ...DEFAULT_PRODUCTS[0], ...patch }] });
    expect(parseRechnerConfig(raw({ cplFrom: "4,5" })).config.products[0].cplFrom).toBe(4.5);
    expect(parseRechnerConfig(raw({ cplFrom: "" })).config.products[0].cplFrom).toBeNull();
    const tooHigh = parseRechnerConfig(raw({ cplFrom: 8 }));
    expect(tooHigh.errors.join()).toMatch(/„von“ höchstens/);
    const old = { products: [{ ...DEFAULT_PRODUCTS[0] }] } as { products: Record<string, unknown>[] };
    delete old.products[0].cplFrom;
    expect(parseRechnerConfig(old).config.products[0].cplFrom).toBe(3);
  });

  it("Startwerte: Katze 3 bis 6 (oben nicht gesenkt), Privatschutz 20 bis 25, Hund, Pferd, Kindersparplan; Makler-Wert unverändert", () => {
    const by = Object.fromEntries(DEFAULT_PRODUCTS.map((p) => [p.key, p]));
    expect([by.tkv.cplFrom, by.tkv.cpl, by.tkv.cplMakler]).toEqual([3, 6, 4]);
    expect([by.privatschutz.cplFrom, by.privatschutz.cpl]).toEqual([20, 25]);
    expect([by.hund.cplFrom, by.hund.cpl, by.hund.active]).toEqual([10, 12, false]);
    expect([by.pferd.cplFrom, by.pferd.cpl]).toEqual([11, 13]);
    expect([by.kindersparplan.cplFrom, by.kindersparplan.cpl]).toEqual([15, 20]);
  });

  it("Spanne nur für den Erfahrungswert; höhere echte Daten und Makler-Wert als Einzelwert", () => {
    const tkv = DEFAULT_PRODUCTS[0];
    const info = resolveCpl(tkv, null);
    expect(info).toMatchObject({ cpl: 6, from: 3 });
    expect(info.makler).toMatchObject({ cpl: 4 });
    expect(info.makler?.from).toBeUndefined();
    expect(resolveCpl(tkv, { cpl: 7, leads: 300 }).from).toBeUndefined();
  });

  it("„Neu“ statt „Testprodukt“ mit Oles Text", () => {
    expect(NEU_BADGE).toBe("Neu");
    expect(NEU_HINWEIS).toBe("Neues Produkt: Wir sammeln gerade Erfahrungswerte. Den Leadpreis sehen Sie nach den ersten Wochen in Ihren Zahlen.");
  });
});
