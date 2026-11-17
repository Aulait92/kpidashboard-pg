// Klick-Test Show-up-Paket (Ole, 17.11.2026): Entscheidungsblatt „Ist Frau Becker da?“ aus dem Push (Handy) und
// dieselbe Frage auf „Heute“ (Desktop). Mit E2E_SHOTS=<Ordner> entstehen die Screenshots für die Rückmeldung
// (docs/screenshots/showup/).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { prisma } from "@/lib/prisma";
import { aufraeumen, BASE, browser, context, vermittler } from "./helpers";

const MIN = 60 * 1000;
const shot = process.env.E2E_SHOTS ?? process.env.E2E_DEBUG ?? "";

describe("Show-up: Ist Frau Becker da?", () => {
  let b: Browser;
  let v: Awaited<ReturnType<typeof vermittler>>;
  let termin = "";
  let termin2 = "";

  beforeAll(async () => {
    b = await browser();
    v = await vermittler("Agentur Ole Kannapinn");
    const lead = await prisma.lead.create({
      data: { customerId: v.customer.id, name: "Anna Becker", phone: "491701234567", status: "Im Gespräch", assignedUserId: v.user.id, formData: [{ label: "Anrede", value: "Frau" }] },
    });
    const conv = await prisma.conversation.create({ data: { customerId: v.customer.id, contactPhone: "491701234567", contactName: "Anna Becker", leadId: lead.id } });
    const start = new Date(Date.now() - 3 * MIN);
    termin = (
      await prisma.appointment.create({
        data: { customerId: v.customer.id, leadId: lead.id, conversationId: conv.id, mode: "video", meetUrl: "https://meet.google.com/abc-defg-hij", status: "booked", startsAt: start, endsAt: new Date(start.getTime() + 30 * MIN) },
      })
    ).id;
    const lead2 = await prisma.lead.create({
      data: { customerId: v.customer.id, name: "Jonas Krüger", phone: "491701234568", status: "Im Gespräch", assignedUserId: v.user.id, formData: [{ label: "Anrede", value: "Herr" }] },
    });
    termin2 = (
      await prisma.appointment.create({
        data: { customerId: v.customer.id, leadId: lead2.id, mode: "video", meetUrl: "https://meet.google.com/xyz", status: "booked", startsAt: new Date(Date.now() - MIN), endsAt: new Date(Date.now() + 29 * MIN) },
      })
    ).id;
  });

  afterAll(async () => {
    await b?.close();
    if (v) await aufraeumen(v.customer.id);
  });

  it("Handy: Blatt aus dem Push, „Fehlt noch“ zeigt Anrufen; Desktop gleich", async () => {
    const ctx = await context(b, { mobile: true, token: v.token });
    const p = await ctx.newPage();
    // Erster Aufruf übersetzt die Seite im Dev-Server
    p.setDefaultNavigationTimeout(200_000);
    p.setDefaultTimeout(120_000);
    await p.goto(`${BASE}/buyer/termine/${termin}`, { waitUntil: "networkidle" });
    await p.locator("[data-termin-anwesenheit=start]").waitFor();
    expect(await p.locator("text=Ist Frau Becker da?").count()).toBeGreaterThan(0);
    if (shot) await p.screenshot({ path: `${shot}/blatt-ist-da-390.png`, fullPage: true });
    await p.locator("button:has-text('Fehlt noch')").click();
    await p.locator("[data-termin-anwesenheit=wartet]").waitFor();
    expect(await p.locator("a[href='tel:+491701234567']").count()).toBeGreaterThan(0);
    await expect.poll(async () => (await prisma.appointment.findUniqueOrThrow({ where: { id: termin } })).attendance, { timeout: 30_000 }).toBe("fehlt");
    if (shot) await p.screenshot({ path: `${shot}/blatt-fehlt-noch-390.png`, fullPage: true });
    await ctx.close();
    const d = await context(b, { token: v.token });
    const dp = await d.newPage();
    await dp.goto(`${BASE}/buyer/termine/${termin2}`, { waitUntil: "networkidle" });
    await dp.locator("[data-termin-anwesenheit=start]").waitFor();
    if (shot) await dp.screenshot({ path: `${shot}/blatt-ist-da-desktop.png` });
    await d.close();
  });

  it("Heute: Frage in der Terminzeile (Handy und Desktop), „Ja, da“ → erschienen", async () => {
    for (const mobile of [true, false]) {
      const ctx = await context(b, { mobile, token: v.token });
      const p = await ctx.newPage();
      p.setDefaultNavigationTimeout(200_000);
      p.setDefaultTimeout(120_000);
      await p.goto(`${BASE}/buyer`, { waitUntil: "networkidle" });
      await p.locator("#termine").waitFor({ state: "attached" });
      await p.locator("[data-termin-anwesenheit]").first().waitFor();
      if (shot) await p.screenshot({ path: `${shot}/heute-termin-${mobile ? "390" : "desktop"}.png`, fullPage: mobile });
      await ctx.close();
    }
    const ctx = await context(b, { mobile: true, token: v.token });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/buyer`, { waitUntil: "networkidle" });
    await p.locator("[data-termin-anwesenheit=start] button:has-text('Ja, da')").first().click();
    await expect.poll(async () => (await prisma.appointment.findUniqueOrThrow({ where: { id: termin2 } })).attendance, { timeout: 30_000 }).toBe("erschienen");
    await ctx.close();
  });
});
