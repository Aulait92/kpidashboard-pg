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

  it("Vertragsfelder: Beitrag, Vertragsnummer, Versicherer, Status; stornierte Sparten zählen nicht; 0 Kunden wird abgelehnt", async () => {
    const own = (await makeCustomer({ existingCustomersEnabled: true })).id;
    try {
      const csv = [
        "Kundennummer;Anrede;Vorname;Nachname;Firma;Mobil;Sparte;Vertragsnummer;Gesellschaft;Jahresbeitrag;Status;Hauptfälligkeit",
        "2001;Frau;Anna;Alt;;0151 5555555;KFZ;KF-1;Allianz;480,50 €;aktiv;01.01.2099",
        "2001;Frau;Anna;Alt;;0151 5555555;Hausrat;HR-9;Allianz;120,00;storniert;01.02.2099",
        "2002;Herr;Bernd;Bau;Bau GmbH;0151 6666666;Haftpflicht;PH-3;AXA;99;;",
      ].join("\n");
      const { headers, rows } = await parseFile(Buffer.from(csv), "bestand.csv");
      const r = await importRows(own, rows, detectMapping(headers));
      expect(r).toMatchObject({ customers: 2, contracts: 3, inactiveContracts: 1, premiumTotal: 579.5 });
      const anna = await prisma.existingCustomer.findFirstOrThrow({ where: { customerId: own, externalNo: "2001" }, include: { contracts: { orderBy: { line: "asc" } } } });
      expect(anna.salutation).toBe("Frau");
      expect(anna.lines).toEqual(["KFZ"]); // Hausrat storniert → Lücke „Hausrat“ bleibt eine Chance
      expect(Number(anna.premiumTotal)).toBe(480.5);
      expect(anna.nextRenewal?.toISOString().slice(0, 10)).toBe("2099-01-01");
      expect(anna.contracts.map((c) => [c.line, c.contractNo, c.insurer, c.status, Number(c.annualPremium)])).toEqual([
        ["Hausrat", "HR-9", "Allianz", "storniert", 120],
        ["KFZ", "KF-1", "Allianz", "aktiv", 480.5],
      ]);
      const bernd = await prisma.existingCustomer.findFirstOrThrow({ where: { customerId: own, externalNo: "2002" } });
      expect(bernd.company).toBe("Bau GmbH");
      // Liste ohne Namen → Fehler, nichts gespeichert
      const sales = await parseFile(Buffer.from("Firma;Segment;Opener\nAgentur A;A;Hallo\nAgentur B;B;Hi"), "vertrieb.csv");
      await expect(importRows(own, sales.rows, detectMapping(sales.headers))).rejects.toThrow(/kein Kunde/);
      expect(await prisma.existingCustomer.count({ where: { customerId: own } })).toBe(2);
    } finally {
      await cleanupCustomer(own);
    }
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
