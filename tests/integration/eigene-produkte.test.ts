// Eigenes Produkt beim Abschluss speichern, beim Kunden merken, im Kontakt und Bestand mit Namen (Ole, 14.11.2026)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { addLeadContract, listLeadContracts, loadCustomerContracts, parseContractInput, syncPrimaryContract } from "@/lib/vertraege";
import { encodeSparte } from "@/lib/eigene-produkte";
import { loadCustomerProvision } from "@/lib/provision-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

let customerId = "";

describe("eigene Produkte", () => {
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
  });
  afterAll(() => cleanupCustomer(customerId));

  it("erster Abschluss mit eigenem Produkt (aus dem Abschluss-Dialog) und weiterer Abschluss", async () => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Eva Eigen", phone: "4917600000201", status: "Abschluss", closedAt: new Date(), closeValue: 600 } });
    await syncPrimaryContract(lead.id, { sparte: encodeSparte("sonstiges", { productName: "Rechtsschutz Gewerbe", rateAbschluss: "20", rateBestand: "10" }) });
    const primary = await prisma.leadContract.findUniqueOrThrow({ where: { primaryLeadId: lead.id } });
    expect(primary).toMatchObject({ sparte: "sonstiges", productName: "Rechtsschutz Gewerbe" });
    expect(Number(primary.rateAbschluss)).toBe(0.2);

    const input = parseContractInput({ sparte: "sonstiges", premium: "300", productName: "Kfz Flotte", rateAbschluss: "5", rateBestand: "5" });
    if (!input.ok) throw new Error(input.error);
    expect(await addLeadContract(lead.id, customerId, input.value, null)).toMatchObject({ ok: true });

    const list = await listLeadContracts(lead.id);
    expect(list.map((c) => c.sparteLabel)).toEqual(["Rechtsschutz Gewerbe", "Kfz Flotte"]);
    expect(list[0].summary).toMatch(/^Rechtsschutz Gewerbe · Beitrag 600(,00)?\s€ · Provision ≈ 120(,00)?\s€ · Bestand ≈ 60(,00)?\s€\/Jahr ab dem 2\. Jahr/);

    const prov = await loadCustomerProvision(customerId);
    expect(prov.products.map((p) => p.name)).toEqual(["Kfz Flotte", "Rechtsschutz Gewerbe"]);

    const all = await loadCustomerContracts(customerId);
    expect(all.find((c) => c.productName === "Kfz Flotte")).toMatchObject({ rateAbschluss: 0.05, rateBestand: 0.05 });

    const ec = await prisma.existingCustomer.findFirst({ where: { leadId: lead.id }, include: { contracts: true } });
    expect(ec?.contracts.map((c) => c.product).sort()).toEqual(["Kfz Flotte", "Rechtsschutz Gewerbe"]);
  });
});
