// Admin v2, Paket A6: Leadpreis 7 Tage je Werbekonto aus AdSpendDaily gegen Ziel, Punkt für „Braucht Aufmerksamkeit“.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ladeLeadpreise, leadpreisPunkte } from "@/lib/optimierung/leadpreis-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

requireTestDb();

describe("Leadpreis je Werbekonto (A6)", () => {
  let kundeId = "";
  let kontoId = "";
  const konto = `9${Date.now()}`.slice(0, 14);

  beforeAll(async () => {
    const k = await makeCustomer();
    kundeId = k.id;
    const acc = await prisma.optimizationAccount.create({ data: { kind: "kunde", customerId: k.id, label: "Testkonto Leadpreis", adAccountId: konto, targetCpl: 20 } });
    kontoId = acc.id;
    const tag = (d: number) => new Date(Date.now() - d * 86_400_000);
    await prisma.adSpendDaily.createMany({
      data: [
        { customerId: k.id, adAccountId: konto, adId: "a1", campaignName: "K1", date: tag(1), spend: 120, metaLeads: 4 },
        { customerId: k.id, adAccountId: konto, adId: "a2", campaignName: "K1", date: tag(3), spend: 30, metaLeads: 1 },
        // älter als 7 Tage: zählt nicht
        { customerId: k.id, adAccountId: konto, adId: "a3", campaignName: "K1", date: tag(10), spend: 500, metaLeads: 1 },
      ],
    });
  });

  afterAll(async () => {
    await prisma.adSpendDaily.deleteMany({ where: { adAccountId: konto } });
    await prisma.optimizationAccount.deleteMany({ where: { id: kontoId } });
    await cleanupCustomer(kundeId);
  });

  it("rechnet 7 Tage gegen das Ziel und meldet mehr als 5 € darüber", async () => {
    const { konten, datenDa } = await ladeLeadpreise();
    expect(datenDa).toBe(true);
    const k = konten.find((x) => x.id === kontoId)!;
    expect(k.leadpreis).toMatchObject({ ausgaben: 150, leads: 5, cpl: 30, ziel: 20, ueberZiel: 10, zuTeuer: true });
    const punkte = await leadpreisPunkte();
    const p = punkte.find((x) => x.key === `leadpreis:${kontoId}`);
    expect(p?.action.href).toBe(`/admin/neu/leads/werbekonten/${kontoId}`);
    expect(p?.area).toBe("Leads");
  });
});
