// Klick-Test: Rundgang über die Vermittlerseiten mit Beispieldaten auf dem Handy (390 px, Berliner Zeit).
// Jede Seite lädt ohne Fehler im Browser und ohne seitliches Scrollen (UX-Regel „Handy zuerst“).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { prisma } from "@/lib/prisma";
import { seedDemoData } from "@/lib/demo-data";
import { aufraeumen, BASE, browser, context, vermittler } from "./helpers";

describe("Vermittlerseiten auf dem Handy", () => {
  let b: Browser;
  let v: Awaited<ReturnType<typeof vermittler>>;
  let seiten: [string, string][] = [];

  beforeAll(async () => {
    b = await browser();
    v = await vermittler();
    await seedDemoData(v.customer.id);
    const appt = await prisma.appointment.findFirst({ where: { customerId: v.customer.id, status: "booked", startsAt: { gt: new Date() } }, select: { id: true, leadId: true } });
    seiten = [
      ["Heute", "/buyer"],
      ["Kontakte", "/buyer/kontakte"],
      ["Pipeline", "/buyer/kontakte?modus=pipeline"],
      ["Nachrichten", "/buyer/chats"],
      ["Wachstum", "/buyer/wachstum"],
      ["Einrichtung", "/buyer/einrichtung"],
      ["Einstellungen", "/buyer/einstellungen"],
      ["Konto", "/buyer/konto"],
      ["Kalender", "/buyer/kalender"],
      ["Postfach", "/buyer/postfach"],
      ["Vorlagen", "/buyer/vorlagen"],
      ["Team", "/buyer/team"],
      ...(appt?.leadId ? ([["Kontakt", `/buyer/kontakte/${appt.leadId}`]] as [string, string][]) : []),
      ...(appt ? ([["Terminvorbereitung", `/buyer/termine/${appt.id}/vorbereitung`], ["Präsentation", `/buyer/termine/${appt.id}/praesentation`]] as [string, string][]) : []),
    ];
  });

  afterAll(async () => {
    await b?.close();
    if (v) await aufraeumen(v.customer.id);
  });

  it("alle Seiten: ohne Fehler, ohne seitliches Scrollen", async () => {
    const ctx = await context(b, { mobile: true, token: v.token });
    const probleme: string[] = [];
    for (const [name, path] of seiten) {
      const p = await ctx.newPage();
      const errs: string[] = [];
      p.on("pageerror", (e) => errs.push(String(e.message).slice(0, 200)));
      p.on("console", (m) => {
        // 404 einzelner Ressourcen (z. B. fehlendes Bild) zählt nicht, echte Fehler schon
        if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200));
      });
      const res = await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      await p.waitForTimeout(500);
      const status = res?.status() ?? 0;
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (status >= 400) probleme.push(`${name}: HTTP ${status}`);
      if (overflow > 1) probleme.push(`${name}: ${overflow}px seitlich`);
      for (const e of errs) probleme.push(`${name}: ${e}`);
      await p.close();
    }
    await ctx.close();
    expect(probleme).toEqual([]);
  });
});
