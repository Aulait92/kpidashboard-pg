// Usability-Check 25.11.2026: kein „Start am …“ mit vergangenem Datum, Zählung passt zu den Nummern der Schritte.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { einrichtungUntertitel, startNochVorne } from "@/lib/einrichtung-untertitel";

const jetzt = new Date("2026-11-25T10:00:00Z");

describe("Einrichtung: Untertitel", () => {
  it("Start in der Zukunft oder heute: mit Datum", () => {
    expect(einrichtungUntertitel({ liveAt: null, startDate: new Date("2026-12-01T08:00:00Z") }, jetzt)).toBe(
      "Start am Dienstag, 01. Dezember 2026. Bis dahin richten wir alles gemeinsam ein.",
    );
    expect(startNochVorne(new Date("2026-11-25T00:30:00Z"), jetzt)).toBe(true);
  });
  it("Start vorbei, noch nicht live: ohne Datum", () => {
    expect(einrichtungUntertitel({ liveAt: null, startDate: new Date("2026-11-20T08:00:00Z") }, jetzt)).toBe("Wir richten alles gemeinsam ein.");
    expect(startNochVorne(new Date("2026-11-24T22:30:00Z"), jetzt)).toBe(false);
    expect(startNochVorne(null, jetzt)).toBe(false);
  });
  it("live: „Live seit …“", () => {
    expect(einrichtungUntertitel({ liveAt: new Date("2026-11-20T08:00:00Z"), startDate: new Date("2026-11-20T08:00:00Z") }, jetzt)).toBe("Live seit Freitag, 20. November 2026.");
  });
  it("„Start“ trägt keine Nummer, die Nummern laufen nur über die gezählten Schritte", () => {
    const s = readFileSync(path.resolve(__dirname, "../../src/app/buyer/einrichtung/page.tsx"), "utf8");
    expect(s).toContain('<Step title="Start" icon={Rocket}');
    expect(s).not.toMatch(/<Step n=\{nextNo\(\)\} title="Start"/);
    expect(s).not.toMatch(/`Start am \$\{dateFmt/);
  });
});
