// Klick-Test: Angebot mit (schon zugesagtem) Abschlussbonus und „später zahlen“ (Ole, 16.11.2026) auf dem Handy
// annehmen. Neue Angebote haben seit 21.11.2026 keinen Bonus mehr, der Bonus wird deshalb nach dem Anlegen gesetzt.
// Prüft: Bonus-Hinweis vor der Annahme, Hinweis auf späteres Zahlen, Annahme ohne Weiterleitung zu Stripe,
// danach „Bonus gesichert“ und Erinnerungstag speichern. Keine Zahlung, keine Mail.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { prisma } from "@/lib/prisma";
import { createOffer } from "@/lib/offers";
import { addDaysIso, berlinTagesendeIso, berlinTodayIso } from "@/lib/offer-pricing";
import { BASE, browser, context } from "./helpers";

describe("Angebot: Abschlussbonus und später zahlen", () => {
  let b: Browser;
  let contactId = "";
  let token = "";
  let offerId = "";

  beforeAll(async () => {
    process.env.OFFER_TERMS_URL = `${BASE}/rechtliches/agb`;
    process.env.OFFER_DPA_URL = `${BASE}/rechtliches/avv`;
    b = await browser();
    const c = await prisma.salesContact.create({ data: { name: "E2E Agentur Weber", email: `e2e-${Date.now()}@example.test` } });
    contactId = c.id;
    const offer = await createOffer(
      { salesContactId: c.id },
      {
        contactName: "Max Weber",
        company: "E2E Agentur Weber",
        email: c.email!,
        term: "12m",
        products: [{ name: "TKV-Katze", dailyBudget: 30 }],
        startDate: addDaysIso(berlinTodayIso(), 30),
        allowPayLater: true,
      },
      null,
    );
    await prisma.offer.update({ where: { id: offer.id }, data: { abschlussBonus: 300, abschlussBonusBis: berlinTagesendeIso(addDaysIso(berlinTodayIso(), 1)) } });
    token = offer.token;
    offerId = offer.id;
  });

  afterAll(async () => {
    await b?.close();
    await prisma.offer.deleteMany({ where: { salesContactId: contactId } }).catch(() => {});
    await prisma.salesContact.delete({ where: { id: contactId } }).catch(() => {});
  });

  it("vor der Annahme: Bonus mit Frist und Hinweis auf späteres Zahlen", async () => {
    const ctx = await context(b, { mobile: true });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/angebot/${token}`, { waitUntil: "networkidle" });
    const bonus = p.locator("#annehmen [data-abschlussbonus]");
    await expect(bonus.innerText()).resolves.toContain("300 € weniger Setup");
    await expect(bonus.innerText()).resolves.toContain("Bezahlen können Sie auch später");
    await expect(p.locator("[data-pay-later-hinweis]").innerText()).resolves.toContain("späteren Tag");
    // Keine Zahlartwahl vor der Annahme (Zahlung kommt danach)
    expect(await p.locator("#annehmen input[name=zahlart]").count()).toBe(0);
    await ctx.close();
  });

  it("annehmen: kein Sprung zu Stripe, Bonus gesichert, Erinnerungstag speichern", async () => {
    const ctx = await context(b, { mobile: true });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/angebot/${token}`, { waitUntil: "networkidle" });
    const form = p.locator("#annehmen form");
    await form.locator("input[name=name]").fill("Max Weber");
    for (const n of ["business", "priceStep", "terms"]) {
      const box = form.locator(`input[name=${n}]`);
      if (await box.count()) await box.check();
    }
    await form.locator("button[type=submit]").click();
    await p.waitForSelector("[data-pay-later]", { timeout: 120_000 });
    expect(p.url()).toContain(`/angebot/${token}`);

    const saved = await prisma.offer.findUniqueOrThrow({ where: { id: offerId } });
    expect(saved.status).toBe("accepted");
    // Bonus gesichert: Hinweis im Zahlungsfeld
    await expect(p.locator("[data-abschlussbonus]").first().innerText()).resolves.toContain("gesichert");

    await p.click("[data-pay-later]");
    const min = await p.locator("#payLaterDate").getAttribute("min");
    expect(min).toBeTruthy();
    await p.fill("#payLaterDate", min!);
    await p.click("[data-pay-later-form] button[type=submit]");
    await p.waitForSelector("[data-pay-later-set]", { timeout: 60_000 });
    const after = await prisma.offer.findUniqueOrThrow({ where: { id: offerId } });
    expect(after.paymentReminderAt?.toISOString().slice(0, 10)).toBe(min);
    await ctx.close();
  });
});
