// Anti-Churn beim Kündigen: Absicht mit Grund gespeichert, Push höchstens einmal am Tag, Rückruf/Check erzeugt
// eine Aufgabe, Kündigung schließt offene Absichten als „gekündigt“ ab (Ole, 15.11.2026).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ pushes: [] as { title: string }[] }));
vi.mock("@/lib/push", () => ({
  sendToAdmins: vi.fn(async (p: { title: string }) => {
    sent.pushes.push(p);
    return { sent: 0, removed: 0, errors: [] };
  }),
}));
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendCustomerMail: vi.fn(async () => ({ ok: true })) }));

import { prisma } from "@/lib/prisma";
import { chooseChurnOffer, recordChurnIntent } from "@/lib/anti-churn-server";
import { cancelContract } from "@/lib/vertrag-kuendigung";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);

describe("Anti-Churn", () => {
  let customerId = "";
  let contactId = "";
  let actor = { id: "", email: "inhaber@example.test", role: "BUYER" };
  beforeAll(async () => {
    requireTestDb();
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
    const c = await makeCustomer({ retainerStart: new Date("2026-08-01T12:00:00Z"), retainerMonthly: 1000 });
    customerId = c.id;
    const contact = await prisma.salesContact.create({ data: { name: "Churn Test", email: `churn-${uid()}@example.test`, customerId } });
    contactId = contact.id;
    actor = { id: (await makeBuyer(customerId, "owner")).id, email: "inhaber@example.test", role: "BUYER" };
  });
  beforeEach(() => {
    sent.pushes = [];
  });
  afterAll(async () => {
    await prisma.salesTask.deleteMany({ where: { contactId } });
    await prisma.salesContact.deleteMany({ where: { id: contactId } });
    await cleanupCustomer(customerId);
  });

  it("speichert die Absicht, meldet sie uns einmal am Tag", async () => {
    const a = await recordChurnIntent(customerId, { reason: "zu_teuer", note: "Budget knapp", actor });
    await recordChurnIntent(customerId, { reason: "keine_zeit", note: null, actor });
    expect(sent.pushes.filter((p) => p.title.startsWith("Kündigungsabsicht"))).toHaveLength(1);
    const row = await prisma.churnIntent.findUniqueOrThrow({ where: { id: a.id } });
    expect(row).toMatchObject({ reason: "zu_teuer", note: "Budget knapp", outcome: "offen" });
  });

  it("Rückruf statt Kündigung: Aufgabe und Ergebnis „alternative“, kein doppelter Auftrag", async () => {
    const a = await recordChurnIntent(customerId, { reason: "aufhoeren", note: null, actor });
    expect(await chooseChurnOffer(customerId, a.id, "rueckruf", actor)).toEqual({ ok: true });
    expect(await chooseChurnOffer(customerId, a.id, "rueckruf", actor)).toEqual({ ok: true });
    const tasks = await prisma.salesTask.findMany({ where: { contactId, title: { startsWith: "Rückruf statt Kündigung" } } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].type).toBe("ANRUF");
    expect((await prisma.churnIntent.findUniqueOrThrow({ where: { id: a.id } })).outcome).toBe("alternative");
    expect(await chooseChurnOffer(customerId, "fremd", "check", actor)).toMatchObject({ ok: false });
  });

  it("Kündigung schließt offene Absichten als „gekündigt“ ab", async () => {
    const res = await cancelContract(customerId, { actor, reason: "Es ist mir zu teuer" });
    expect(res.ok).toBe(true);
    const open = await prisma.churnIntent.count({ where: { customerId, outcome: { not: "gekuendigt" } } });
    expect(open).toBe(0);
  });
});
