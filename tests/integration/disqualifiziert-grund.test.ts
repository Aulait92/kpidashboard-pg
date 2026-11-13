// „Disqualifiziert“ mit Grund (Ole, 13.11.2026): Grund wird gespeichert, steht im Verlauf und
// wird beim Verlassen des Status zurückgesetzt.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ userId: "", customerId: "" }));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getCurrentSession: async () => ({ userId: st.userId, email: "x@example.test", role: "BUYER", customerId: st.customerId }),
}));
vi.mock("@/lib/buyer-context", () => ({
  getBuyerContext: async () => ({ customerId: st.customerId, email: "x@example.test", preview: false, userId: st.userId, teamRole: "owner" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/prisma";
import { setLeadStatusAction } from "@/app/buyer/actions";
import { loadLeadHistory } from "@/lib/lead-history";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

describe("Disqualifiziert mit Grund", () => {
  let customerId = "";
  beforeAll(async () => {
    requireTestDb();
    const c = await makeCustomer();
    customerId = c.id;
    const u = await makeBuyer(c.id, "owner");
    st.userId = u.id;
    st.customerId = c.id;
  });
  afterAll(async () => {
    await cleanupCustomer(customerId);
  });

  it("speichert den Grund, schreibt ihn in den Verlauf und setzt ihn beim Statuswechsel zurück", async () => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Test Lead", status: "Neuer Lead" } });
    expect(await setLeadStatusAction(lead.id, "Disqualifiziert", { disqualifyReason: "falsche_nummer" })).toEqual({ ok: true });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).disqualifyReason).toBe("falsche_nummer");
    const h = await loadLeadHistory(lead.id, null);
    expect(h[0].text).toBe("Status: Disqualifiziert (Falsche Nummer / nicht erreichbar)");
    // Unbekannter Grund wird nicht übernommen
    await setLeadStatusAction(lead.id, "Neuer Lead");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).disqualifyReason).toBeNull();
    await setLeadStatusAction(lead.id, "Disqualifiziert", { disqualifyReason: "quatsch" });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).disqualifyReason).toBeNull();
  });
});
