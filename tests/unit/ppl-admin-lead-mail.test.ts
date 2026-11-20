import { describe, expect, it } from "vitest";
import { adminLeadMail, adminMailAn, adminMailProdukte } from "@/lib/ppl/admin-lead-mail";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

describe("Lead-Mail an Ole (eigene Funnels)", () => {
  it("Produkte: Standard PKV, Liste, aus", () => {
    expect(adminMailProdukte({})).toEqual(["PKV-Tarifoptimierung"]);
    expect(adminMailProdukte({ PPL_ADMIN_MAIL_PRODUKTE: "PKV-Tarifoptimierung, Kindersparpläne" })).toEqual(["PKV-Tarifoptimierung", "Kindersparpläne"]);
    expect(adminMailProdukte({ PPL_ADMIN_MAIL_PRODUKTE: "aus" })).toEqual([]);
    expect(adminMailAn({})).toBe("hallo@olekannapinn.com");
  });
  it("Betreff mit Ergebnis und Bezieher, alle Angaben in der Liste", () => {
    const m = adminLeadMail({
      product: "PKV-Tarifoptimierung", status: "delivered", reason: null, customer: "Heinrich von Kleist", bezug: "HvK Frankfurt (30 km um 63303)",
      name: "Petra Muster", phone: "4915112345678", email: "petra@example.test", plz: "60311", contribution: "780 € im Monat", insurer: "Debeka",
      civilServant: false, answers: [{ label: "Alter", value: "58" }], createdAt: new Date("2026-11-22T09:00:00Z"), adminUrl: null,
    });
    expect(m.subject).toBe("Neuer Lead PKV-Tarifoptimierung: Petra, 60311, geliefert an Heinrich von Kleist (HvK Frankfurt (30 km um 63303))");
    expect(m.list).toContain("Telefon: +4915112345678");
    expect(m.list).toContain("Alter: 58");
    expect(m.list).toContain("Beitrag: 780 € im Monat");
    expect(hatGedankenstrich([m.subject, ...m.list].join(" "))).toBe(false);
  });
  it("geparkt und Dublette mit Grund, ohne Bezieher", () => {
    const base = { product: "PKV-Tarifoptimierung", customer: null, bezug: null, name: null, phone: null, email: "a@b.test", plz: null, contribution: null, insurer: null, civilServant: null, answers: [], createdAt: new Date(), adminUrl: null };
    expect(adminLeadMail({ ...base, status: "duplicate", reason: "schon am 20.11.2026" }).list[0]).toBe("Ergebnis: Dublette (schon am 20.11.2026)");
    expect(adminLeadMail({ ...base, status: "parked", reason: "wird verteilt" }).subject).toBe("Neuer Lead PKV-Tarifoptimierung: ohne Namen, geparkt (kein freier Bezug)");
  });
});
