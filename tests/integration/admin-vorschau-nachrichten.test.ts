// Admin in der Vorschau steuert Nachrichten auch bei echten Leads (Ole, 22.11.2026)
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ session: null as null | { role: string; userId: string; email: string; customerId?: string | null }, ctx: null as null | { customerId: string; preview: boolean; demo?: boolean } }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getCurrentSession: vi.fn(async () => st.session) }));
vi.mock("@/lib/buyer-context", async (orig) => ({ ...(await orig<typeof import("@/lib/buyer-context")>()), getBuyerContext: vi.fn(async () => st.ctx) }));

import { prisma } from "@/lib/prisma";
import { adminVorschauCustomerId, writableCustomerId } from "@/lib/buyer-write";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ids: string[] = [];

describe("Admin-Vorschau: Nachrichten steuern", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of ids) {
      await prisma.lead.deleteMany({ where: { customerId: id } });
      await cleanupCustomer(id);
    }
  });

  it("Admin in der Vorschau: echter Lead des Kunden ja, fremder nein; allgemeines Schreiben bleibt gesperrt", async () => {
    const a = await makeCustomer();
    const b = await makeCustomer();
    ids.push(a.id, b.id);
    const eigen = await prisma.lead.create({ data: { customerId: a.id, name: "Echt" } });
    const fremd = await prisma.lead.create({ data: { customerId: b.id, name: "Fremd" } });
    st.session = { role: "ADMIN", userId: "admin", email: "admin@test" };
    st.ctx = { customerId: a.id, preview: true };
    expect(await adminVorschauCustomerId(eigen.id)).toBe(a.id);
    expect(await adminVorschauCustomerId(fremd.id)).toBeNull();
    expect(await writableCustomerId(eigen.id)).toBeNull();
    st.ctx = { customerId: a.id, preview: true, demo: true };
    expect(await adminVorschauCustomerId(eigen.id)).toBeNull();
    st.session = { role: "BUYER", userId: "x", email: "x@test", customerId: a.id };
    st.ctx = { customerId: a.id, preview: true };
    expect(await adminVorschauCustomerId(eigen.id)).toBeNull();
  });
});
