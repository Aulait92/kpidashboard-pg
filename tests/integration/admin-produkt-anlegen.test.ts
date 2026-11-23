// Admin legt ein Produkt ohne Aufpreis an (Ole, 21.11.2026: KFZ, 40 € Tagesbudget)
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => {}), sendToUser: vi.fn(async () => {}), sendToBuyersOfCustomer: vi.fn(async () => {}) }));

import { prisma } from "@/lib/prisma";
import { adminProduktAnlegen, startProduct } from "@/lib/produkt-buchen";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ids: string[] = [];

describe("Admin: Produkt ohne Aufpreis anlegen", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of ids) {
      await prisma.customerBudget.deleteMany({ where: { customerId: id } });
      await prisma.productBooking.deleteMany({ where: { customerId: id } });
      await cleanupCustomer(id);
    }
  });

  it("legt KFZ in Einrichtung an; Gestartet erzeugt Budgetzeile, Monatspreis bleibt", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    const before = await prisma.customer.findUnique({ where: { id: c.id }, select: { retainerMonthly: true } });
    const r = await adminProduktAnlegen({ customerId: c.id, product: "KFZ", dailyBudget: 40 });
    expect(r.ok).toBe(true);
    const b = await prisma.productBooking.findFirstOrThrow({ where: { customerId: c.id, product: "KFZ" } });
    expect(b).toMatchObject({ status: "setup", feeStatus: "none", setupStatus: "none", catalogKey: "admin" });
    expect(Number(b.setupFee)).toBe(0);
    expect((await adminProduktAnlegen({ customerId: c.id, product: "KFZ", dailyBudget: 40 })).ok).toBe(false);
    expect((await startProduct(b.id)).ok).toBe(true);
    const line = await prisma.customerBudget.findFirstOrThrow({ where: { customerId: c.id, product: "KFZ" } });
    expect(Number(line.dailyBudget)).toBe(40);
    const after = await prisma.customer.findUnique({ where: { id: c.id }, select: { retainerMonthly: true } });
    expect(String(after?.retainerMonthly)).toBe(String(before?.retainerMonthly));
  });
});
