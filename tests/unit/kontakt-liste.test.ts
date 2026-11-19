import { describe, expect, it } from "vitest";
import { eingangKurz, frischUnberuehrt, istZuTun, kontaktAnsicht, zuTunRang } from "@/lib/kontakt-liste";

const now = new Date("2026-11-19T15:00:00+01:00");
const vor = (min: number) => new Date(now.getTime() - min * 60_000);

describe("eingangKurz", () => {
  it("zeigt frische Leads relativ", () => {
    expect(eingangKurz(vor(0.5), now)).toBe("gerade eben");
    expect(eingangKurz(vor(4), now)).toBe("vor 4 Min.");
    expect(eingangKurz(vor(59), now)).toBe("vor 59 Min.");
    expect(eingangKurz(vor(3 * 60 + 10), now)).toBe("vor 3 Std.");
  });
  it("ältere als Tag", () => {
    expect(eingangKurz(new Date("2026-11-19T01:00:00+01:00"), now)).toBe("heute");
    expect(eingangKurz(new Date("2026-11-18T09:00:00+01:00"), now)).toBe("gestern");
    expect(eingangKurz(new Date("2026-11-10T09:00:00+01:00"), now)).toBe("10.11.");
    expect(eingangKurz(new Date("2025-12-30T09:00:00+01:00"), now)).toBe("30.12.2025");
  });
  it("heute, aber länger als 12 Stunden her", () => {
    const spaet = new Date("2026-11-19T23:30:00+01:00");
    expect(eingangKurz(new Date("2026-11-19T00:10:00+01:00"), spaet)).toBe("heute");
  });
});

describe("Zu erledigen", () => {
  const basis = { createdAt: vor(3 * 24 * 60), reached: true, closedAt: null, status: "Erreicht" };
  it("frisch und unberührt nur unter 24 Stunden", () => {
    expect(frischUnberuehrt({ ...basis, reached: false, status: "Neuer Lead", createdAt: vor(10) }, now)).toBe(true);
    expect(frischUnberuehrt({ ...basis, reached: false, status: "Neuer Lead", createdAt: vor(25 * 60) }, now)).toBe(false);
    expect(frischUnberuehrt({ ...basis, createdAt: vor(10) }, now)).toBe(false);
  });
  it("gehört dazu bei Antwort, Ergebnis, fälliger Wiedervorlage, Rückruf, ohne Schritt", () => {
    expect(istZuTun(basis, now)).toBe(false);
    expect(istZuTun({ ...basis, waiting: true }, now)).toBe(true);
    expect(istZuTun({ ...basis, resultMissing: true }, now)).toBe(true);
    expect(istZuTun({ ...basis, followUpAt: new Date("2026-11-19T20:00:00+01:00").toISOString() }, now)).toBe(true);
    expect(istZuTun({ ...basis, followUpAt: new Date("2026-11-20T09:00:00+01:00").toISOString() }, now)).toBe(false);
    expect(istZuTun({ ...basis, callback: true }, now)).toBe(true);
    expect(istZuTun({ ...basis, noNextStep: true }, now)).toBe(true);
    // frischer Lead ohne Kontakt gehört dazu, außer der Assistent schreibt schon
    const frisch = { ...basis, reached: false, status: "Neuer Lead", createdAt: vor(4) };
    expect(istZuTun(frisch, now)).toBe(true);
    expect(istZuTun({ ...frisch, botActive: true }, now)).toBe(false);
  });
  it("Rang: Antwort wartet vor neuem Lead vor Ergebnis vor Wiedervorlage", () => {
    const liste = [
      { k: "rest", ...basis, noNextStep: true },
      { k: "wv", ...basis, followUpAt: vor(60).toISOString() },
      { k: "neu", ...basis, reached: false, status: "Neuer Lead", createdAt: vor(5), noNextStep: true },
      { k: "erg", ...basis, resultMissing: true },
      { k: "antwort", ...basis, waiting: true },
    ];
    expect(liste.sort((a, b) => zuTunRang(a, now) - zuTunRang(b, now)).map((x) => x.k)).toEqual(["antwort", "neu", "erg", "wv", "rest"]);
  });
});

describe("Standardansicht", () => {
  it("ohne Parameter „Zu erledigen“, mit Suche oder Filter alle, sonst wie gewählt", () => {
    expect(kontaktAnsicht("")).toBe("zu-tun");
    expect(kontaktAnsicht(undefined)).toBe("zu-tun");
    expect(kontaktAnsicht("", { suche: true })).toBe("alle");
    expect(kontaktAnsicht("", { filter: true })).toBe("alle");
    expect(kontaktAnsicht("alle")).toBe("alle");
    expect(kontaktAnsicht("ohne-schritt")).toBe("ohne-schritt");
  });
});
