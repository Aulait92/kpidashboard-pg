import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { estimatedProvision } from "@/lib/provision";
import { canEditProvision, customerProductKeys, loadCustomerProvision, saveCustomerProvision } from "@/lib/provision-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

describe("Meine Provisionen: speichern, Rechte, wirksame Sätze", () => {
  let customerId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    await prisma.lead.create({ data: { customerId, source: "Allianz Privatschutz" } });
    await prisma.lead.create({ data: { customerId, source: "Kindersparplan" } });
  });
  afterAll(async () => {
    await cleanupCustomer(customerId);
  });

  it("nur der Inhaber außerhalb der Vorschau darf ändern", () => {
    expect(canEditProvision({ preview: false, teamRole: "owner" })).toBe(true);
    expect(canEditProvision({ preview: false, teamRole: "advisor" })).toBe(false);
    expect(canEditProvision({ preview: true, teamRole: "owner" })).toBe(false);
    expect(canEditProvision(null)).toBe(false);
  });

  it("neuer Kunde: Vertreter-Standard, Produkte aus den Leads", async () => {
    const p = await loadCustomerProvision(customerId);
    expect(p.typ).toBe("vertreter");
    expect(p.hasCustom).toBe(false);
    expect(estimatedProvision("Privatschutz", null, p.rates)).toBe(330);
    expect(await customerProductKeys(customerId)).toEqual(["privatschutz"]);
  });

  it("speichert Makler mit eigenem Satz, ungültige Werte werden abgelehnt", async () => {
    const bad = await saveCustomerProvision(customerId, { typ: "makler", rates: { privatschutz: { kind: "percent", rate: 1.5, defaultPremium: 600 } } });
    expect(bad.ok).toBe(false);
    expect(await saveCustomerProvision(customerId, { typ: "chef", rates: {} })).toMatchObject({ ok: false });

    const ok = await saveCustomerProvision(customerId, {
      typ: "makler",
      rates: { privatschutz: { kind: "percent", rate: 0, trail: 0.25, defaultPremium: 800 } },
    });
    expect(ok).toEqual({ ok: true, changed: ["privatschutz"] });
    const p = await loadCustomerProvision(customerId);
    expect(p.typ).toBe("makler");
    expect(p.hasCustom).toBe(true);
    expect(estimatedProvision("Privatschutz", null, p.rates)).toBe(200);
    // TKV ohne eigenen Satz: Makler-Standard 22,5 % Bestand
    expect(estimatedProvision("TKV", 400, p.rates)).toBe(90);
  });

  it("leere Sätze setzen auf Standard zurück", async () => {
    await saveCustomerProvision(customerId, { typ: "vertreter", rates: {} });
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { provisionRates: true, vermittlerTyp: true } });
    expect(c.provisionRates).toBeNull();
    expect(c.vermittlerTyp).toBe("vertreter");
  });

  it("zeigt nur gewählte Produkte; Lead-Quellen nur, wenn nichts gewählt ist", async () => {
    // Nur Leads (Privatschutz) → Rückfall auf Lead-Quellen
    expect(await customerProductKeys(customerId)).toEqual(["privatschutz"]);
    // Gebuchter Pay-per-Lead-Bezug TKV → nur noch der gewählte, nicht mehr Privatschutz aus den Leads
    const sub = await prisma.leadSubscription.create({ data: { customerId, productKey: "TKV", price: 30 } });
    expect(await customerProductKeys(customerId)).toEqual(["tkv"]);
    await prisma.leadSubscription.delete({ where: { id: sub.id } });
    // Kunde ohne Produkte und Leads → leer (Seite zeigt Hinweis)
    const empty = await makeCustomer();
    expect(await customerProductKeys(empty.id)).toEqual([]);
    await cleanupCustomer(empty.id);
  });
});
