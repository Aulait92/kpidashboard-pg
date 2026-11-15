// E-Mail-Vorlagen (Ole, 15.11.2026): Signatur nie im Betreff; ohne bekannte Anrede neutral statt vollem Namen.
import { describe, expect, it } from "vitest";
import { STANDARD_VORLAGEN_JE } from "@/lib/mail/vorlagen";
import { fuelle, fuelleMitSignatur, werteFuer } from "@/lib/mail/platzhalter";

const SIG = "Ole Kannapinn\nOle Agentur";
const lead = (extra: Record<string, unknown> = {}) => ({ name: "Nina Winter", source: "Privatschutz", ...extra });

describe("E-Mail-Vorlagen: Betreff und Anrede", () => {
  for (const an of ["sie", "du"] as const) {
    for (const v of STANDARD_VORLAGEN_JE[an]) {
      for (const sig of ["", SIG]) {
        for (const l of [lead(), lead({ salutation: "Frau" }), { name: null, source: "Privatschutz" }]) {
          it(`${an} · ${v.name} · ${sig ? "mit" : "ohne"} Signatur · ${l.name ? ("salutation" in l ? "Frau" : "ohne Anrede") : "ohne Name"}`, () => {
            const w = { ...werteFuer(l, "Ole Kannapinn", { ansprache: an, terminlink: "https://www.dein-beratungstermin.de/ole" }), signatur: sig };
            const subject = fuelle(v.subject, w);
            expect(subject).not.toContain("Ole Kannapinn");
            expect(subject).not.toContain("\n");
            expect(subject).not.toMatch(/\{[a-z_0-9]+\}/);
            if (an === "sie") expect(subject).not.toContain("Nina Winter");
            const body = fuelleMitSignatur(v.body, w);
            if (an === "sie") expect(body).not.toContain("Nina Winter");
            if (sig) expect(body.trimEnd().endsWith("Ole Agentur")).toBe(true);
          });
        }
      }
    }
  }

  it("Sie mit Anrede: „Frau Winter, kurz zu Ihrem Privatschutz“ und „Guten Tag Frau Winter“", () => {
    const v = STANDARD_VORLAGEN_JE.sie.find((x) => x.name === "Nicht erreicht")!;
    const w = werteFuer(lead({ salutation: "Frau" }), "Ole", { ansprache: "sie" });
    expect(fuelle(v.subject, w)).toBe("Frau Winter, kurz zu Ihrem Privatschutz");
    expect(fuelle(v.body, w).startsWith("Guten Tag Frau Winter,")).toBe(true);
  });

  it("Sie ohne Anrede: neutral", () => {
    const v = STANDARD_VORLAGEN_JE.sie.find((x) => x.name === "Nicht erreicht")!;
    const w = werteFuer(lead(), "Ole", { ansprache: "sie" });
    expect(fuelle(v.subject, w)).toBe("Kurz zu Ihrem Privatschutz");
    expect(fuelle(v.body, w).startsWith("Guten Tag,")).toBe(true);
  });

  it("Du: Vorname", () => {
    const v = STANDARD_VORLAGEN_JE.du.find((x) => x.name === "Nicht erreicht")!;
    const w = werteFuer(lead(), "Ole", { ansprache: "du" });
    expect(fuelle(v.subject, w)).toBe("Nina, kurz zu deinem Privatschutz");
    expect(fuelle(v.body, w).startsWith("Hallo Nina,")).toBe(true);
  });
});
