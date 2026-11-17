// Tipp „Weiteres Produkt anbieten“ (Zahlen): Zählung im Tipp = Ergebnis des Filters ?filter=cross-selling der Kontakte-Liste.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadErtragData } from "@/lib/ertrag";
import { leadScope } from "@/lib/team";
import { CROSS_SELL_HREF, crossSellOffenWhere } from "@/lib/cross-sell-offen";
import { loadTipSignals } from "@/lib/zahlen-tipps-server";
import { candidateTips } from "@/lib/zahlen-tipps";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ids: string[] = [];
beforeAll(() => requireTestDb());
afterEach(async () => {
  for (const id of ids.splice(0)) await cleanupCustomer(id);
});

const DAY = 86_400_000;

async function kunde(customerId: string, name: string, closedDaysAgo: number | null, extra?: "aktiv" | "storniert") {
  const now = Date.now();
  const lead = await prisma.lead.create({
    data: { customerId, name, status: closedDaysAgo != null ? "Abschluss" : "Neuer Lead", closedAt: closedDaysAgo != null ? new Date(now - closedDaysAgo * DAY) : null },
  });
  if (closedDaysAgo != null) {
    await prisma.leadContract.create({ data: { leadId: lead.id, customerId, primaryLeadId: lead.id, sparte: "katze", premium: 400, signedAt: new Date(now - closedDaysAgo * DAY) } });
  }
  if (extra) {
    await prisma.leadContract.create({
      data: { leadId: lead.id, customerId, sparte: "hausrat", premium: 200, signedAt: new Date(now - DAY), status: extra, ...(extra === "storniert" ? { cancelledAt: new Date(now - DAY) } : {}) },
    });
  }
  return lead.id;
}

describe("Weiteres Produkt anbieten: Tipp und Filter zählen gleich", () => {
  it("Kunden mit Abschluss seit 3 Wochen ohne weiteren laufenden Vertrag", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    const offen = await kunde(c.id, "Offen", 30);
    const nurStorniert = await kunde(c.id, "Weiterer Vertrag storniert", 40, "storniert");
    await kunde(c.id, "Schon zweiter Vertrag", 30, "aktiv");
    await kunde(c.id, "Abschluss erst vor 5 Tagen", 5);
    await kunde(c.id, "Noch offen", null);

    const now = new Date();
    const signals = await loadTipSignals(c.id, await loadErtragData(c.id), now);
    // gleiche Abfrage wie die Kontakte-Liste mit ?filter=cross-selling (components/buyer-leads-body.tsx)
    const gefiltert = await prisma.lead.findMany({ where: { ...leadScope({ customerId: c.id, userId: null, teamRole: "owner" }), ...crossSellOffenWhere(now) }, select: { id: true } });
    expect(gefiltert.map((l) => l.id).sort()).toEqual([offen, nurStorniert].sort());
    expect(signals.withoutCrossSell).toBe(gefiltert.length);

    const tip = candidateTips(signals).find((t) => t.key === "cross_sell");
    expect(tip?.href).toBe(CROSS_SELL_HREF);
    expect(tip?.text).toContain("2 Kunden haben");
  });
});
