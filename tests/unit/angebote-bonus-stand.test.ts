// Angebotsübersicht: bis wann der Abschlussbonus gilt (Ole, 18.11.2026)
import { describe, expect, it } from "vitest";
import { bonusStand, bonusZeile } from "@/lib/vertrieb/angebote-uebersicht";

const sentAt = new Date("2026-11-18T09:00:00Z");
const basis = { abschlussBonus: 500, setupFee: 990, sentAt, createdAt: sentAt, abschlussBonusBis: null, acceptedAt: null, allowPayLater: false };

describe("Abschlussbonus in der Angebotsübersicht", () => {
  it("ohne Bonus: nichts", () => {
    expect(bonusStand({ ...basis, abschlussBonus: null }, sentAt)).toBeNull();
  });
  it("läuft bis Versandtag 23:59 Berlin", () => {
    const b = bonusStand(basis, new Date("2026-11-18T15:00:00Z"))!;
    expect(b.stand).toBe("laeuft");
    expect(bonusZeile(b)).toBe("Bonus 500 € bis 18.11., 23:59");
  });
  it("gesetzte Frist hat Vorrang", () => {
    const b = bonusStand({ ...basis, abschlussBonusBis: new Date("2026-11-20T22:59:59Z") }, sentAt)!;
    expect(bonusZeile(b)).toBe("Bonus 500 € bis 20.11., 23:59");
  });
  it("nach der Frist abgelaufen", () => {
    const b = bonusStand(basis, new Date("2026-11-19T08:00:00Z"))!;
    expect(b.stand).toBe("abgelaufen");
    expect(bonusZeile(b)).toBe("Bonus abgelaufen (18.11., 23:59)");
  });
  it("gewährt: genutzt", () => {
    const b = bonusStand({ ...basis, abschlussBonusGewaehrt: 500, acceptedAt: sentAt }, new Date("2026-11-25T08:00:00Z"))!;
    expect(bonusZeile(b)).toBe("Bonus 500 € genutzt");
  });
  it("höchstens die Einrichtung", () => {
    expect(bonusStand({ ...basis, abschlussBonus: 2000 }, sentAt)!.betrag).toBe(990);
  });
});
