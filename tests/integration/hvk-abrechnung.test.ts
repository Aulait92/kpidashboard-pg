import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { assignHvkReklamation, importHvkPdf, listHvkInvoices, openHvkReklamationen } from "@/lib/ppl/hvk-abrechnung-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
// Rechnungsnummern sind Ziffern-Buchstabe-Ziffern
const num = String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
const nos = [`369-G-9${num}`, `369-G-8${num}`, `369-G-7${num}`];
const FIXTURE = readFileSync(path.join(__dirname, "..", "fixtures", "hvk-abrechnung", "369-G-000034.txt"), "utf8");
const admin = { id: null, email: "admin@test.local", role: "ADMIN" };

async function pdfOf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 800;
  for (const line of text.split("\n").filter(Boolean)) {
    let x = 30;
    for (const c of line.split(/ {3,}/)) {
      page.drawText(c, { x, y, size: 7, font });
      x += Math.max(30, font.widthOfTextAtSize(c, 7) + 12);
    }
    y -= 14;
  }
  return doc.save();
}

// Berlin 12:00 (Sommerzeit) am Tag
const at = (day: string) => new Date(`${day}T10:00:00Z`);

describe("HvK-Abrechnung mit Datenbank", () => {
  let customerId = "";
  let otherCustomerId = "";
  const ids: Record<string, string> = {};
  const invoiceNo = nos[0];
  beforeAll(async () => {
    requireTestDb();
    process.env.HVK_CUSTOMER_NAME = `HvK Test ${tag}`;
    process.env.HVK_PRODUCT = `PKV-Tarifoptimierung-${tag}`;
    customerId = (await makeCustomer({ name: `HvK Test ${tag}` })).id;
    otherCustomerId = (await makeCustomer()).id;
    const sub = await prisma.leadSubscription.create({
      data: { customerId, productKey: process.env.HVK_PRODUCT, price: 45, period: "month", delivery: "email", deliveryEmail: "hvk@test.local", stornoDays: 7 },
    });
    const mk = async (key: string, data: { day: string; plz: string; ort: string; app?: boolean; customer?: string }) => {
      const l = await prisma.lead.create({
        data: {
          customerId: data.customer ?? customerId,
          source: process.env.HVK_PRODUCT,
          name: `Lead ${key} ${tag}`,
          status: "Neuer Lead",
          formData: [
            { label: "Postleitzahl", value: data.plz },
            { label: "Ort", value: data.ort },
          ],
          ...(data.app ? { subscriptionId: sub.id, deliveredAt: at(data.day), createdAt: at(data.day) } : { airtableId: `rec${key}${tag}`, createdAt: at(data.day) }),
        },
      });
      await prisma.revenue.create({ data: { customerId: data.customer ?? customerId, leadId: l.id, amount: 45 } });
      ids[key] = l.id;
    };
    await mk("rek", { day: "2026-07-19", plz: "84032", ort: "Landshut", app: true });
    await mk("mg", { day: "2026-07-20", plz: "41239", ort: "Mönchengladbach" });
    await mk("koeln", { day: "2026-07-26", plz: "50667", ort: "Köln", app: true });
    // Gleiches Datum und gleiche PLZ bei einem anderen Kunden: zählt nicht
    await mk("fremd", { day: "2026-07-19", plz: "84032", ort: "Landshut", customer: otherCustomerId });
  });
  afterAll(async () => {
    await prisma.hvkInvoice.deleteMany({ where: { invoiceNo: { in: nos } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ customerId }, { entity: "HvkInvoice" }, { entity: "HvkReklamation" }] } });
    await cleanupCustomer(customerId);
    await cleanupCustomer(otherCustomerId);
    delete process.env.HVK_CUSTOMER_NAME;
    delete process.env.HVK_PRODUCT;
  });

  it("übernimmt die Abrechnung und trägt den eindeutigen Storno ein (wie „Storno eintragen“)", async () => {
    const pdf = await pdfOf(FIXTURE.replace("369-G-000034", invoiceNo));
    const r = await importHvkPdf(pdf, { pdfName: "Gutschrift_1.pdf", mailMessageId: `m1-${tag}`, source: "mail" }, { actor: admin });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toMatchObject({ status: "neu", invoiceNo, delivered: 2, billed: 7, stornoAuto: 1, stornoReview: 0, netCents: -27000 });
    expect(r.result.unbilled.map((u) => u.id)).toEqual([ids.koeln]);
    expect(r.result.foreign).toHaveLength(6);
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: ids.rek } });
    expect(l.stornoState).toBe("approved");
    expect(l.status).toBe("Storno");
    expect(l.stornoReason).toBe(`Reklamation HvK-Abrechnung ${invoiceNo}`);
    expect(l.stornoNote).toBe("HvK Lead ID 4596925, 84032 Landshut, geliefert 19.07.2026");
    expect((await prisma.revenue.findFirstOrThrow({ where: { leadId: ids.rek } })).cancelled).toBe(true);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: ids.fremd } })).stornoState).toBeNull();
    const inv = await prisma.hvkInvoice.findUniqueOrThrow({ where: { invoiceNo }, include: { reklamationen: true } });
    expect(inv.pdf.length).toBe(pdf.length);
    expect(inv.reklamationen).toMatchObject([{ status: "auto", leadId: ids.rek, hvkLeadId: "4596925" }]);
    const row = (await listHvkInvoices()).find((x) => x.invoiceNo === invoiceNo)!;
    expect(row).toMatchObject({ delivered: 2, billed: 7, stornoAuto: 1, stornoOpen: 0, netCents: -27000, periodStart: "2026-07-20", periodEnd: "2026-07-26" });
  });

  it("ist idempotent: dieselbe Rechnungsnummer ein zweites Mal ändert nichts", async () => {
    const pdf = await pdfOf(FIXTURE.replace("369-G-000034", invoiceNo));
    const r = await importHvkPdf(pdf, { pdfName: "Gutschrift_1.pdf", mailMessageId: `m2-${tag}`, source: "backfill" }, { actor: admin });
    expect(r.ok && r.result.status).toBe("vorhanden");
    expect(await prisma.hvkInvoice.count({ where: { invoiceNo } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: ids.rek, action: "storno.admin" } })).toBe(1);
  });

  it("Vorschau schreibt nichts; Airtable-Lead ohne Bezug wird storniert", async () => {
    const no = nos[1];
    const text = FIXTURE.replace("369-G-000034", no).replace("Lead ID: 4596925, KVV-Opt, 2026-07-19, 84032 Landshut", "Lead ID: 4595123, KVV-Opt, 2026-07-20, 41239 Mönchengladbach");
    const pdf = await pdfOf(text);
    const preview = await importHvkPdf(pdf, { pdfName: null, source: "backfill" }, { dryRun: true, actor: admin });
    expect(preview.ok && preview.result).toMatchObject({ status: "vorschau", stornoAuto: 1 });
    expect(await prisma.hvkInvoice.count({ where: { invoiceNo: no } })).toBe(0);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: ids.mg } })).stornoState).toBeNull();
    const r = await importHvkPdf(pdf, { pdfName: null, source: "backfill" }, { actor: admin });
    expect(r.ok && r.result.reklamationen[0]).toMatchObject({ outcome: "eindeutig", leadId: ids.mg, storno: "eingetragen" });
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: ids.mg } });
    expect(l.stornoState).toBe("approved");
    expect(Number(l.creditAmount)).toBe(45);
  });

  it("mehrere Kandidaten: offen unter „Storno prüfen“, von Hand zuordnen", async () => {
    const no = nos[2];
    // Zweiter Lead am selben Tag mit gleicher PLZ wie Köln
    const l2 = await prisma.lead.create({
      data: { customerId, source: process.env.HVK_PRODUCT, name: `Lead koeln2 ${tag}`, airtableId: `reck2${tag}`, createdAt: at("2026-07-26"), formData: [{ label: "PLZ", value: "50667" }] },
    });
    const text = FIXTURE.replace("369-G-000034", no).replace("Lead ID: 4596925, KVV-Opt, 2026-07-19, 84032 Landshut", "Lead ID: 4609999, KVV-Opt, 2026-07-26, 50667 Köln");
    const r = await importHvkPdf(await pdfOf(text), { pdfName: null, source: "upload" }, { actor: admin });
    expect(r.ok && r.result).toMatchObject({ stornoAuto: 0, stornoReview: 1 });
    const open = (await openHvkReklamationen()).filter((o) => o.invoice.invoiceNo === no);
    expect(open).toHaveLength(1);
    expect(open[0].candidates.map((c) => c.id).sort()).toEqual([ids.koeln, l2.id].sort());
    expect(await assignHvkReklamation(open[0].id, ids.fremd, admin)).toEqual({ ok: false, error: "Kein Lead von Heinrich von Kleist mit dieser ID." });
    expect(await assignHvkReklamation(open[0].id, l2.id, admin)).toEqual({ ok: true, message: "Storno eingetragen." });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l2.id } })).stornoReason).toBe(`Reklamation HvK-Abrechnung ${no}`);
    expect((await prisma.hvkReklamation.findUniqueOrThrow({ where: { id: open[0].id } })).status).toBe("erledigt");
    expect(await assignHvkReklamation(open[0].id, l2.id, admin)).toEqual({ ok: false, error: "Schon entschieden." });
  });
});
