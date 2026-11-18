// Admin v2, Paket A6: Leadpreis 7 Tage je Werbekonto gegen Ziel (lib/optimierung/leadpreis.ts).
import { describe, expect, it } from "vitest";
import { leadpreis, teuersteZuerst, zeilenFuerKonto, type KostenZeile } from "@/lib/optimierung/leadpreis";

const z = (p: Partial<KostenZeile>): KostenZeile => ({ customerId: null, adAccountId: "111", campaignName: "PKV Leads", spend: 0, metaLeads: 0, ...p });

describe("Leadpreis je Werbekonto", () => {
  const zeilen = [
    z({ customerId: "k1", adAccountId: "999", spend: 100, metaLeads: 4 }),
    z({ customerId: "k1", adAccountId: "111", campaignName: "Agentur für k1", spend: 50, metaLeads: 1 }),
    z({ adAccountId: "act_111", campaignName: "Pool PKV-Tarifoptimierung", spend: 200, metaLeads: 10 }),
    z({ adAccountId: "222", campaignName: "Pool Katze", spend: 90, metaLeads: 3 }),
    z({ adAccountId: "222", campaignName: "Test.Katze", spend: 10, metaLeads: 1 }),
  ];

  it("Kunde: eigene Zeilen über die Kunden-ID, nicht über ein geteiltes Werbekonto", () => {
    expect(zeilenFuerKonto({ kind: "kunde", customerId: "k1", adAccountId: null, stichwort: null }, zeilen)).toHaveLength(2);
    expect(zeilenFuerKonto({ kind: "kunde", customerId: "kx", adAccountId: "act_999", stichwort: null }, zeilen)).toHaveLength(0);
  });

  it("Pool: Agentur-Zeilen nach Stichwort oder erkanntem Produkt, wie im Optimierungslauf", () => {
    expect(zeilenFuerKonto({ kind: "pool", customerId: null, adAccountId: null, stichwort: "pkv" }, zeilen)).toHaveLength(1);
    const produktVon = (n: string) => (n.toLowerCase().includes("katze") ? "Katze" : null);
    const katze = zeilenFuerKonto({ kind: "pool", customerId: null, adAccountId: "222", stichwort: null, produkt: "Katze" }, zeilen, produktVon);
    expect(katze.map((x) => x.campaignName)).toEqual(["Pool Katze"]);
    expect(zeilenFuerKonto({ kind: "pool", customerId: null, adAccountId: null, stichwort: null, produkt: null }, zeilen)).toEqual([]);
  });

  it("rechnet Leadpreis und Abstand zum Ziel; mehr als 5 € über Ziel ist zu teuer", () => {
    expect(leadpreis([zeilen[0], zeilen[1]], 25)).toEqual({ ausgaben: 150, leads: 5, cpl: 30, ziel: 25, ueberZiel: 5, zuTeuer: false });
    expect(leadpreis([zeilen[0], zeilen[1]], 24.99).zuTeuer).toBe(true);
    expect(leadpreis([zeilen[0]], null)).toMatchObject({ cpl: 25, ziel: null, ueberZiel: null, zuTeuer: false });
    expect(leadpreis([], 20)).toMatchObject({ ausgaben: 0, leads: 0, cpl: null, zuTeuer: false });
    expect(leadpreis([z({ spend: 40, metaLeads: 0 })], 20).cpl).toBeNull();
  });

  it("teuerste zuerst, ohne Leadpreis ans Ende", () => {
    const rows = [{ id: "a", leadpreis: { cpl: 20 } }, { id: "b", leadpreis: { cpl: null } }, { id: "c", leadpreis: { cpl: 45 } }, { id: "d", leadpreis: { cpl: 20 } }];
    expect(teuersteZuerst(rows).map((r) => r.id)).toEqual(["c", "a", "d", "b"]);
  });
});
