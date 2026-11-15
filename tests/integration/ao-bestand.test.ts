// Ausschließlichkeitsvertreter (Anwalts-Memo, 15.11.2026): Vorschläge nur für angebotene Sparten, Datenexport
// (ZIP mit CSV) und Löschung bei Vertragsende inklusive Bestand.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { offeredFor, opportunities, potentialHint } from "@/lib/bestand/campaigns";
import { buildCustomerExport } from "@/lib/export/kundendaten";
import { eraseCustomerData } from "@/lib/erasure";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const NOW = new Date("2026-11-16T09:00:00Z");

async function bestandWithGap(customerId: string) {
  // 3 Kfz-Kunden ohne Hausrat und ohne Rechtsschutz, mit E-Mail-Einwilligung; 1 Kunde mit Hausrat
  for (let i = 0; i < 3; i++) {
    const e = await prisma.existingCustomer.create({ data: { customerId, firstName: "K", lastName: `Kfz${i}`, email: `k${i}${uid()}@kunde.test`, emailConsent: "ja", lines: ["KFZ"] } });
    await prisma.existingContract.create({ data: { existingCustomerId: e.id, line: "KFZ" } });
  }
  const h = await prisma.existingCustomer.create({ data: { customerId, firstName: "H", lastName: "Hausrat", email: `h${uid()}@kunde.test`, lines: ["Hausrat"] } });
  await prisma.existingContract.create({ data: { existingCustomerId: h.id, line: "Hausrat" } });
}

describe("Ausschließlichkeitsvertreter, Export und Löschung", () => {
  const customers: string[] = [];
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of customers) {
      await prisma.auditLog.deleteMany({ where: { customerId: id } });
      await cleanupCustomer(id);
    }
  });

  it("AO: „Lücke schließen“ nur für Sparten aus dem Bestand bzw. dem Profil; Makler bekommt alle", async () => {
    const ao = await makeCustomer({ name: `AO ${uid()}`, existingCustomersEnabled: true, vermittlerTyp: "vertreter" });
    const makler = await makeCustomer({ name: `Makler ${uid()}`, existingCustomersEnabled: true, vermittlerTyp: "makler" });
    customers.push(ao.id, makler.id);
    await bestandWithGap(ao.id);
    await bestandWithGap(makler.id);
    const titles = async (id: string) => (await opportunities(id, NOW)).filter((o) => o.occasion === "cross_sell").map((o) => o.title).sort();
    // Bestand des AO hat KFZ und Hausrat → „KFZ ohne Hausrat“ ja, „KFZ ohne Rechtsschutz/Haftpflicht“ nein
    expect(await titles(ao.id)).toEqual(["KFZ ohne Hausrat"]);
    expect(await titles(makler.id)).toEqual(expect.arrayContaining(["KFZ ohne Hausrat", "KFZ ohne Haftpflicht", "KFZ ohne Rechtsschutz"]));
    // Profil: nur Rechtsschutz und KFZ → kein Hausrat mehr, dafür Rechtsschutz
    await prisma.customer.update({ where: { id: ao.id }, data: { bestandSparten: ["KFZ", "Rechtsschutz"] } });
    expect(await titles(ao.id)).toEqual(["KFZ ohne Rechtsschutz"]);
    expect((await potentialHint(ao.id, NOW))?.topic).toBe("Rechtsschutz");
    expect(await offeredFor(makler.id)).toBeNull();
  });

  it("Export: ZIP mit CSV-Dateien (lässt sich entpacken), ohne gelöschte Leads", async () => {
    const c = await makeCustomer({ name: `Export Agentur ${uid()}`, existingCustomersEnabled: true });
    customers.push(c.id);
    const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Erika Export", phone: "4915100000777", email: "erika@export.test", status: "Abschluss", formData: [{ label: "Beruf", value: "Lehrerin" }] } });
    await prisma.lead.create({ data: { customerId: c.id, name: "Gelöscht (Datenschutz)", status: "Neuer Lead", erasedAt: NOW } });
    await prisma.leadContract.create({ data: { leadId: lead.id, customerId: c.id, sparte: "kfz", signedAt: NOW, insurer: "Muster AG", contractNo: "V-1" } });
    const conv = await prisma.conversation.create({ data: { customerId: c.id, leadId: lead.id, contactPhone: "4915100000777", contactName: "Erika" } });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Hallo; ich hätte gern einen Termin" } });
    const e = await prisma.existingCustomer.create({ data: { customerId: c.id, externalNo: "K-1", firstName: "Bernd", lastName: "Bestand", email: "bernd@bestand.test", lines: ["KFZ"], widerspruchHinweis: "ja", widerspruchHinweisText: "Antrag 2024" } });
    await prisma.existingContract.create({ data: { existingCustomerId: e.id, line: "KFZ", contractNo: "B-9" } });
    await prisma.bestandConsentLog.create({ data: { customerId: c.id, existingCustomerId: e.id, channel: "email", action: "erteilt", source: "formular", text: "Ich bin einverstanden" } });

    const r = await buildCustomerExport(c.id, NOW);
    expect(r.counts).toMatchObject({ leads: 1, contracts: 1, messages: 1, bestand: 1, bestandContracts: 1, consentLogs: 1 });
    expect(r.fileName).toMatch(/^performancegrowth-export-export-agentur-.*-2026-11-16\.zip$/);
    const dir = mkdtempSync(join(tmpdir(), "pg-export-"));
    const file = join(dir, "x.zip");
    writeFileSync(file, r.zip);
    let unzipOk = true;
    try {
      execFileSync("unzip", ["-q", "-o", file, "-d", dir]);
    } catch {
      unzipOk = false; // unzip fehlt in manchen Umgebungen: dann nur der Inhalt im Puffer
    }
    if (unzipOk) {
      const leads = readFileSync(join(dir, "leads.csv"), "utf8");
      expect(leads).toContain("Erika Export");
      expect(leads).toContain("+4915100000777");
      expect(leads).not.toContain("Gelöscht (Datenschutz)");
      expect(readFileSync(join(dir, "chats.csv"), "utf8")).toContain('"Hallo; ich hätte gern einen Termin"');
      expect(readFileSync(join(dir, "bestand_kunden.csv"), "utf8")).toContain("Antrag 2024");
      expect(readFileSync(join(dir, "LIESMICH.txt"), "utf8")).toContain("leads.csv: 1 Zeilen");
    } else {
      expect(r.zip.includes(Buffer.from("Erika Export"))).toBe(true);
    }
  });

  it("Löschung bei Vertragsende: Leads anonymisiert, Bestand, Kampagnen, Importe und Protokoll weg, Sperrliste bleibt, Grund im Protokoll", async () => {
    const c = await makeCustomer({ name: `Ende ${uid()}`, existingCustomersEnabled: true, archived: true });
    customers.push(c.id);
    await prisma.lead.create({ data: { customerId: c.id, name: "Max Ende", phone: "4915100000888", status: "Neuer Lead" } });
    const e = await prisma.existingCustomer.create({ data: { customerId: c.id, firstName: "B", lastName: "Weg", email: "weg@bestand.test", lines: ["KFZ"] } });
    await prisma.existingContract.create({ data: { existingCustomerId: e.id, line: "KFZ" } });
    const camp = await prisma.customerCampaign.create({ data: { customerId: c.id, name: "Test", occasion: "review", segment: {}, recipients: { create: [{ existingCustomerId: e.id, channel: "email", basis: "einwilligung" }] } } });
    await prisma.existingCustomerImport.create({ data: { customerId: c.id, fileName: "liste.xlsx" } });
    await prisma.bestandConsentLog.create({ data: { customerId: c.id, existingCustomerId: e.id, channel: "email", action: "erteilt", source: "formular" } });
    await prisma.bestandOptOut.create({ data: { customerId: c.id, kind: "email", hash: `h${uid()}`, scope: "all" } });

    const r = await eraseCustomerData(c.id, { id: "admin", email: "admin@test.local", role: "ADMIN" }, { reason: "Vertragsende 31.12." });
    expect(r).toMatchObject({ leads: 1, bestand: 1, consentLogs: 1 });
    expect(await prisma.lead.count({ where: { customerId: c.id, phone: { not: null } } })).toBe(0);
    expect(await prisma.existingCustomer.count({ where: { customerId: c.id } })).toBe(0);
    expect(await prisma.existingContract.count({ where: { existingCustomerId: e.id } })).toBe(0);
    expect(await prisma.customerCampaign.count({ where: { id: camp.id } })).toBe(0);
    expect(await prisma.existingCustomerImport.count({ where: { customerId: c.id } })).toBe(0);
    expect(await prisma.bestandConsentLog.count({ where: { customerId: c.id } })).toBe(0);
    expect(await prisma.bestandOptOut.count({ where: { customerId: c.id } })).toBe(1);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { customerId: c.id, action: "customer.erase" } });
    expect(log.actorEmail).toBe("admin@test.local");
    expect((log.details as { reason?: string }).reason).toBe("Vertragsende 31.12.");
  });
});
