// „Weiteres Produkt per Klick anbieten“ (Ole, 18.11.2026, lib/cross-sell-verkauf.ts): nur mit Bestandskunden-Modul
// für alle. Schalter aus → nichts; gebucht → Kampagne mit genau den Kunden ohne weiteres Produkt; nicht gebucht → Blatt.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ an: false }));
vi.mock("@/lib/bestand/sichtbar", async (orig) => {
  const real = await orig<typeof import("@/lib/bestand/sichtbar")>();
  return {
    ...real,
    get BESTAND_MODULE_AVAILABLE() {
      return st.an;
    },
  };
});

import { prisma } from "@/lib/prisma";
import { planAudience } from "@/lib/bestand/campaigns";
import { ladeCrossSellVerkauf } from "@/lib/cross-sell-verkauf-server";
import { CROSS_SELL_KAMPAGNE_HREF, crossSellNutzenSatz, OHNE_WEITERES_SEGMENT } from "@/lib/cross-sell-verkauf";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const DAY = 86_400_000;
const ids: string[] = [];
beforeAll(() => requireTestDb());
afterEach(async () => {
  st.an = false;
  for (const id of ids.splice(0)) await cleanupCustomer(id);
});

/** Kontakt mit Abschluss vor 30 Tagen; weiteres: zweiter laufender Vertrag. Bestandskunde wie aus syncLeadToBestand. */
async function kunde(customerId: string, name: string, o: { weiteres?: boolean; einwilligung?: boolean; phone: string }) {
  const now = Date.now();
  const lead = await prisma.lead.create({ data: { customerId, name, phone: o.phone, status: "Abschluss", closedAt: new Date(now - 30 * DAY) } });
  await prisma.leadContract.create({ data: { leadId: lead.id, customerId, primaryLeadId: lead.id, sparte: "hausrat", premium: 300, signedAt: new Date(now - 30 * DAY) } });
  if (o.weiteres) await prisma.leadContract.create({ data: { leadId: lead.id, customerId, sparte: "haftpflicht", premium: 80, signedAt: new Date(now - DAY) } });
  const ec = await prisma.existingCustomer.create({
    data: { customerId, leadId: lead.id, firstName: name, lastName: "Test", phone: o.phone, lines: o.weiteres ? ["Hausrat", "Haftpflicht"] : ["Hausrat"], whatsappConsent: o.einwilligung === false ? null : "ja" },
  });
  return { leadId: lead.id, ecId: ec.id };
}

async function aufbau(gebucht: boolean) {
  const c = await makeCustomer({ existingCustomersEnabled: gebucht });
  ids.push(c.id);
  const offen = await kunde(c.id, "Offen", { phone: "491700000001" });
  const ohneEinwilligung = await kunde(c.id, "OhneEinwilligung", { phone: "491700000002", einwilligung: false });
  const zweiter = await kunde(c.id, "SchonZweiter", { phone: "491700000003", weiteres: true });
  // Importierter Bestandskunde ohne Kontakt: gehört nicht dazu
  const importiert = await prisma.existingCustomer.create({ data: { customerId: c.id, firstName: "Import", phone: "491700000004", lines: ["Hausrat"], whatsappConsent: "ja" } });
  return { c, offen, ohneEinwilligung, zweiter, importiert };
}

const owner = (customerId: string) => ({ customerId, userId: null, teamRole: "owner" as const });

describe("Weiteres Produkt per Klick anbieten", () => {
  it("Schalter aus: niemand sieht etwas, auch mit gebuchtem Modul", async () => {
    const { c } = await aufbau(true);
    expect(await ladeCrossSellVerkauf(owner(c.id))).toBeNull();
  });

  it("gebucht: Kampagne mit genau diesen Kunden (ohne Einwilligung übersprungen)", async () => {
    st.an = true;
    const { c, offen, ohneEinwilligung, zweiter, importiert } = await aufbau(true);
    const v = await ladeCrossSellVerkauf(owner(c.id));
    expect(v).toEqual({ gebucht: true, anzahl: 2, provision: null });
    // Berater im Team: kein Knopf (Kampagnen und Buchung macht der Inhaber)
    expect(await ladeCrossSellVerkauf({ customerId: c.id, userId: "x", teamRole: "advisor" })).toBeNull();
    expect(CROSS_SELL_KAMPAGNE_HREF).toContain("anlass=cross_sell");
    expect(new URL(CROSS_SELL_KAMPAGNE_HREF, "http://x").searchParams.get("segment")).toBe(JSON.stringify(OHNE_WEITERES_SEGMENT));

    const plan = await planAudience(c.id, "cross_sell", { ...OHNE_WEITERES_SEGMENT }, { mode: "whatsapp_first", waAvailable: true });
    expect(plan.recipients.map((r) => r.id)).toEqual([offen.ecId]);
    expect(plan.segment).toBe(2); // im Segment: beide ohne weiteres Produkt, einer davon ohne Einwilligung
    expect(plan.counts.excludedTotal).toBe(1);
    const alle = [ohneEinwilligung.ecId, zweiter.ecId, importiert.id];
    expect(plan.recipients.some((r) => alle.includes(r.id))).toBe(false);
    // leadIds aus der Adresse zählen nicht
    const manipuliert = await planAudience(c.id, "cross_sell", { ...OHNE_WEITERES_SEGMENT, leadIds: [zweiter.leadId] }, { mode: "whatsapp_first", waAvailable: true });
    expect(manipuliert.recipients.map((r) => r.id)).toEqual([offen.ecId]);
  });

  it("nicht gebucht: Blatt mit eigenen Zahlen, ohne Preis", async () => {
    st.an = true;
    const { c } = await aufbau(false);
    const v = await ladeCrossSellVerkauf(owner(c.id));
    expect(v?.gebucht).toBe(false);
    expect(v?.anzahl).toBe(2);
    const satz = crossSellNutzenSatz(v!.anzahl, v!.provision);
    expect(satz).toContain("diesen 2 Kunden");
    expect(satz).not.toMatch(/Garantie|netto|pro Monat|im Monat/i);
    // Heute: Zusatz-Knopf nur, solange nicht gebucht
    expect(await ladeCrossSellVerkauf(owner(c.id), { nurNichtGebucht: true })).not.toBeNull();
    await prisma.customer.update({ where: { id: c.id }, data: { existingCustomersEnabled: true } });
    expect(await ladeCrossSellVerkauf(owner(c.id), { nurNichtGebucht: true })).toBeNull();
  });
});
