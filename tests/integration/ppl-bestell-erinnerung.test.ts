// Donnerstags-Erinnerung (Ole, 22.11.2026, lib/ppl/bestell-erinnerung.ts): Mail und Mitteilung an den Zahler (Hauptkunde
// bzw. Kunde selbst), wenn für nächste Woche nichts bestellt ist und keine Verlängerung ansteht; einmal je Woche.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ mails: [] as { to: string | string[]; subject: string; list?: string[] }[], pushes: [] as string[] }));
vi.mock("@/lib/email", () => ({
  getAppUrl: () => "https://app.test",
  sendCustomerMail: async (o: { to: string | string[]; subject: string; list?: string[] }) => {
    sent.mails.push(o);
    return { ok: true };
  },
}));
vi.mock("@/lib/push", () => ({
  sendToUser: async (id: string) => {
    sent.pushes.push(id);
    return { sent: 1, removed: 0, errors: [] };
  },
  sendToAdmins: async () => ({ sent: 0, removed: 0, errors: [] }),
}));

import { prisma } from "@/lib/prisma";
import { weekRange } from "@/lib/ppl/periods";
import { bestellErinnerungen, erinnerungFaellig, offeneBestellungen } from "@/lib/ppl/bestell-erinnerung";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

// Donnerstag, 26.11.2026, 11 Uhr Berlin (10 Uhr UTC)
const DO = new Date("2026-11-26T10:00:00Z");

describe("Donnerstags-Erinnerung für Wochenbestellungen", () => {
  const ids: string[] = [];
  let hauptId = "";
  let ownerId = "";
  let subA = "";
  let subB = "";
  beforeAll(async () => {
    requireTestDb();
    hauptId = (await makeCustomer()).id;
    const p1 = (await makeCustomer({ name: `Partner A ${Date.now()}`, bestelltUeberId: hauptId })).id;
    const p2 = (await makeCustomer({ name: `Partner B ${Date.now()}`, bestelltUeberId: hauptId })).id;
    ids.push(p1, p2, hauptId);
    ownerId = (await makeBuyer(hauptId, "owner")).id;
    await makeBuyer(p1, "owner");
    subA = (await prisma.leadSubscription.create({ data: { customerId: p1, productKey: "PKV-Tarifoptimierung", price: 50, period: "week" } })).id;
    subB = (await prisma.leadSubscription.create({ data: { customerId: p2, productKey: "PKV-Tarifoptimierung", price: 50, period: "week" } })).id;
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { customerId: { in: ids } } });
    for (const id of ids) await cleanupCustomer(id);
  });

  it("nur donnerstags ab 10 Uhr Berliner Zeit", () => {
    expect(erinnerungFaellig(DO)).toBe(true);
    expect(erinnerungFaellig(new Date("2026-11-26T08:30:00Z"))).toBe(false); // 9:30 Berlin
    expect(erinnerungFaellig(new Date("2026-11-27T10:00:00Z"))).toBe(false); // Freitag
  });

  it("Verlängerung am Freitag oder schon bestellt: keine Erinnerung für diesen Bezug", async () => {
    const cur = weekRange(DO);
    const next = weekRange(DO, 1);
    await prisma.leadOrder.create({ data: { subscriptionId: subA, periodStart: cur.start, periodEnd: cur.end, quantity: 10, amount: 500, status: "paid", autoRenew: true } });
    let offen = (await offeneBestellungen(DO)).find((o) => o.zahlerId === hauptId);
    expect(offen?.bezuege.map((b) => b.id)).toEqual([subB]);
    await prisma.leadOrder.create({ data: { subscriptionId: subB, periodStart: next.start, periodEnd: next.end, quantity: 10, amount: 500, status: "processing" } });
    offen = (await offeneBestellungen(DO)).find((o) => o.zahlerId === hauptId);
    expect(offen).toBeUndefined();
    await prisma.leadOrder.deleteMany({ where: { subscriptionId: { in: [subA, subB] } } });
  });

  it("schickt dem Hauptkunden eine Mail mit allen Partnern und eine Mitteilung, einmal je Woche", async () => {
    await bestellErinnerungen(DO);
    const mine = sent.mails.filter((m) => m.list?.some((l) => l.startsWith("Partner A")));
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toContain("nächste Woche");
    expect(mine[0].list).toHaveLength(2);
    expect(mine[0].list?.every((l) => l.endsWith(": PKV-Tarifoptimierung"))).toBe(true);
    expect(sent.pushes).toContain(ownerId);
    const vorher = sent.mails.length;
    await bestellErinnerungen(new Date(DO.getTime() + 3600_000));
    expect(sent.mails.length).toBe(vorher);
  });
});
