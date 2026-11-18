// Vorschläge zum Bestätigen in „Service-Mails in Ihrem Namen“ (Ole, 18.11.2026): Anrede aus eindeutigem Vornamen,
// Telefon aus dem Vertriebs-CRM; bei uneindeutigem Vornamen bzw. vorhandener Anrede kein Vorschlag.
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { serviceMailsDaten } from "@/lib/mail/service-mails-daten";

const ids: string[] = [];
const uid = () => Math.random().toString(36).slice(2, 8);

async function kunde(name: string, o: { anrede?: string; crmPhone?: string } = {}) {
  const c = await prisma.customer.create({ data: { name: `SM ${uid()}`, isTest: true } });
  ids.push(c.id);
  await prisma.erstinformation.create({ data: { customerId: c.id, token: `t_${uid()}`, name, ...(o.anrede ? { anrede: o.anrede } : {}) } as never });
  if (o.crmPhone) await prisma.salesContact.create({ data: { name: `CRM ${uid()}`, email: `crm-${uid()}@test.local`, customerId: c.id, phone: o.crmPhone } as never });
  return c.id;
}

afterAll(async () => {
  await prisma.salesContact.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
});

describe("serviceMailsDaten: Vorschläge", () => {
  it("eindeutiger Vorname + CRM-Telefon: Anrede und Telefon vorgeschlagen", async () => {
    const id = await kunde("Martina Hoffmann", { crmPhone: "+49 170 1234567" });
    const d = await serviceMailsDaten(id, null, null);
    expect(d.anredeFehlt).toBe(true);
    expect(d.vorschlaege).toEqual({ anrede: "Frau", telefon: "+49 170 1234567" });
  });
  it("uneindeutiger Vorname: keine Anrede vorgeschlagen; ohne CRM kein Telefon", async () => {
    const id = await kunde("Kim Berger");
    const d = await serviceMailsDaten(id, null, null);
    expect(d.vorschlaege).toEqual({ anrede: null, telefon: null });
  });
  it("Anrede schon gespeichert: kein Vorschlag", async () => {
    const id = await kunde("Ole Kannapinn", { anrede: "Herr" });
    const d = await serviceMailsDaten(id, null, null);
    expect(d.anredeFehlt).toBe(false);
    expect(d.vorschlaege.anrede).toBeNull();
  });
});
