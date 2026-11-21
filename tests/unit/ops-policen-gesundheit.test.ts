// Ops-Abfrage „policen-gesundheit“ (Ole, 21.11.2026): je Kunde Ja/Nein, keine Inhalte
import { describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { customer: { findMany } } }));

import { policenGesundheit } from "@/lib/ops/policen-gesundheit";
import { AVV_POLICEN_VERSION } from "@/lib/policen/regeln";

describe("policen-gesundheit", () => {
  it("freigegeben nur mit AVV in aktueller Fassung und https-Datenschutz-URL; URL selbst wird nicht ausgegeben", async () => {
    findMany.mockResolvedValue([
      { id: "a", name: "A", isTest: false, policenIntern: false, policenAvvZugestimmtAt: new Date("2026-11-20T10:00:00Z"), policenAvvVersion: AVV_POLICEN_VERSION, policenDatenschutzUrl: "https://a.de/datenschutz" },
      { id: "b", name: "B", isTest: false, policenIntern: false, policenAvvZugestimmtAt: null, policenAvvVersion: null, policenDatenschutzUrl: "https://b.de/ds" },
      { id: "c", name: "C", isTest: false, policenIntern: false, policenAvvZugestimmtAt: new Date("2026-11-20T10:00:00Z"), policenAvvVersion: AVV_POLICEN_VERSION, policenDatenschutzUrl: null },
    ]);
    const r = await policenGesundheit(new URLSearchParams());
    expect(r.kunden.map((k) => [k.id, k.freigegeben])).toEqual([["a", true], ["b", false], ["c", false]]);
    expect(r.kunden[0].avvZugestimmtAm).toBe("2026-11-20");
    expect(JSON.stringify(r)).not.toContain("a.de");
  });
});
