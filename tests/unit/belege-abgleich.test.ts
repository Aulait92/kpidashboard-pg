import { describe, expect, it } from "vitest";
import { anbieterName, anbieterPasst, belegeZuordnen, brauchtBeleg, kennwoerter, type AbgleichBeleg, type AbgleichUmsatz } from "@/lib/belege/abgleich";

const u = (id: string, datum: string, betrag: number, gegenpartei: string, status = "zugeordnet", zweck: string | null = null): AbgleichUmsatz => ({
  id,
  datum,
  betrag,
  gegenpartei,
  zweck,
  status,
});
const b = (id: string, datum: string, brutto: number, firma: string | null, waehrung = "EUR", typ = "INCOMING_INVOICE"): AbgleichBeleg => ({
  id,
  typ,
  firma,
  datum,
  brutto,
  waehrung,
});

describe("brauchtBeleg", () => {
  it("zugeordnete und offene Ausgaben ja, Einnahmen nein", () => {
    expect(brauchtBeleg(u("1", "2026-03-01", -10, "Railway"))).toBe(true);
    expect(brauchtBeleg(u("1", "2026-03-01", -10, "Railway", "neu"))).toBe(true);
    expect(brauchtBeleg(u("1", "2026-03-01", 10, "Kunde"))).toBe(false);
  });
  it("Meta-Werbung ja, auch wenn in der App ignoriert und über Klarna bezahlt", () => {
    expect(brauchtBeleg(u("1", "2026-08-14", -400, "Klarna Bank AB (publ)", "ignoriert", "XA4, FACEBOOK PAYMENTS INTERNATIONAL LIMITED"))).toBe(true);
    expect(brauchtBeleg(u("1", "2026-08-14", -400, "META PLATFORMS IRELAND LIMITED", "ignoriert"))).toBe(true);
  });
  it("Amex-Abrechnung, Steuern, Umbuchung, Privat: nein", () => {
    expect(brauchtBeleg(u("1", "2026-03-01", -900, "American Express", "ignoriert"))).toBe(false);
    expect(brauchtBeleg(u("1", "2026-03-01", -900, "Finanzamt Berlin", "ignoriert"))).toBe(false);
    expect(brauchtBeleg(u("1", "2026-03-01", -900, "Finanzamt Berlin", "neu"))).toBe(false);
  });
});

describe("Anbieter erkennen", () => {
  it("ohne Rechtsform, Meta ↔ Facebook", () => {
    expect(kennwoerter("Anthropic, PBC")).toEqual(["anthropic"]);
    expect(kennwoerter("Meta Platforms Ireland Limited")).toContain("facebook");
    expect(anbieterPasst({ firma: "Telekom Deutschland GmbH" }, { gegenpartei: "TELEKOM DEUTSCHLAND GMBH", zweck: null })).toBe(true);
    expect(anbieterPasst({ firma: "Meta Platforms Ireland Limited" }, { gegenpartei: "Klarna Bank AB", zweck: "FACEBOOK PAYMENTS" })).toBe(true);
    expect(anbieterPasst({ firma: "odacer finanzsoftware GmbH" }, { gegenpartei: "Railway", zweck: null })).toBe(false);
  });
  it("Name für die Liste", () => {
    expect(anbieterName({ gegenpartei: "Klarna Bank AB (publ)", zweck: "FACEBOOK PAYMENTS" })).toBe("Meta (Werbung)");
    expect(anbieterName({ gegenpartei: "RAILWAY *USAGE", zweck: null })).toBe("RAILWAY");
  });
});

describe("belegeZuordnen", () => {
  it("Betrag + Anbieter im Zeitfenster", () => {
    const r = belegeZuordnen([u("t1", "2026-02-20", -49.95, "Telekom Deutschland GmbH")], [b("b1", "2026-02-11", 49.95, "Telekom Deutschland GmbH")]);
    expect(r).toEqual([{ umsatzId: "t1", belegId: "b1" }]);
  });
  it("außerhalb des Zeitfensters nicht", () => {
    expect(belegeZuordnen([u("t1", "2026-05-20", -49.95, "Telekom")], [b("b1", "2026-02-11", 49.95, "Telekom Deutschland GmbH")])).toEqual([]);
    expect(belegeZuordnen([u("t1", "2026-02-01", -49.95, "Telekom")], [b("b1", "2026-02-11", 49.95, "Telekom Deutschland GmbH")])).toEqual([]);
  });
  it("nur Betrag, wenn eindeutig", () => {
    expect(belegeZuordnen([u("t1", "2026-04-05", -29.63, "ODACER")], [b("b1", "2026-04-04", 29.63, null)])).toEqual([{ umsatzId: "t1", belegId: "b1" }]);
  });
  it("nur Betrag und zwei gleiche Umsätze: nicht raten", () => {
    const r = belegeZuordnen([u("t1", "2026-04-05", -50, "A Shop"), u("t2", "2026-04-06", -50, "B Shop")], [b("b1", "2026-04-04", 50, null)]);
    expect(r).toEqual([]);
  });
  it("monatlich gleiche Beträge: jedem Monat sein Beleg", () => {
    const r = belegeZuordnen(
      [u("jan", "2026-01-15", -70.21, "Perspective Software"), u("feb", "2026-02-15", -70.21, "Perspective Software")],
      [b("bjan", "2026-01-15", 70.21, "Perspective Software GmbH"), b("bfeb", "2026-02-15", 70.21, "Perspective Software GmbH")],
    );
    expect(r).toEqual(
      expect.arrayContaining([
        { umsatzId: "jan", belegId: "bjan" },
        { umsatzId: "feb", belegId: "bfeb" },
      ]),
    );
    expect(r).toHaveLength(2);
  });
  it("Fremdwährung mit Anbieter und Betrag ±20 %", () => {
    expect(belegeZuordnen([u("t1", "2026-11-15", -10.4, "ANTHROPIC")], [b("b1", "2026-11-14", 11.95, "Anthropic, PBC", "USD")])).toEqual([{ umsatzId: "t1", belegId: "b1" }]);
    expect(belegeZuordnen([u("t1", "2026-11-15", -10.4, "Railway")], [b("b1", "2026-11-14", 11.95, "Anthropic, PBC", "USD")])).toEqual([]);
  });
  it("eigene Ausgangsrechnungen nie", () => {
    expect(belegeZuordnen([u("t1", "2026-06-10", -3000, "Irgendwer")], [b("b1", "2026-06-05", 3000, "Ole Kannapinn UG", "EUR", "SALES_INVOICE")])).toEqual([]);
  });
  it("Meta über Klarna", () => {
    const r = belegeZuordnen(
      [u("k1", "2026-08-14", -400, "Klarna Bank AB (publ)", "ignoriert", "FACEBOOK PAYMENTS INTERNATIONAL LIMITED")],
      [b("m1", "2026-08-13", 400, "Meta Platforms Ireland Limited")],
    );
    expect(r).toEqual([{ umsatzId: "k1", belegId: "m1" }]);
  });
});

describe("belegeZuordnen: keine falschen Treffer", () => {
  it("Beleg eines anderen Anbieters mit fast gleichem Betrag nie", () => {
    expect(belegeZuordnen([u("t1", "2026-07-29", -20, "ANTHROPIC SAN FRANCISCO")], [b("b1", "2026-07-25", 19.99, "Microsoft 365")])).toEqual([]);
    expect(belegeZuordnen([u("t1", "2026-07-29", -20, "ANTHROPIC SAN FRANCISCO")], [b("b1", "2026-07-25", 20, "Microsoft 365")])).toEqual([]);
  });
  it("ohne Anbieter nur centgenau", () => {
    expect(belegeZuordnen([u("t1", "2026-07-29", -20, "Irgendwer")], [b("b1", "2026-07-25", 19.99, null)])).toEqual([]);
  });
});

describe("belegeZuordnen: doppelte Belege", () => {
  it("per Mail und Portal doppelt: der Beleg vom selben Tag gewinnt, nicht der Vormonat", () => {
    const r = belegeZuordnen(
      [u("aug", "2026-08-19", -29.99, "MICROSOFT MSBILL.INFO")],
      [b("jul", "2026-07-19", 29.99, "Microsoft 365"), b("aug1", "2026-08-19", 29.99, "Microsoft 365"), b("aug2", "2026-08-19", 29.99, "Microsoft 365")],
    );
    expect(r).toHaveLength(1);
    expect(r[0].belegId).toMatch(/^aug/);
  });
});
