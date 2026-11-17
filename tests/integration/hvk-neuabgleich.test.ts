// HvK-Abrechnung, Fehler bis 17.11.2026: Leads aus dem Airtable-Abgleich haben source „Wechsel“
// (canonicalProductKey) statt „PKV-Tarifoptimierung“ und wurden nicht gefunden (Geliefert 0, Reklamationen offen).
// Prüft den Filter (loadHvkLeads) und den Neuabgleich bestehender Rechnungen gegen die Datenbank.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { importHvkPdf, listHvkInvoices, loadHvkLeads, reabgleichHvk } from "@/lib/ppl/hvk-abrechnung-server";
import { GET } from "@/app/api/ops/diagnose/route";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const invoiceNo = `369-G-6${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
// Spätere Rechnung: reklamiert 4597002 (München) mit abweichendem Lieferdatum, nur über die HvK-Lead-ID auflösbar
const laterNo = `369-G-2${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const FIXTURE = readFileSync(path.join(__dirname, "..", "fixtures", "hvk-abrechnung", "369-G-000034.txt"), "utf8");
const admin = { id: null, email: "admin@test.local", role: "ADMIN" };
const TOKEN = "test-read-token-0123456789-0123456789-abcdef";

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

describe("HvK-Abrechnung: Airtable-Leads finden und bestehende Rechnungen neu abgleichen", () => {
  let customerId = "";
  let otherCustomerId = "";
  let subId = "";
  const bezug = `recKik${tag}`;
  const ids: Record<string, string> = {};
  const tokenBefore = process.env.OPS_READ_TOKEN;

  beforeAll(async () => {
    requireTestDb();
    process.env.HVK_CUSTOMER_NAME = `HvK Neuabgleich ${tag}`;
    delete process.env.HVK_PRODUCT; // Standard „PKV-Tarifoptimierung“
    process.env.OPS_READ_TOKEN = TOKEN;
    customerId = (await makeCustomer({ name: `HvK Neuabgleich ${tag}` })).id;
    otherCustomerId = (await makeCustomer()).id;
    subId = (
      await prisma.leadSubscription.create({
        data: { customerId, productKey: "PKV-Tarifoptimierung", price: 45, period: "week", delivery: "email", deliveryEmail: "hvk@test.local", stornoDays: 7, airtableId: bezug },
      })
    ).id;
    // Rechnung übernehmen, solange wir (wie vor dem Fix) keine passenden Leads finden: Geliefert 0, Reklamation offen
    const r = await importHvkPdf(await pdfOf(FIXTURE.replace("369-G-000034", invoiceNo)), { pdfName: "Gutschrift.pdf", source: "upload" }, { actor: admin });
    expect(r.ok && r.result).toMatchObject({ status: "neu", delivered: 0, stornoAuto: 0, stornoReview: 1 });
    const later = FIXTURE.replace("369-G-000034", laterNo)
      .replace("Zeitraum:   20.07.2026 - 26.07.2026", "Zeitraum:   27.07.2026 - 02.08.2026")
      .replace("Lead ID: 4596925, KVV-Opt, 2026-07-19, 84032 Landshut", "Lead ID: 4597002, KVV-Opt, 2026-07-24, 80331 München");
    const r2 = await importHvkPdf(await pdfOf(later), { pdfName: null, source: "upload" }, { actor: admin });
    expect(r2.ok && r2.result).toMatchObject({ status: "neu", stornoAuto: 0, stornoReview: 1 });

    const mk = async (key: string, d: { day: string; plz: string; ort: string; source: string; bezug?: string; app?: boolean; test?: boolean; customer?: string }) => {
      const l = await prisma.lead.create({
        data: {
          customerId: d.customer ?? customerId,
          source: d.source,
          name: `Lead ${key} ${tag}`,
          phone: `+4917000${tag}`,
          status: "Neuer Lead",
          isTest: !!d.test,
          bezugAirtableId: d.bezug ?? null,
          formData: [
            { label: "PLZ", value: d.plz },
            { label: "Ort", value: d.ort },
          ],
          ...(d.app ? { subscriptionId: subId, deliveredAt: at(d.day), createdAt: at(d.day) } : { airtableId: `rec${key}${tag}`, createdAt: at(d.day) }),
        },
      });
      await prisma.revenue.create({ data: { customerId: d.customer ?? customerId, leadId: l.id, amount: 45 } });
      ids[key] = l.id;
    };
    // Airtable-Zeit: source „Wechsel“ (canonicalProductKey), Bezug München
    await mk("rek", { day: "2026-07-19", plz: "84032", ort: "Landshut", source: "Wechsel", bezug });
    // Nur über den Airtable-Bezug erkennbar
    await mk("mg", { day: "2026-07-20", plz: "41239", ort: "Mönchengladbach", source: "Altes Produkt", bezug });
    // App mit Bezug, abweichende source
    await mk("muc", { day: "2026-07-21", plz: "80331", ort: "München", source: "Irgendwas", app: true });
    // Zählt nicht: Testlead, anderer Kunde
    await mk("test", { day: "2026-07-22", plz: "79713", ort: "Bad Säckingen", source: "Wechsel", test: true });
    await mk("fremd", { day: "2026-07-19", plz: "84032", ort: "Landshut", source: "Wechsel", customer: otherCustomerId });
  });

  afterAll(async () => {
    await prisma.hvkInvoice.deleteMany({ where: { invoiceNo: { in: [invoiceNo, laterNo] } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ customerId }, { entity: "HvkInvoice" }] } });
    await cleanupCustomer(customerId);
    await cleanupCustomer(otherCustomerId);
    delete process.env.HVK_CUSTOMER_NAME;
    process.env.OPS_READ_TOKEN = tokenBefore;
  });

  it("loadHvkLeads findet Airtable-Leads („Wechsel“, Airtable-Bezug) und App-Leads, ohne Testleads und fremde Kunden", async () => {
    const leads = await loadHvkLeads("2026-07-19", "2026-07-26");
    expect(leads.map((l) => l.id).sort()).toEqual([ids.rek, ids.mg, ids.muc].sort());
    expect(leads.find((l) => l.id === ids.rek)).toMatchObject({ date: "2026-07-19", plz: "84032", ort: "Landshut" });
  });

  it("Vorschau: Zahlen je Woche, nichts wird geschrieben", async () => {
    const s = await reabgleichHvk({ dryRun: true, actor: admin });
    const w = s.weeks.find((x) => x.invoiceNo === invoiceNo)!;
    expect(w).toMatchObject({ periodStart: "2026-07-20", periodEnd: "2026-07-26", delivered: 2, deliveredBefore: 0, billed: 7, diff: -5, foreign: 5, stornoNew: 1, stornoBefore: 0, open: 0, changed: true });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: ids.rek } })).stornoState).toBeNull();
    const inv = await prisma.hvkInvoice.findUniqueOrThrow({ where: { invoiceNo }, include: { reklamationen: true } });
    expect(inv.deliveredCount).toBe(0);
    expect(inv.reklamationen[0].status).toBe("offen");
    expect(await prisma.auditLog.count({ where: { action: "ppl.hvk_neuabgleich" } })).toBe(0);
    expect(s.weeks.find((x) => x.invoiceNo === laterNo)).toMatchObject({ stornoNew: 1, open: 0 });
    expect(s.totals.linked).toBeGreaterThan(0);
    expect(await prisma.lead.count({ where: { customerId, hvkLeadId: { not: null } } })).toBe(0);
  });

  it("Übernehmen: Geliefert neu, offene Reklamation wird Storno (auto); zweiter Lauf ändert nichts", async () => {
    const before = await prisma.hvkInvoice.findUniqueOrThrow({ where: { invoiceNo } });
    const s = await reabgleichHvk({ dryRun: false, actor: admin });
    expect(s.weeks.find((x) => x.invoiceNo === invoiceNo)).toMatchObject({ delivered: 2, stornoNew: 1, open: 0, errors: [] });

    const l = await prisma.lead.findUniqueOrThrow({ where: { id: ids.rek } });
    expect(l).toMatchObject({ stornoState: "approved", status: "Storno", stornoReason: `Reklamation HvK-Abrechnung ${invoiceNo}`, stornoNote: "HvK Lead ID 4596925, 84032 Landshut, geliefert 19.07.2026" });
    expect((await prisma.revenue.findFirstOrThrow({ where: { leadId: ids.rek } })).cancelled).toBe(true);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: ids.fremd } })).stornoState).toBeNull();

    const inv = await prisma.hvkInvoice.findUniqueOrThrow({ where: { invoiceNo }, include: { reklamationen: true } });
    expect(inv).toMatchObject({ deliveredCount: 2, boughtCount: 7, netCents: before.netCents, stornoAuto: 1, stornoReview: 0, pdfName: "Gutschrift.pdf" });
    expect(inv.lines).toEqual(before.lines);
    expect(Buffer.from(inv.pdf).equals(Buffer.from(before.pdf))).toBe(true);
    expect(inv.reklamationen[0]).toMatchObject({ status: "auto", leadId: ids.rek, candidateIds: [ids.rek] });
    expect(inv.reklamationen[0].decidedAt).not.toBeNull();
    expect(inv.reklamationen[0].via).toBe("datum_plz");
    // Zuordnungen gespeichert: sichere Treffer der Woche und die Reklamation
    const hvkIds = Object.fromEntries((await prisma.lead.findMany({ where: { customerId }, select: { id: true, hvkLeadId: true } })).map((x) => [x.id, x.hvkLeadId]));
    expect(hvkIds).toMatchObject({ [ids.rek]: "4596925", [ids.mg]: "4595123", [ids.muc]: "4597002", [ids.test]: null });
    // Alte offene Reklamation der späteren Rechnung über die ID aufgelöst
    const later = await prisma.hvkInvoice.findUniqueOrThrow({ where: { invoiceNo: laterNo }, include: { reklamationen: true } });
    expect(later.reklamationen[0]).toMatchObject({ status: "auto", leadId: ids.muc, via: "id" });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: ids.muc } })).stornoState).toBe("approved");
    expect((await listHvkInvoices()).find((x) => x.invoiceNo === invoiceNo)).toMatchObject({ delivered: 2, billed: 7, stornoAuto: 1, stornoOpen: 0 });
    expect(await prisma.auditLog.count({ where: { action: "ppl.hvk_neuabgleich" } })).toBe(1);

    const again = await reabgleichHvk({ dryRun: false, actor: admin });
    expect(again.totals).toMatchObject({ changed: 0, linked: 0 });
    expect(again.weeks.find((x) => x.invoiceNo === invoiceNo)).toMatchObject({ stornoNew: 0, stornoBefore: 1, changed: false });
    expect(await prisma.auditLog.count({ where: { action: "ppl.hvk_neuabgleich" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: ids.rek, action: "storno.admin" } })).toBe(1);
    const after = await prisma.hvkInvoice.findUniqueOrThrow({ where: { invoiceNo } });
    expect(after.updatedAt.getTime()).toBe(inv.updatedAt.getTime());
  });

  it("Diagnose q=hvk&neu=1: nur Zahlen, keine Namen oder Telefonnummern", async () => {
    const r = await GET(new Request(`https://app.test/api/ops/diagnose?q=hvk&neu=1`, { headers: { authorization: `Bearer ${TOKEN}` } }));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { data: { rechnungen: Record<string, unknown>[]; neuabgleich: { wochen: Record<string, unknown>[] } } };
    expect(j.data.rechnungen.find((x) => x.invoiceNo === invoiceNo)).toMatchObject({ zeitraum: "2026-07-20..2026-07-26", geliefert: 2, abgerechnet: 7, differenz: -5, stornoAuto: 1, stornoOffen: 0 });
    expect(j.data.neuabgleich.wochen.find((x) => x.invoiceNo === invoiceNo)).toMatchObject({ geliefert: 2, stornoNeu: 0, offen: 0, aendertSich: false });
    const text = JSON.stringify(j);
    expect(text).not.toContain(`Lead rek ${tag}`);
    expect(text).not.toContain(`+4917000${tag}`);
  });
});
