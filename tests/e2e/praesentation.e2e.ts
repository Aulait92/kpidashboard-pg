// Klick-Test: Verkaufspräsentation zum Nachklicken (/praesentation/<token>) mit Folie „Ihr Abschlussbonus“
// als vorletzter Folie; Blättern mit der Pfeiltaste bis dorthin.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { prisma } from "@/lib/prisma";
import { folienListe } from "@/lib/vertrieb/verkaufspraesentation";
import { verkaufsLinkErstellen } from "@/lib/vertrieb/verkaufspraesentation-server";
import { BASE, browser, context } from "./helpers";

describe("Verkaufspräsentation: Bonusfolie", () => {
  let b: Browser;
  let contactId = "";
  let token = "";

  beforeAll(async () => {
    b = await browser();
    const c = await prisma.salesContact.create({ data: { name: "E2E Präsentation", email: `e2e-praes-${Date.now()}@example.test` } });
    contactId = c.id;
    token = (await verkaufsLinkErstellen(c.id, "vertreter", null))!.token;
  });

  afterAll(async () => {
    await b?.close();
    await prisma.salesContact.delete({ where: { id: contactId } }).catch(() => {});
  });

  it("vorletzte Folie zeigt den Bonus mit Frist „morgen“", async () => {
    const liste = folienListe("vertreter");
    const bonusNr = liste.findIndex((f) => f.art === "bonus") + 1;
    expect(bonusNr).toBe(liste.length - 1);

    const ctx = await context(b);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/praesentation/${token}`, { waitUntil: "networkidle" });
    for (let i = 1; i < bonusNr; i++) {
      await p.keyboard.press("ArrowRight");
      await p.waitForTimeout(60);
    }
    await expect
      .poll(async () => {
        for (const el of await p.$$("section.vk")) {
          if ((await el.isVisible()) && (await el.innerText()).includes("Abschlussbonus")) return await el.innerText();
        }
        return "";
      }, { timeout: 20_000 })
      .toContain("morgen bis 23:59 Uhr");
    await ctx.close();
  });
});
