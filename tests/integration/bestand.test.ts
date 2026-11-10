import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { importRows, parseFile, detectMapping } from "@/lib/bestand/import";
import { createCampaign, handleCampaignReply, opportunities, segmentIds } from "@/lib/bestand/campaigns";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const CSV = [
  "Kundennummer;Vorname;Nachname;Mobil;E-Mail;Geburtsdatum;Sparte;Hauptfälligkeit;Vorerkrankungen",
  "1001;Erika;Muster;0151 1111111;erika@test.local;07.03.1980;KFZ;01.01.2027;geheim",
  "1001;Erika;Muster;0151 1111111;erika@test.local;07.03.1980;Privathaftpflicht;;",
  "1002;Max;Probe;0151 2222222;;01.01.1975;KFZ;;",
  "1003;Lisa;Ohnehandy;;lisa@test.local;;Hausrat;;",
].join("\n");

describe("Bestandskunden: Import, Segmente, Kampagne, Antwort", () => {
  let customerId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ existingCustomersEnabled: true })).id;
  });
  afterAll(() => cleanupCustomer(customerId));

  it("importiert (eine Zeile je Vertrag), führt Kunden zusammen, speichert keine Gesundheitsangaben", async () => {
    const { headers, rows } = await parseFile(Buffer.from(CSV), "bestand.csv");
    const r = await importRows(customerId, rows, detectMapping(headers));
    expect(r).toMatchObject({ customers: 3, created: 3, contracts: 4, withPhone: 2 });
    const erika = await prisma.existingCustomer.findFirstOrThrow({ where: { customerId, externalNo: "1001" } });
    expect(erika.lines).toEqual(["Haftpflicht", "KFZ"]);
    expect(erika.phone).toBe("491511111111");
    expect(JSON.stringify(erika)).not.toContain("geheim");
    // erneuter Import aktualisiert statt doppelt anzulegen
    const again = await importRows(customerId, rows, detectMapping(headers));
    expect(again).toMatchObject({ created: 0, updated: 3 });
  });

  it("Segmente und Chancen: KFZ ohne Haftpflicht", async () => {
    const ids = await segmentIds(customerId, "cross_sell", { has: ["KFZ"], lacks: ["Haftpflicht"] });
    expect(ids).toHaveLength(1); // nur Max (Erika hat Haftpflicht, Lisa kein Handy)
    const opps = await opportunities(customerId);
    expect(opps.find((o) => o.title === "KFZ ohne Haftpflicht")?.count).toBe(1);
  });

  it("Antwort auf die Kampagne wird zum Lead, „Stopp“ sperrt", async () => {
    const campaign = await createCampaign({ customerId, occasion: "review", segment: {}, topic: null, dailyLimit: 50 });
    const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id }, include: { existingCustomer: true } });
    expect(recipients).toHaveLength(2);
    const [a, b] = recipients;
    for (const r of [a, b]) {
      const conv = await prisma.conversation.create({ data: { customerId, contactPhone: r.existingCustomer.phone! } });
      await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "sent", sentAt: new Date(), conversationId: conv.id } });
    }
    const convA = await prisma.conversation.findFirstOrThrow({ where: { customerId, contactPhone: a.existingCustomer.phone! } });
    expect((await handleCampaignReply(convA.id, a.existingCustomer.phone!, "Ja gerne, wann passt es?")).stop).toBe(false);
    const lead = await prisma.lead.findFirstOrThrow({ where: { customerId, phone: a.existingCustomer.phone! } });
    expect(lead.source).toBe("Bestandskunde");
    expect((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("replied");

    const convB = await prisma.conversation.findFirstOrThrow({ where: { customerId, contactPhone: b.existingCustomer.phone! } });
    expect((await handleCampaignReply(convB.id, b.existingCustomer.phone!, "STOPP")).stop).toBe(true);
    expect((await prisma.existingCustomer.findUniqueOrThrow({ where: { id: b.existingCustomerId } })).optOutAt).not.toBeNull();
    expect(await segmentIds(customerId, "review", {}, new Date(Date.now() + 40 * 86_400_000))).not.toContain(b.existingCustomerId);
  });
});
