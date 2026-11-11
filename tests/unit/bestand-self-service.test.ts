import { describe, expect, it } from "vitest";
import { selfBookBlocker } from "@/lib/bestand/self-service";
import { endOfBerlinMonth } from "@/lib/billing";

describe("Bestandskunden-Modul selbst buchen: Voraussetzungen ohne Stripe", () => {
  const base = { plan: "software", paymentOverdueSince: null, existingCustomersEnabled: false, bestandCancelAt: null };
  it("Paket mit Software, keine offene Rechnung, nicht gebucht → weiter prüfen", () => {
    expect(selfBookBlocker(base)).toBeNull();
  });
  it("Nur-Betreuung → Rückfall", () => {
    expect(selfBookBlocker({ ...base, plan: "service" })).toBe("Das Modul gibt es nur im Paket mit Software.");
  });
  it("Zahlungsverzug → Rückfall", () => {
    expect(selfBookBlocker({ ...base, paymentOverdueSince: new Date() })).toBe("Es ist noch eine Rechnung offen.");
  });
  it("schon gebucht → nicht doppelt; gekündigt → wieder buchbar (Kündigung zurücknehmen)", () => {
    expect(selfBookBlocker({ ...base, existingCustomersEnabled: true })).toBe("Das Modul ist bereits gebucht.");
    expect(selfBookBlocker({ ...base, existingCustomersEnabled: true, bestandCancelAt: new Date() })).toBeNull();
  });
});

describe("endOfBerlinMonth (Kündigung ohne Stripe-Zeitraum)", () => {
  const berlin = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "medium" }).format(d);
  it("liegt am letzten Tag des Berliner Monats, spät abends", () => {
    expect(berlin(endOfBerlinMonth(new Date("2026-11-11T10:00:00Z")))).toMatch(/^2026-11-30 2[23]:59:59$/);
    expect(berlin(endOfBerlinMonth(new Date("2026-12-31T22:30:00Z")))).toMatch(/^2026-12-31 2[23]:59:59$/); // Berlin 23:30, noch Dezember
    expect(berlin(endOfBerlinMonth(new Date("2026-12-31T23:30:00Z")))).toMatch(/^2027-01-31 2[23]:59:59$/); // Berlin schon 01.01.
    expect(berlin(endOfBerlinMonth(new Date("2026-07-15T12:00:00Z")))).toMatch(/^2026-07-31 2[23]:59:59$/);
  });
});
