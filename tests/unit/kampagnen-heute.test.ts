// Diagnose q=kampagnen&heute=1 (Ole, 25.11.2026): Leads und Ausgaben seit 0 Uhr je Kampagne und aktiver Anzeige.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { heuteZusammenfassen } from "@/lib/ops/kampagnen";

describe("Kampagnen heute", () => {
  it("je Kampagne Summen, je aktiver Anzeige Zahlen (auch ohne Ausgaben), Anzeigen mit Ausgaben dazu", () => {
    const kampagnen = [
      { id: "c1", name: "Kfz", status: "ACTIVE", gruppen: [{ anzeigen: [{ id: "a1", name: "Bild", status: "ACTIVE" }, { id: "a2", name: "Alt", status: "PAUSED" }, { id: "a3", name: "Video", status: "ACTIVE" }] }] },
    ];
    const jeK = [
      { campaign_id: "c1", campaign_name: "Kfz", spend: "12.345", actions: [{ action_type: "lead", value: "3" }] },
      { campaign_id: "c9", campaign_name: "Andere", spend: "5", actions: [] },
    ];
    const jeA = [
      { campaign_id: "c1", ad_id: "a1", ad_name: "Bild", spend: "10", actions: [{ action_type: "leadgen_grouped", value: "2" }] },
      { campaign_id: "c1", ad_id: "a2", ad_name: "Alt", spend: "2.345", actions: [{ action_type: "lead", value: "1" }] },
    ];
    const r = heuteZusammenfassen(kampagnen, jeK, jeA);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ id: "c1", leads: 3, ausgaben: 12.35 });
    expect(r[0].anzeigen).toEqual([
      { id: "a1", name: "Bild", aktiv: true, leads: 2, ausgaben: 10 },
      { id: "a3", name: "Video", aktiv: true, leads: 0, ausgaben: 0 },
      { id: "a2", name: "Alt", aktiv: false, leads: 1, ausgaben: 2.35 },
    ]);
    expect(r[1]).toMatchObject({ id: "c9", name: "Andere", leads: 0, ausgaben: 5, anzeigen: [] });
  });
});
