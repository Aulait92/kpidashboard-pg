// Monatsberichte: idempotent je Monat, nur „gut“ (und nur eingeschaltet) geht automatisch raus,
// mittel/schwach bleiben Entwurf mit Aufgabe, Prüfer blockt „Garantie“, „Ich rufe an“ → Aufgabe.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => ({ sent: [] as { to: unknown; subject: string }[] }));
vi.mock("@/lib/email", async (orig) => {
  const real = await orig<typeof import("@/lib/email")>();
  return {
    ...real,
    sendCustomerMail: async (o: { to: unknown; subject: string }) => {
      mail.sent.push({ to: o.to, subject: o.subject });
      return { ok: true };
    },
  };
});
vi.mock("@/lib/push", () => ({ sendToAdmins: async () => ({}) }));

import { prisma } from "@/lib/prisma";
import { callInstead, runMonthlyReports, saveReportSettings } from "@/lib/monatsbericht/server";
import type { LlmCall } from "@/lib/kampagnen/llm";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const MONTH = "2026-10";
const NOW = new Date("2026-11-02T08:00:00Z");
const usage = { tokensIn: 10, tokensOut: 10, costCents: 1 };

/** Claude-Ersatz: Schreiber liefert einen Text, Prüfer sagt ok. */
const fakeLlm = (paragraphs: string[] = ["Im Oktober 2026 kamen neue Anfragen herein.", "Wir haben die Anzeigen weiter optimiert und melden uns mit den nächsten Schritten."]): LlmCall =>
  vi.fn(async (req) => ({
    text: req.agent === "Berichtsprüfer" ? JSON.stringify({ ok: true, issues: [] }) : JSON.stringify({ subject: "Ihr Rückblick auf den Oktober", paragraphs, tips: ["Rufen Sie neue Leads möglichst innerhalb von 5 Minuten an."] }),
    usage,
  }));

async function setupCustomer(leads: number, termine: number, activeDays = 25) {
  const c = await makeCustomer({ plan: "software" });
  await makeBuyer(c.id, "owner");
  await prisma.customerAdSpend.createMany({
    data: Array.from({ length: activeDays }, (_, i) => ({ customerId: c.id, accountId: "act_test", date: new Date(Date.UTC(2026, 9, i + 2, 12)), amount: 24 })),
  });
  await prisma.lead.createMany({
    data: Array.from({ length: leads }, (_, i) => ({ customerId: c.id, name: `L${i}`, status: i % 2 ? "Termin" : "Nicht erreicht", createdAt: new Date(Date.UTC(2026, 9, 3 + (i % 20), 10)) })),
  });
  if (termine) {
    await prisma.appointment.createMany({
      data: Array.from({ length: termine }, (_, i) => ({ customerId: c.id, mode: "phone", startsAt: new Date(Date.UTC(2026, 9, 5 + i, 9)), status: "completed" })),
    });
  }
  return c.id;
}

describe("Monatsberichte", () => {
  const ids: string[] = [];
  beforeAll(async () => {
    requireTestDb();
    process.env.RESEND_API_KEY = "test";
    process.env.APP_URL ??= "https://app.test";
  });
  beforeEach(async () => {
    mail.sent = [];
    // Ziel-Leadpreis 6 € → 600 € Budget = 100 Leads Erwartung
    await saveReportSettings({ targetCpl: 6, autoSendGood: false });
  });
  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
    await prisma.reportSettings.deleteMany({});
  });

  it("gut + automatisch aus → Entwurf mit Aufgabe, keine Mail; zweiter Lauf legt nichts doppelt an", async () => {
    const id = await setupCustomer(95, 12);
    ids.push(id);
    await runMonthlyReports(NOW, { month: MONTH, llm: fakeLlm(), customerIds: [id] });
    await runMonthlyReports(NOW, { month: MONTH, llm: fakeLlm(), customerIds: [id] });
    const rows = await prisma.monthlyReport.findMany({ where: { customerId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rating: "gut", status: "draft" });
    expect(mail.sent).toHaveLength(0);
    const name = (await prisma.customer.findUniqueOrThrow({ where: { id } })).name;
    expect(await prisma.salesTask.count({ where: { title: { startsWith: `Monatsbericht prüfen: ${name} (gut)` } } })).toBe(1);
    await prisma.salesTask.deleteMany({ where: { title: { contains: name } } });
  });

  it("gut + automatisch an → wird gesendet", async () => {
    await saveReportSettings({ autoSendGood: true });
    const id = await setupCustomer(95, 12);
    ids.push(id);
    await runMonthlyReports(NOW, { month: MONTH, llm: fakeLlm(), customerIds: [id] });
    const r = await prisma.monthlyReport.findFirstOrThrow({ where: { customerId: id } });
    expect(r.status).toBe("sent");
    expect(mail.sent).toHaveLength(1);
  });

  it("schwach geht nie automatisch raus – auch wenn automatisch an", async () => {
    await saveReportSettings({ autoSendGood: true });
    const id = await setupCustomer(40, 2);
    ids.push(id);
    await runMonthlyReports(NOW, { month: MONTH, llm: fakeLlm(), customerIds: [id] });
    const r = await prisma.monthlyReport.findFirstOrThrow({ where: { customerId: id } });
    expect(r).toMatchObject({ rating: "schwach", status: "draft" });
    expect(mail.sent).toHaveLength(0);
    const name = (await prisma.customer.findUniqueOrThrow({ where: { id } })).name;
    expect(await prisma.salesTask.count({ where: { title: { contains: `${name} (schwach) – Empfehlung: anrufen statt schicken` } } })).toBe(1);
    await prisma.salesTask.deleteMany({ where: { title: { contains: name } } });
  });

  it("mittel geht nie automatisch raus", async () => {
    await saveReportSettings({ autoSendGood: true });
    const id = await setupCustomer(72, 8);
    ids.push(id);
    await runMonthlyReports(NOW, { month: MONTH, llm: fakeLlm(), customerIds: [id] });
    const r = await prisma.monthlyReport.findFirstOrThrow({ where: { customerId: id } });
    expect(r).toMatchObject({ rating: "mittel", status: "draft" });
    expect(mail.sent).toHaveLength(0);
  });

  it("Prüfer blockt „Garantie“: Bericht bleibt Entwurf, obwohl gut und automatisch an", async () => {
    await saveReportSettings({ autoSendGood: true });
    const id = await setupCustomer(95, 12);
    ids.push(id);
    await runMonthlyReports(NOW, { month: MONTH, llm: fakeLlm(["Ihre Lead-Garantie ist erfüllt.", "Weiter so im nächsten Monat."]), customerIds: [id] });
    const r = await prisma.monthlyReport.findFirstOrThrow({ where: { customerId: id } });
    expect(r.status).toBe("draft");
    expect((r.check as { ok: boolean }).ok).toBe(false);
    expect(mail.sent).toHaveLength(0);
  });

  it("zu wenige aktive Tage → kein Bericht", async () => {
    const id = await setupCustomer(20, 2, 9);
    ids.push(id);
    await runMonthlyReports(NOW, { month: MONTH, llm: fakeLlm(), customerIds: [id] });
    expect(await prisma.monthlyReport.count({ where: { customerId: id } })).toBe(0);
  });

  it("„Nicht senden, ich rufe an“ legt eine Anruf-Aufgabe an", async () => {
    const id = await setupCustomer(40, 2);
    ids.push(id);
    await runMonthlyReports(NOW, { month: MONTH, llm: fakeLlm(), customerIds: [id] });
    const r = await prisma.monthlyReport.findFirstOrThrow({ where: { customerId: id } });
    expect((await callInstead(r.id, { email: "test" })).ok).toBe(true);
    const name = (await prisma.customer.findUniqueOrThrow({ where: { id } })).name;
    const t = await prisma.salesTask.findFirst({ where: { title: { startsWith: `Anrufen: ${name}` } } });
    expect(t?.type).toBe("ANRUF");
    expect((await prisma.monthlyReport.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("call");
    await prisma.salesTask.deleteMany({ where: { title: { contains: name } } });
  });
});
