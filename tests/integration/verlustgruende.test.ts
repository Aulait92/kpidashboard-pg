// Verlustgründe in den Zahlen (lib/verlustgruende-server.ts): Zeitraum nach dem Verlust-Datum, Vorzeitraum,
// Filter Produkt und Berater, Testleads zählen nicht, Admin je Kunde.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { haeufigsteVerluste, verlustAdmin, verlustKarte } from "@/lib/verlustgruende-server";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const DAY = 24 * 60 * 60 * 1000;

describe("Verlustgründe laden", () => {
  let customerId = "";
  let advisorId = "";
  const now = new Date("2026-11-17T10:00:00Z");
  const range = { from: new Date(now.getTime() - 30 * DAY), to: now };

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    advisorId = (await makeBuyer(customerId, "advisor")).id;
    const lead = (d: number, data: Record<string, unknown>) =>
      prisma.lead.create({ data: { customerId, name: "L", status: "Kein Interesse", reached: true, createdAt: new Date(now.getTime() - (d + 5) * DAY), ...data } });
    // Zeitraum: 3 × nicht erreicht (davon 1 Berater), 2 × zu teuer (Hausrat), 1 alter Lead ohne Datum (statusChangedAt)
    for (let i = 0; i < 3; i++) await lead(2 + i, { status: "Disqualifiziert", lostReason: "nicht_erreichbar", lostAt: new Date(now.getTime() - (2 + i) * DAY), reached: false, callAttempts: 6, source: "Privatschutz", assignedUserId: i === 0 ? advisorId : null });
    for (let i = 0; i < 2; i++) await lead(3, { lostReason: "passt_nicht", lostAt: new Date(now.getTime() - 3 * DAY), source: "Hausrat" });
    const alt = await lead(4, { source: "Hausrat" });
    await prisma.lead.update({ where: { id: alt.id }, data: { statusChangedAt: new Date(now.getTime() - 4 * DAY) } });
    // nicht im Zeitraum bzw. Test
    await lead(40, { lostReason: "schon_versichert", lostAt: new Date(now.getTime() - 40 * DAY) });
    await lead(2, { lostReason: "schon_versichert", lostAt: new Date(now.getTime() - 2 * DAY), isTest: true });
    // offen
    await lead(2, { status: "Termin" });
  });
  afterAll(() => cleanupCustomer(customerId));

  it("Verteilung im Zeitraum, Vorzeitraum, Filter", async () => {
    const d = await verlustKarte(customerId, range, {}, now);
    expect(d.verteilung.total).toBe(6);
    expect(d.verteilung.gruende.map((g) => [g.key, g.count])).toEqual([
      ["nicht_erreichbar", 3],
      ["passt_nicht", 2],
      ["kein_interesse", 1],
    ]);
    expect(d.prevTotal).toBe(1);
    expect(d.vergleich[0].prevShare).toBe(0);
    expect(d.produkte.map((p) => p.value).sort()).toEqual(["Hausrat", "Privatschutz"]);
    expect(d.berater.map((b) => b.value).sort()).toEqual([advisorId, "ohne"].sort());

    expect((await verlustKarte(customerId, range, { produkt: "Hausrat" }, now)).verteilung.total).toBe(3);
    const b = await verlustKarte(customerId, range, { berater: advisorId }, now);
    expect(b.verteilung.gruende).toEqual([expect.objectContaining({ key: "nicht_erreichbar", count: 1 })]);
  });

  it("Monatsbericht: zwei häufigste Gründe; Admin je Kunde", async () => {
    const top = await haeufigsteVerluste(customerId, range);
    expect(top.gruende.map((g) => g.key)).toEqual(["nicht_erreichbar", "passt_nicht"]);
    const a = await verlustAdmin(range, customerId);
    expect(a.kunden).toHaveLength(1);
    expect(a.kunden[0].verteilung.total).toBe(6);
  });
});
