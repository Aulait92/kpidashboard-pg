// Klick-Test: Verkaufspräsentation zum Nachklicken (/praesentation/<token>) mit Folie „Jahresplan: 3 Monate sparen“
// als vorletzter Folie (Ole, 21.11.2026, statt der Bonusfolie); Blättern mit der Pfeiltaste bis dorthin.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { prisma } from "@/lib/prisma";
import { folienListe } from "@/lib/vertrieb/verkaufspraesentation";
import { verkaufsLinkErstellen } from "@/lib/vertrieb/verkaufspraesentation-server";
import { BASE, browser, context } from "./helpers";

describe("Verkaufspräsentation: Jahresplan-Folie", () => {
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

  it("vorletzte Folie zeigt die Ersparnis im Jahresplan (Listenpreis)", async () => {
    const liste = folienListe("vertreter");
    const jahresNr = liste.findIndex((f) => f.art === "jahresplan") + 1;
    expect(jahresNr).toBe(liste.length - 1);

    const ctx = await context(b);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/praesentation/${token}`, { waitUntil: "networkidle" });
    for (let i = 1; i < jahresNr; i++) {
      await p.keyboard.press("ArrowRight");
      await p.waitForTimeout(60);
    }
    await expect
      .poll(async () => {
        for (const el of await p.$$("section.vk")) {
          if ((await el.isVisible()) && (await el.innerText()).includes("Jahresplan")) return await el.innerText();
        }
        return "";
      }, { timeout: 20_000 })
      .toContain("2.970 €");
    await ctx.close();
  });
});
