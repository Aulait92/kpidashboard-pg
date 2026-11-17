// Offene Chancen auf Wachstum (Ole, 18.11.2026) gegen die Datenbank: welche Leads zählen, Wert aus dem abgelegten
// Angebot, Standardquoten aus dem Admin (KpiSettings) bzw. eigene Quote ab 10 entschiedenen Fällen.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadOffeneChancen, loadStandardQuoten } from "@/lib/offene-chancen-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const DAY = 86_400_000;
const now = new Date();
let customerId = "";
let vorher: { chanceQuoteAngebot: unknown; chanceQuoteTermin: unknown } | null = null;

describe("loadOffeneChancen", () => {
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    vorher = await prisma.kpiSettings.findUnique({ where: { id: "default" }, select: { chanceQuoteAngebot: true, chanceQuoteTermin: true } });
  });
  afterAll(async () => {
    await cleanupCustomer(customerId);
    if (vorher) await prisma.kpiSettings.update({ where: { id: "default" }, data: vorher as never });
    else await prisma.kpiSettings.delete({ where: { id: "default" } }).catch(() => {});
  });

  it("zählt Angebot, Termin und Wiedervorlage nach Gespräch, nicht nicht erreichte, verlorene oder Testleads", async () => {
    const mk = (data: Record<string, unknown>) => prisma.lead.create({ data: { customerId, source: "Privatschutz", ...data } as never });
    const angebot = await mk({ name: "Angebot", status: "Angebot gesendet", reached: true });
    await prisma.appointment.create({
      data: { customerId, leadId: angebot.id, mode: "video", startsAt: new Date(now.getTime() - 2 * DAY), status: "completed", offersJson: { items: [{ sparte: "Privatschutz", beitragMonat: 50, gewaehlt: true }] } },
    });
    const termin = await mk({ name: "Termin", status: "Termin vereinbart", reached: true });
    await prisma.appointment.create({ data: { customerId, leadId: termin.id, mode: "video", startsAt: new Date(now.getTime() + DAY), status: "booked" } });
    await mk({ name: "Bedenkzeit", status: "In Beratung", reached: true, followUpAt: new Date(now.getTime() + 2 * DAY) });
    await mk({ name: "Nicht erreicht", status: "Nicht erreicht", reached: false, followUpAt: new Date(now.getTime() + DAY) });
    await mk({ name: "Verloren", status: "Kein Interesse", lostAt: now, reached: true, followUpAt: new Date(now.getTime() + DAY) });
    await mk({ name: "Test", status: "Angebot gesendet", isTest: true });

    await prisma.kpiSettings.upsert({ where: { id: "default" }, create: { id: "default", chanceQuoteAngebot: 0.5, chanceQuoteTermin: 0.2 }, update: { chanceQuoteAngebot: 0.5, chanceQuoteTermin: 0.2 } });
    expect(await loadStandardQuoten()).toEqual({ angebot: 0.5, termin: 0.2 });

    const c = await loadOffeneChancen(customerId, undefined, now);
    expect(c.liste.map((x) => x.name).sort()).toEqual(["Angebot", "Bedenkzeit", "Termin"]);
    const a = c.liste.find((x) => x.name === "Angebot")!;
    // 50 € × 12 × 55 % = 330 €, mal Standardquote 50 %
    expect(a).toMatchObject({ provision: 330, erwartet: 165, ausAngebot: true, schaetzung: true });
    expect(c.liste[0].name).toBe("Angebot");
    expect(c).toMatchObject({ angebote: 1, termine: 1, wiedervorlagen: 1, schaetzung: true });
  });

  it("ab 10 entschiedenen Terminen gilt die eigene Quote", async () => {
    for (let i = 0; i < 10; i++) {
      const won = i < 4;
      const l = await prisma.lead.create({
        data: { customerId, source: "Privatschutz", status: won ? "Abschluss" : "Kein Interesse", closedAt: won ? now : null, lostAt: won ? null : now, reached: true, createdAt: new Date(now.getTime() - 30 * DAY) },
      });
      await prisma.appointment.create({ data: { customerId, leadId: l.id, mode: "video", startsAt: new Date(now.getTime() - 25 * DAY), status: "completed" } });
    }
    let c = await loadOffeneChancen(customerId, undefined, now);
    expect(c.quoten.termin).toEqual({ quote: 0.4, eigen: true, faelle: 10 });
    // Verloren nach einem Termin ohne Kalender-Eintrag (nur Status „Termin vereinbart“ im Verlauf): zählt im Nenner mit
    const ohne = await prisma.lead.create({ data: { customerId, source: "Privatschutz", status: "Kein Interesse", lostAt: now, reached: true, createdAt: new Date(now.getTime() - 20 * DAY) } });
    await prisma.leadHistory.create({ data: { leadId: ohne.id, customerId, kind: "status", text: "Status: Termin vereinbart" } });
    c = await loadOffeneChancen(customerId, undefined, now);
    expect(c.quoten.termin).toEqual({ quote: 4 / 11, eigen: true, faelle: 11 });
    expect(c.liste.find((x) => x.name === "Termin")!.schaetzung).toBe(false);
    expect(c.liste.find((x) => x.name === "Angebot")!.schaetzung).toBe(true);
  });
});
