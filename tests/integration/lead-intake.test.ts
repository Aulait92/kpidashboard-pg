import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ingestLead, type IncomingLead } from "@/lib/lead-intake";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const lead = (over: Partial<IncomingLead> = {}): IncomingLead => ({
  externalId: `ext-${Math.random().toString(36).slice(2)}`,
  formId: "form-unbekannt",
  pageId: "page-1",
  createdAt: new Date().toISOString(),
  campaignName: "Test",
  adName: null,
  fields: { full_name: "Julia Muster", phone_number: "0171 1234567", email: "JULIA@example.com", "wann_erreichbar?": "abends" },
  ...over,
});

describe("Lead-Eingang", () => {
  let customerId = "";
  const formId = `form-${Math.random().toString(36).slice(2)}`;
  beforeAll(async () => {
    requireTestDb();
    const c = await makeCustomer();
    customerId = c.id;
    await prisma.leadSource.create({ data: { formId, customerId, productKey: "Privatschutz", leadPrice: 50 } });
  });
  afterAll(async () => {
    await prisma.revenue.deleteMany({ where: { customerId } });
    await prisma.lead.deleteMany({ where: { customerId } });
    await prisma.leadSource.deleteMany({ where: { customerId } });
    await prisma.unassignedLead.deleteMany({ where: { formId: "form-unbekannt" } });
    await cleanupCustomer(customerId);
  });

  it("unbekanntes Formular → Posteingang, kein Lead", async () => {
    const inc = lead();
    const res = await ingestLead(inc, "meta");
    expect(res.status).toBe("unassigned");
    expect(await prisma.unassignedLead.count({ where: { externalId: inc.externalId! } })).toBe(1);
    expect(await prisma.lead.count({ where: { externalId: inc.externalId! } })).toBe(0);
  });

  it("zugeordnetes Formular → Lead mit Telefon, E-Mail, Antworten und Lead-Preis", async () => {
    const inc = lead({ formId });
    const res = await ingestLead(inc, "meta");
    expect(res.status).toBe("created");
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: res.leadId! } });
    expect(l.customerId).toBe(customerId);
    expect(l.source).toBe("Privatschutz");
    expect(l.name).toBe("Julia Muster");
    expect(l.phone).toBe("491711234567");
    expect(l.email).toBe("julia@example.com");
    expect(l.formData).toEqual([{ label: "Wann erreichbar?", value: "abends" }]);
    const rev = await prisma.revenue.findFirst({ where: { leadId: l.id } });
    expect(Number(rev?.amount)).toBe(50);
  });

  it("derselbe Lead zweimal (Meta + Zapier) → Dublette, nur ein Lead", async () => {
    const inc = lead({ formId });
    const a = await ingestLead(inc, "meta");
    const b = await ingestLead(inc, "zapier");
    expect(b.status).toBe("duplicate");
    expect(b.leadId).toBe(a.leadId);
    expect(await prisma.lead.count({ where: { externalId: inc.externalId! } })).toBe(1);
  });
});
