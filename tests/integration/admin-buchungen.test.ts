// Admin → Zahlen → Buchungen gegen eine echte Datenbank: je Quelle eine Zeile, Protokoll-Dubletten
// zu Tabellen fallen weg, die Modul-/Platz-Protokolle tragen den Preis (kein geschätzter Betrag),
// Summen, Filter und CSV. Ohne Stripe (kein STRIPE_SECRET_KEY): Plätze werden zur Aufgabe.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({ sendToAdmins: async () => ({}), sendToUser: async () => ({}), sendToBuyersOfCustomer: async () => ({}) }));

import { prisma } from "@/lib/prisma";
import { setBestandModule, syncSeatBilling } from "@/lib/billing";
import { buchungenCsv, loadBuchungen } from "@/lib/admin-buchungen";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
let customerId = "";
let contactId = "";
let offerId = "";

beforeAll(async () => {
  requireTestDb();
  delete process.env.STRIPE_SECRET_KEY;
  const c = await makeCustomer({ retainerMonthly: 1400, seatsIncluded: 3, seatMonthly: 49 });
  customerId = c.id;
  const contact = await prisma.salesContact.create({ data: { name: c.name, email: `${uid()}@kontakt.test`, customerId } });
  contactId = contact.id;
  const now = new Date();
  const offer = await prisma.offer.create({
    data: {
      number: `PG-T-${uid()}`,
      token: uid() + uid(),
      status: "accepted",
      contactName: "Max Muster",
      company: c.name,
      salesContactId: contactId,
      term: "12m",
      products: [{ name: "Sterbegeld", dailyBudget: 30 }],
      setupFee: 490,
      setupListFee: 990,
      setupDiscount: 500,
      monthlyFee: 1000,
      softwareFee: 349,
      validUntil: now,
      acceptedAt: now,
    },
  });
  offerId = offer.id;
  await prisma.onboarding.create({ data: { customerId, offerId, salesContactId: contactId } });
  await prisma.productBooking.create({
    data: { customerId, catalogKey: "tkv", product: "Katzenversicherung (TKV)", dailyBudget: 20, status: "setup", monthlyBudgetFrom: 900, monthlyBudgetTo: 1500, feeFrom: 1000, feeTo: 1350, setupFee: 0 },
  });
  const ch = await prisma.budgetChange.create({
    data: { customerId, changes: [{ product: "Sterbegeld", from: 30, to: 50 }], effectiveFrom: now, monthlyBudgetFrom: 900, monthlyBudgetTo: 1500, feeFrom: 1000, feeTo: 1000 },
  });
  await prisma.auditLog.create({ data: { action: "budget.change", entity: "BudgetChange", entityId: ch.id, customerId } });
  await prisma.customerPause.create({ data: { customerId, startsAt: new Date(now.getTime() + 3 * 86_400_000), status: "planned" } });
  const pack = await prisma.bestandMessagePack.create({ data: { customerId, messages: 500, amount: 99, expiresAt: new Date(now.getTime() + 90 * 86_400_000) } });
  await prisma.auditLog.create({ data: { action: "bestand.paket", entity: "BestandMessagePack", entityId: pack.id, customerId } });
  await prisma.colleagueReferral.create({
    data: { referrerId: customerId, company: "Neu GmbH", consentAt: now, consentText: "ok", rewardStatus: "credited", rewardAmount: 447, rewardedAt: now },
  });
  await prisma.auditLog.create({ data: { action: "referral.reward", customerId, details: { outcome: "credited", amount: 447 } } });
  // Module über die echte Abrechnung (ohne Stripe): buchen, dann sofort abbestellen
  expect((await setBestandModule(customerId, "book")).ok).toBe(true);
  expect((await setBestandModule(customerId, "cancel")).ok).toBe(true);
  // Plätze: 4 aktive Verkäufer bei 3 inklusive → 1 weiterer (ohne Stripe: Aufgabe „Platz von Hand abrechnen“)
  for (const role of ["owner", "advisor", "advisor", "advisor"] as const) await makeBuyer(customerId, role);
  expect((await syncSeatBilling(customerId, { force: true })).ok).toBe(true);
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { customerId } });
  await prisma.offer.deleteMany({ where: { id: offerId } });
  await prisma.salesContact.deleteMany({ where: { id: contactId } });
  await cleanupCustomer(customerId);
});

describe("Buchungen aus der Datenbank", () => {
  it("je Quelle eine Zeile, keine Doppelungen", async () => {
    const { rows } = await loadBuchungen({ monat: "alle", kunde: customerId });
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const arts = rows.map((r) => `${r.source}/${r.art}`).sort();
    expect(arts).toEqual(
      [
        "audit/modul", // gebucht
        "audit/modul", // abbestellt
        "audit/plaetze",
        "budgetChange/budget",
        "offer/angebot",
        "offer/rabatt",
        "pack/paket",
        "pause/pause",
        "productBooking/produkt",
        "referral/rabatt",
      ].sort(),
    );
  });

  it("Modul abbestellt mit echtem Vorpreis, Platz mit Preis und offener Aufgabe", async () => {
    const { rows } = await loadBuchungen({ monat: "alle", kunde: customerId });
    const mods = rows.filter((r) => r.art === "modul");
    expect(mods.map((r) => r.monthly).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([-149, 149]);
    expect(mods.find((r) => r.monthly === -149)?.detail).not.toContain("geschätzt");
    const seat = rows.find((r) => r.art === "plaetze")!;
    expect(seat.monthly).toBe(49);
    expect(seat.task).toMatchObject({ open: true, href: `/admin/vertrieb/kontakte/${contactId}` });
    const audit = await prisma.auditLog.findFirst({ where: { customerId, action: "billing.seats" } });
    expect((audit?.details as { price?: number }).price).toBe(49);
  });

  it("Summen, Filter und CSV", async () => {
    const { rows, sums, customers } = await loadBuchungen({ kunde: customerId });
    expect(customers.some((c) => c.id === customerId)).toBe(true);
    // dieser Monat: alles gerade angelegt
    expect(rows).toHaveLength(10);
    // Angebot 1.000 + Produkt 350 (geplant) + Budget 0 + Modul +149 −149 + Platz 49
    expect(sums.monthly).toBe(1399);
    // Einrichtung 990 − Rabatt 500 + Paket 99 − Prämie 447
    expect(sums.oneOff).toBe(142);
    // offene Aufgabe (Platz von Hand abrechnen)
    expect(sums.open).toBe(1);
    expect((await loadBuchungen({ kunde: customerId, art: "pause" })).rows).toHaveLength(1);
    expect((await loadBuchungen({ kunde: customerId, monat: "2020-01" })).rows).toHaveLength(0);
    const csv = buchungenCsv(rows);
    expect(csv.split("\r\n")).toHaveLength(11);
  });
});
