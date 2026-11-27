// Ole, 27.11.2026: Admins dürfen in der Vorschau die Zuständigkeit eines Leads ändern; die App-Demo bleibt nur lesend.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BuyerContext } from "@/lib/buyer-context";

const st: { ctx: BuyerContext | null } = { ctx: null };
vi.mock("@/lib/buyer-context", () => ({ getBuyerContext: async () => st.ctx }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/push", () => ({ sendToUser: async () => {} }));

import { prisma } from "@/lib/prisma";
import { reassignLeadAction } from "@/app/buyer/team/actions";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

describe("Zuständigkeit in der Admin-Vorschau", () => {
  let customerId = "";
  let advisorId = "";
  let leadId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    await makeBuyer(customerId, "owner");
    advisorId = (await makeBuyer(customerId, "advisor")).id;
    leadId = (await prisma.lead.create({ data: { customerId, name: "Test Lead", source: "Kfz" } })).id;
  });
  afterAll(async () => {
    await cleanupCustomer(customerId);
  });

  it("Admin-Vorschau darf umverteilen", async () => {
    st.ctx = { customerId, email: "admin@test.local", preview: true, userId: null, teamRole: "owner" };
    expect(await reassignLeadAction(leadId, advisorId)).toEqual({ ok: true });
    expect((await prisma.lead.findUnique({ where: { id: leadId } }))?.assignedUserId).toBe(advisorId);
  });

  it("App-Demo bleibt nur lesend", async () => {
    st.ctx = { customerId, email: "demo@example.com", preview: true, userId: null, teamRole: "owner", demo: true };
    expect((await reassignLeadAction(leadId, null)).ok).toBe(false);
    expect((await prisma.lead.findUnique({ where: { id: leadId } }))?.assignedUserId).toBe(advisorId);
  });
});
