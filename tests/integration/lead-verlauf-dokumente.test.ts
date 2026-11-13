// Lead-Verlauf, Police nach dem Abschluss und Dokumente am Lead (Ole, 13.11.2026).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { detectType, listLeadFiles, saveLeadFile } from "@/lib/lead-files";
import { loadLeadHistory, logLeadHistory } from "@/lib/lead-history";
import { syncFollowUpWithStatus, POLICY_TODO } from "@/lib/lead-followup";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

describe("Lead: Verlauf, Police, Dokumente", () => {
  const ids: string[] = [];
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
  });

  it("Dateityp am Inhalt geprüft", () => {
    expect(detectType("angebot.pdf", PDF)).toBe("application/pdf");
    expect(detectType("angebot.pdf", new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(detectType("bild.exe", PDF)).toBeNull();
  });

  it("Notiz und Dokument erscheinen im Verlauf; Abschluss setzt „Police fertig machen“", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Test Lead", status: "Angebot gesendet" } });
    await logLeadHistory(lead.id, "notiz", "Hat Interesse, muss sich mit Mann besprechen.", { customerId: c.id, userId: null });
    expect(await saveLeadFile({ leadId: lead.id, customerId: c.id, kind: "angebot", fileName: "Angebot.pdf", data: PDF, userId: null })).toEqual({ ok: true });
    expect(await saveLeadFile({ leadId: lead.id, customerId: c.id, kind: "angebot", fileName: "x.pdf", data: new Uint8Array([9, 9, 9, 9]), userId: null })).toMatchObject({ ok: false });
    const files = await listLeadFiles(lead.id);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ kind: "angebot", fileName: "Angebot.pdf" });
    const h = await loadLeadHistory(lead.id, null);
    expect(h.map((x) => x.kind)).toEqual(["dokument", "notiz"]);

    await prisma.lead.update({ where: { id: lead.id }, data: { status: "Abschluss" } });
    await syncFollowUpWithStatus(lead.id, "Abschluss");
    const won = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(won.followUpNote).toBe(POLICY_TODO);
    expect(won.followUpAt).not.toBeNull();

    await prisma.lead.update({ where: { id: lead.id }, data: { policyDoneAt: new Date() } });
    await syncFollowUpWithStatus(lead.id, "Abschluss");
    const done = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(done.followUpAt).toBeNull();
  });
});
