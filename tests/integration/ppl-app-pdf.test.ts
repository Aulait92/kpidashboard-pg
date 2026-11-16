import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mails: nichts echt senden, Aufrufe mitschreiben; Adressen mit „kaputt“ schlagen fehl
type Mail = { to: string; subject: string; paragraphs: string[]; attachments?: { filename: string; content: string | Buffer; contentType?: string }[] };
const sent: Mail[] = [];
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: vi.fn(async (o: Omit<Mail, "to"> & { to: string | string[] }) => {
    const to = [o.to].flat().join(",");
    sent.push({ ...o, to });
    return to.includes("kaputt") ? { ok: false as const, error: "Mailbox rejected" } : { ok: true as const };
  }),
}));
const processed: string[] = [];
vi.mock("@/lib/lead-intake", async (orig) => ({
  ...(await orig<typeof import("@/lib/lead-intake")>()),
  processNewLead: vi.fn(async (id: string) => {
    processed.push(id);
  }),
}));
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => {}), sendToCustomer: vi.fn(async () => {}) }));

import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { ingestPoolLead } from "@/lib/ppl/engine";
import { deliverTo } from "@/lib/ppl/delivery";
import { sendTestLead } from "@/lib/ppl/test-lead";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const product = `PKV-AppPdf-${Math.random().toString(36).slice(2, 7)}`;
const productFail = `${product}-F`;
const run = String(Math.floor(Math.random() * 1e5)).padStart(5, "0");
const fields = (n: number) => ({
  vorname: "Erika", nachname: `Musterfrau${n}`, telefon: `01523${run}${String(n).padStart(2, "0")}`, email: `apppdf${n}-${run}@test.local`,
  postleitzahl: "36251", ort: "Bad Hersfeld", beitrag: "900 €", situation: "Angestellt",
});

describe("Pay-per-Lead: Kundenbereich + PDF per Mail", () => {
  const ids: string[] = [];
  let subId = "";
  beforeAll(async () => {
    requireTestDb();
    delete process.env.SLACK_PPL_WEBHOOK_URL;
    const c = await makeCustomer({ name: `Novus Test ${run}` });
    ids.push(c.id);
    const sub = await prisma.leadSubscription.create({
      data: { customerId: c.id, productKey: product, price: 60, period: "once", goal: 5, delivery: "app_pdf", deliveryEmail: "makler@example.com, buero@example.org" },
    });
    subId = sub.id;
    await prisma.leadSubscription.create({
      data: { customerId: c.id, productKey: productFail, price: 60, period: "once", goal: 5, delivery: "app_pdf", deliveryEmail: "kaputt@example.com" },
    });
  });
  afterAll(async () => {
    await prisma.poolLead.deleteMany({ where: { productKey: { in: [product, productFail] } } });
    await prisma.auditLog.deleteMany({ where: { action: "ppl.test", entityId: subId } });
    for (const id of ids) await cleanupCustomer(id);
  });

  it("liefert in den Kundenbereich und je Adresse eine Mail mit dem Lead als PDF", async () => {
    const r = await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(1) });
    expect(r.status).toBe("delivered");
    expect(processed).toContain(r.leadId);
    const mails = sent.filter((m) => m.subject === `Neuer Lead: ${product}: Erika Musterfrau1`);
    expect(mails.map((m) => m.to)).toEqual(["makler@example.com", "buero@example.org"]);
    for (const m of mails) {
      const a = m.attachments![0];
      expect(a.contentType).toBe("application/pdf");
      expect(a.filename).toBe(`Lead_Erika_Musterfrau1_${r.leadId}.pdf`);
      const pdf = await PDFDocument.load(a.content as Buffer);
      expect(pdf.getPageCount()).toBe(1);
      expect(m.paragraphs.some(hatGedankenstrich)).toBe(false);
    }
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: r.leadId! } });
    expect(lead.emailedAt).not.toBeNull();
  });

  it("Bericht nennt beide Ziele", async () => {
    const sub = await prisma.leadSubscription.findUniqueOrThrow({ where: { id: subId } });
    const before = sent.length;
    const report = await deliverTo(sub, { id: "cmX", product, name: "Max", phone: "4915100000001", email: null, answers: [], date: new Date(), consentAt: null });
    expect(report.channel).toBe("app_pdf");
    expect(report.label).toBe("Kundenbereich + PDF per Mail");
    expect(report.targets.map((t) => t.target)).toEqual(["Kundenbereich", "makler@example.com", "buero@example.org"]);
    expect(report.ok).toBe(true);
    expect(sent.length).toBe(before + 2);
  });

  it("Mailfehler macht die Lieferung in den Kundenbereich nicht rückgängig", async () => {
    const r = await ingestPoolLead({ productKey: productFail, via: "webhook", fields: fields(2) });
    expect(r.status).toBe("delivered");
    expect(processed).toContain(r.leadId);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: r.leadId! } });
    expect(lead.customerId).toBe(ids[0]);
    expect(lead.emailedAt).toBeNull();
    const sub = await prisma.leadSubscription.findFirstOrThrow({ where: { productKey: productFail } });
    const report = await deliverTo(sub, { id: "cmY", product: productFail, name: "Max", phone: null, email: null, answers: [], date: new Date(), consentAt: null });
    expect(report.ok).toBe(false);
    expect(report.targets).toEqual([{ target: "Kundenbereich", ok: true }, { target: "kaputt@example.com", ok: false, error: "Mailbox rejected" }]);
    expect(report.error).toBe("PDF-Mail: kaputt@example.com: Mailbox rejected");
  });

  it("Testdatensatz: nur die PDF-Mail mit [TEST], kein Lead im Kundenbereich", async () => {
    const leadsBefore = await prisma.lead.count({ where: { subscriptionId: subId } });
    const processedBefore = processed.length;
    const r = await sendTestLead(subId, { role: "ADMIN", email: "admin@example.com" });
    expect(r.ok).toBe(true);
    expect(r.label).toBe("Kundenbereich + PDF per Mail");
    expect(r.targets.map((t) => t.target)).toEqual(["makler@example.com", "buero@example.org"]);
    const mails = sent.filter((m) => m.subject === `[TEST] Neuer Lead: ${product}: TEST Lead`);
    expect(mails).toHaveLength(2);
    expect(mails[0].paragraphs[0]).toContain("Testdatensatz");
    expect(mails[0].attachments![0].filename).toBe(`TEST_Lead_TEST_Lead_${r.leadId}.pdf`);
    expect(processed.length).toBe(processedBefore);
    expect(await prisma.lead.count({ where: { subscriptionId: subId } })).toBe(leadsBefore);
  });
});
