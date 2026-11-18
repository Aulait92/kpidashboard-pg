// Quer scrollende Reiter am Handy (Usability-Check 18.11.2026): Verlauf am Rand, an dem noch Reiter folgen.
import { describe, expect, it } from "vitest";
import { kantenMaske } from "@/components/admin/sub-tabs";

describe("kantenMaske", () => {
  it("ohne Überlauf keine Maske", () => {
    expect(kantenMaske({ scrollLeft: 0, scrollWidth: 390, clientWidth: 390 })).toBeNull();
  });

  it("am Anfang nur rechts, in der Mitte beidseitig, am Ende nur links", () => {
    const anfang = kantenMaske({ scrollLeft: 0, scrollWidth: 800, clientWidth: 390 })!;
    expect(anfang).toMatch(/^linear-gradient\(to right, #000 0, #000 0px, #000 calc\(100% - 28px\), transparent 100%\)$/);
    const mitte = kantenMaske({ scrollLeft: 200, scrollWidth: 800, clientWidth: 390 })!;
    expect(mitte).toMatch(/^linear-gradient\(to right, transparent 0, #000 28px, #000 calc\(100% - 28px\), transparent 100%\)$/);
    const ende = kantenMaske({ scrollLeft: 410, scrollWidth: 800, clientWidth: 390 })!;
    expect(ende).toMatch(/^linear-gradient\(to right, transparent 0, #000 28px, #000 calc\(100% - 0px\), #000 100%\)$/);
  });
});
