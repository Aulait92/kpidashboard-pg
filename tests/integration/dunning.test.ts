import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { currentPause, markPaymentOverdue, markPaymentReceived, runDunningCron } from "@/lib/pause";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const DAY = 24 * 60 * 60 * 1000;

describe("Zahlungsverzug", () => {
  let customerId = "";
  const stripeId = `cus_test_${Math.random().toString(36).slice(2)}`;
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ stripeCustomerId: stripeId })).id;
  });
  afterAll(async () => {
    await prisma.customerPause.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  it("Rechnung offen → Verzug ab diesem Tag, wiederholte Meldung ändert das Datum nicht", async () => {
    const since = new Date(Date.now() - 31 * DAY);
    await markPaymentOverdue(stripeId, since);
    await markPaymentOverdue(stripeId, new Date());
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(c.paymentOverdueSince?.getTime()).toBe(since.getTime());
  });

  it("nach 30 Tagen: Anzeigen-Pause (Zahlungsverzug), zweiter Lauf ändert nichts", async () => {
    await runDunningCron(new Date(), false);
    const p = await currentPause(customerId);
    expect(p?.kind).toBe("dunning");
    expect(p?.status).toBe("active");
    await runDunningCron(new Date(), false);
    expect(await prisma.customerPause.count({ where: { customerId, kind: "dunning" } })).toBe(1);
  });

  it("Zahlung eingegangen → Verzug weg, Pause beendet", async () => {
    await markPaymentReceived(stripeId);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(c.paymentOverdueSince).toBeNull();
    expect(await currentPause(customerId)).toBeNull();
  });
});
