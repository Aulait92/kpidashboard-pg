import { describe, expect, it } from "vitest";
import { fingerprintOf, nextLiveState, type FingerprintParts } from "@/lib/live-state";

const base: FingerprintParts = {
  leads: { count: 12, lastCreated: new Date("2026-11-10T08:00:00Z"), lastStatus: new Date("2026-11-10T09:00:00Z") },
  conversations: { count: 5, lastUpdated: new Date("2026-11-10T09:30:00Z"), attention: 1 },
  appointments: { count: 3, lastUpdated: new Date("2026-11-09T17:00:00Z") },
};
const fp = (patch: (p: FingerprintParts) => void) => {
  const p = structuredClone(base);
  patch(p);
  return fingerprintOf(p);
};

describe("Live-Aktualisierung: Fingerabdruck", () => {
  it("ist stabil für gleiche Daten und enthält keine Inhalte", () => {
    expect(fingerprintOf(base)).toBe(fingerprintOf(structuredClone(base)));
    expect(fingerprintOf(base)).toMatch(/^l12\.[^|]+\|c5\.[^|]+\.1\|a3\.[^|]+$/);
  });

  it("ändert sich bei neuem Lead, Statuswechsel, neuer Nachricht, „braucht dich“ und Termin", () => {
    const a = fingerprintOf(base);
    expect(fp((p) => { p.leads.count = 13; p.leads.lastCreated = new Date("2026-11-10T10:00:00Z"); })).not.toBe(a);
    expect(fp((p) => { p.leads.lastStatus = new Date("2026-11-10T10:00:00Z"); })).not.toBe(a);
    expect(fp((p) => { p.conversations.lastUpdated = new Date("2026-11-10T10:00:01Z"); })).not.toBe(a);
    expect(fp((p) => { p.conversations.attention = 2; })).not.toBe(a);
    expect(fp((p) => { p.appointments.lastUpdated = new Date("2026-11-10T10:00:00Z"); })).not.toBe(a);
    expect(fp((p) => { p.leads.count = 11; })).not.toBe(a); // gelöscht
  });

  it("kommt mit leeren Konten zurecht", () => {
    const empty: FingerprintParts = { leads: { count: 0, lastCreated: null, lastStatus: null }, conversations: { count: 0, lastUpdated: null, attention: 0 }, appointments: { count: 0, lastUpdated: null } };
    expect(fingerprintOf(empty)).toBe("l0.-.-|c0.-.0|a0.-");
  });
});

describe("Live-Aktualisierung: wann neu laden", () => {
  it("lädt bei der ersten Meldung nicht neu (nur Ausgangswert)", () => {
    expect(nextLiveState(null, "x")).toEqual({ last: "x", changed: false });
  });
  it("lädt nur bei Änderung neu", () => {
    expect(nextLiveState("x", "x").changed).toBe(false);
    expect(nextLiveState("x", "y")).toEqual({ last: "y", changed: true });
  });
});
