// Auswertung Weiche eigener Funnel gegen Perspective (Ole, 21.11.2026): Zuteilungen je Seite, Testquellen und HvK raus.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { weichenAuswertung } from "@/lib/funnel/weiche-auswertung";
import { requireTestDb } from "./db";

const funnel = `wtest-${Date.now()}`;
const seit = new Date(Date.now() - 60_000);

describe("Weichen-Auswertung", () => {
  beforeAll(async () => {
    requireTestDb();
    const z = (variante: string, grund: string | null = null) => ({ besuchId: crypto.randomUUID(), funnel, schritt: "weiche", art: "zuteilung", variante, grund });
    await prisma.funnelEreignis.createMany({ data: [z("eigen"), z("eigen", "facebook"), z("perspective"), z("perspective", "weichecheck"), z("hvk")] });
  });
  afterAll(async () => {
    await prisma.funnelEreignis.deleteMany({ where: { funnel } });
  });

  it("zählt Besucher je Seite ohne Testaufrufe, HvK getrennt, ohne Daten keine Entscheidung", async () => {
    const w = await weichenAuswertung(funnel, seit);
    expect(w.eigen.besucher).toBe(2);
    expect(w.perspective.besucher).toBe(1);
    expect(w.hvk).toBe(1);
    expect(w.entscheidung.reason).toBe("zu_wenig");
  });
});
