// Ole, 26.11.2026: von Hand kopiertes Formular mit Einwilligung per Knopf → Zuordnung und alte Leads nachtragen
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { requireTestDb } from "./db";
import { CONSENT_VERSION_KNOPF, KNOPF_TITEL } from "@/lib/einwilligung-leadformular";

const tag = Math.random().toString(36).slice(2, 8);
const formId = `9${Date.now()}`;
vi.mock("@/lib/meta-leads", () => ({
  fetchFormLegal: async () => ({ custom_disclaimer: { title: KNOPF_TITEL, body: { text: "Mit Klick auf „Senden“ willigen Sie ein." } } }),
}));

describe("Einwilligung per Knopf nachtragen", () => {
  let customerId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await prisma.customer.create({ data: { name: `Knopf ${tag}` } })).id;
    await prisma.leadSource.create({ data: { formId, customerId, productKey: "privatschutz" } });
    await prisma.lead.create({ data: { customerId, name: "Test Lead", adFormId: formId, source: "Privatschutz" } });
  });
  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { customerId } });
    await prisma.leadSource.deleteMany({ where: { formId } });
    await prisma.customer.delete({ where: { id: customerId } }).catch(() => {});
  });

  it("setzt Fassung an der Zuordnung und Einwilligung an alten Leads", async () => {
    const { knopfEinwilligungNachtragen } = await import("@/lib/einwilligung-knopf-server");
    expect(await knopfEinwilligungNachtragen(formId)).toBe(true);
    const src = await prisma.leadSource.findUnique({ where: { formId } });
    expect(src?.consentVersion).toBe(CONSENT_VERSION_KNOPF);
    const l = await prisma.lead.findFirst({ where: { customerId } });
    expect(l?.waConsent).toBe("ja");
    expect((l?.consentData as { textVersion?: string }).textVersion).toBe(CONSENT_VERSION_KNOPF);
  });
});
