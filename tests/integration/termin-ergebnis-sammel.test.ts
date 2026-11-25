// Ole, 25.11.2026: Termine, zu denen der Push „Wie lief der Termin?“ angekommen ist, fallen aus der Sammel-Erinnerung um
// 8 Uhr; kam er nicht an (kein Gerät, Erinnerung aus), bleibt der Termin dort.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sammel = vi.fn<(userId: string, p: unknown) => Promise<{ sent: number; removed: number; errors: string[] }>>(async () => ({ sent: 1, removed: 0, errors: [] }));
vi.mock("@/lib/push", async (orig) => ({ ...(await orig<typeof import("@/lib/push")>()), sendToUser: (userId: string, p: unknown) => sammel(userId, p) }));
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendCustomerMail: async () => ({ ok: true }) }));

import { prisma } from "@/lib/prisma";
import { runTerminErgebnisPush } from "@/lib/termin-ergebnis-push";
import { runNextStepReminders } from "@/lib/next-step-reminder";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const H = 3_600_000;

describe("Sammel-Erinnerung ohne Doppelung", () => {
  const kunden: string[] = [];
  afterAll(async () => {
    for (const id of kunden) await cleanupCustomer(id);
  });
  beforeAll(() => requireTestDb());

  async function fall(zugestellt: number, now: Date) {
    const c = await makeCustomer({ retainerMonthly: 990 });
    kunden.push(c.id);
    const owner = await makeBuyer(c.id, "owner");
    const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Anna Becker", status: "Im Gespräch" } });
    await prisma.appointment.create({ data: { customerId: c.id, leadId: lead.id, mode: "phone", startsAt: new Date(now.getTime() - 19 * H) } });
    await runTerminErgebnisPush(now, { push: async (ids) => (ids?.includes(owner.id) || ids === null ? zugestellt : 0) });
    sammel.mockClear();
    await runNextStepReminders(now);
    return sammel.mock.calls.filter((c) => c[0] === owner.id).map((c) => c[1] as { body: string });
  }

  it("Push angekommen: keine Sammel-Erinnerung für diesen Termin", async () => {
    expect(await fall(1, new Date("2026-11-25T08:00:00Z"))).toEqual([]);
  });

  it("Push nicht angekommen: Termin bleibt in der Sammel-Erinnerung", async () => {
    const r = await fall(0, new Date("2026-11-26T08:00:00Z"));
    expect(r).toHaveLength(1);
    expect(r[0].body).toMatch(/^Bei 1 Termin fehlt das Ergebnis/);
  });
});
