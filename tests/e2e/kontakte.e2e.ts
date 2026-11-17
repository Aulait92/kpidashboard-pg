// Klick-Test: Vermittler setzt auf dem Handy bei einem Kontakt den nächsten Schritt („morgen wieder“).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { prisma } from "@/lib/prisma";
import { berlinTodayIso, addDaysIso } from "@/lib/offer-pricing";
import { aufraeumen, BASE, browser, context, vermittler } from "./helpers";

describe("Kontakte: nächster Schritt", () => {
  let b: Browser;
  let v: Awaited<ReturnType<typeof vermittler>>;
  let leadId = "";

  beforeAll(async () => {
    b = await browser();
    v = await vermittler();
    const lead = await prisma.lead.create({
      data: { customerId: v.customer.id, name: "Paula Probe", phone: "+491701234567", status: "Im Gespräch", assignedUserId: v.user.id },
    });
    leadId = lead.id;
  });

  afterAll(async () => {
    await b?.close();
    if (v) await aufraeumen(v.customer.id);
  });

  it("Kontakte-Liste: „Nächsten Schritt festlegen“ → morgen wieder", async () => {
    const ctx = await context(b, { mobile: true, token: v.token });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/buyer/kontakte`, { waitUntil: "networkidle" });
    expect(await p.locator("text=Paula Probe").count()).toBeGreaterThan(0);
    if (process.env.E2E_DEBUG) await p.screenshot({ path: `${process.env.E2E_DEBUG}/kontakte.png`, fullPage: true });
    await p.locator("[data-next-step-button]:visible").first().click();
    if (process.env.E2E_DEBUG) await p.screenshot({ path: `${process.env.E2E_DEBUG}/kontakte-2.png` });
    await p.locator("[data-step=morgen]:visible").click();
    await expect.poll(async () => (await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).followUpAt?.toISOString() ?? null, { timeout: 30_000 }).not.toBeNull();
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    const tag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(lead.followUpAt!);
    expect(tag).toBe(addDaysIso(berlinTodayIso(), 1));
    await ctx.close();
  });
});
