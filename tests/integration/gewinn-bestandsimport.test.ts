// Absicherung Gewinnrechnung (Ole, 14.11.2026): Hochgeladene Bestandsverträge (ExistingContract ohne
// leadContractId) zählen nie in Provision, Gewinn, „Inkl. Bestand“ und Bestandsprovision. Nur Verträge,
// die an Leads abgeschlossen werden, auch neue Abschlüsse aus Bestandskampagnen.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";
import { importRows } from "@/lib/bestand/import";
import { addLeadContract, syncPrimaryContract } from "@/lib/vertraege";
import { bestandOf, ertragForRange, loadErtragData } from "@/lib/ertrag";

const DAY = 86_400_000;
let customerId = "";

describe("Gewinn: hochgeladene Bestandsverträge zählen nicht", () => {
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
  });
  afterAll(() => cleanupCustomer(customerId));

  it("Import mit Verträgen ändert Gewinn und Bestand nicht; neuer Abschluss aus Bestandskampagne zählt", async () => {
    const now = new Date();
    const range = { from: new Date(now.getTime() - 30 * DAY), to: new Date(now.getTime() + DAY) };
    const snapshot = async () => {
      const data = await loadErtragData(customerId);
      const e = await ertragForRange(customerId, data, range, now, 0);
      return { contracts: data.contracts.length, firstYear: e.provision.firstYear, gewinn: e.gewinn, mitBestand: e.gewinnMitBestand, bestand: bestandOf(data, now) };
    };
    const before = await snapshot();
    expect(before.contracts).toBe(0);

    // Bestandsliste mit Jahresbeiträgen hochladen
    await importRows(
      customerId,
      [
        { Name: "Erika Bestand", Telefon: "+49 151 00000071", Sparte: "KFZ", Vertragsnummer: "K-1", Beitrag: "900" },
        { Name: "Erika Bestand", Telefon: "+49 151 00000071", Sparte: "Hausrat", Vertragsnummer: "H-1", Beitrag: "300" },
        { Name: "Paul Bestand", Telefon: "+49 151 00000072", Sparte: "Privatschutz", Vertragsnummer: "P-1", Beitrag: "600" },
      ],
      { fullName: "Name", phone: "Telefon", line: "Sparte", contractNo: "Vertragsnummer", annualPremium: "Beitrag" },
      now,
    );
    expect(await prisma.existingContract.count({ where: { existingCustomer: { customerId }, leadContractId: null } })).toBe(3);
    const afterImport = await snapshot();
    expect(afterImport).toEqual(before);

    // Bestandskampagne: Erika antwortet, wird Lead und schließt neu ab
    const erika = await prisma.existingCustomer.findFirstOrThrow({ where: { customerId, phone: "4915100000071" } });
    const campaign = await prisma.customerCampaign.create({ data: { customerId, name: "Privatschutz anbieten", occasion: "cross_sell", segment: {}, status: "running" } });
    const lead = await prisma.lead.create({ data: { customerId, name: "Erika Bestand", phone: "4915100000071", source: "Bestandskunde", status: "Abschluss", closedAt: now } });
    await prisma.campaignRecipient.create({ data: { campaignId: campaign.id, existingCustomerId: erika.id, status: "sent", sentAt: new Date(now.getTime() - 3 * DAY), leadId: lead.id } });
    await syncPrimaryContract(lead.id, { sparte: "privatschutz" });
    await prisma.leadContract.updateMany({ where: { primaryLeadId: lead.id }, data: { premium: 600 } });

    const afterClose = await snapshot();
    expect(afterClose.contracts).toBe(1);
    expect(afterClose.firstYear).toBeGreaterThan(0);
    expect(afterClose.gewinn).toBe(afterClose.firstYear);
    const data = await loadErtragData(customerId);
    expect(data.contracts[0].campaignId).toBe(campaign.id);

    // Weiterer Vertrag am selben Lead zählt ebenfalls, die importierten weiterhin nicht
    const add = await addLeadContract(lead.id, customerId, { sparte: "hausrat", premium: 200, signedAt: now, insurer: null, contractNo: null, fileId: null }, null);
    expect(add.ok).toBe(true);
    const afterSecond = await snapshot();
    expect(afterSecond.contracts).toBe(2);
    expect(afterSecond.firstYear).toBeGreaterThan(afterClose.firstYear);
  });
});
