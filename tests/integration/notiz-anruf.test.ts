// Ole, 27.11.2026: Notiz „nicht erreicht“ zählt als Anrufversuch, „Rufnummer ungültig“ stoppt den Anrufplan;
// Statuswechsel nach vorn beendet die Plan-Wiedervorlage.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BuyerContext } from "@/lib/buyer-context";

const st: { ctx: BuyerContext | null; session: { role: "BUYER"; customerId: string; userId: string; email: string } | null } = { ctx: null, session: null };
vi.mock("@/lib/buyer-context", () => ({ getBuyerContext: async () => st.ctx }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/usage", () => ({ recordUsage: async () => {} }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: async () => st.session }));

import { prisma } from "@/lib/prisma";
import { addLeadNoteAction } from "@/app/buyer/lead-history-actions";
import { callPlanNote } from "@/lib/call-plan";
import { syncFollowUpWithStatus } from "@/lib/lead-followup";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

describe("Notiz als Anruf-Ergebnis", () => {
  let customerId = "";
  const neu = async (extra: Record<string, unknown> = {}) =>
    (await prisma.lead.create({ data: { customerId, name: "Test Lead", source: "Kfz", phone: "4917612345678", status: "Neuer Lead", ...extra } })).id;
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    const owner = await makeBuyer(customerId, "owner");
    st.ctx = { customerId, email: owner.email, preview: false, userId: owner.id, teamRole: "owner" };
    st.session = { role: "BUYER", customerId, userId: owner.id, email: owner.email };
  });
  afterAll(async () => cleanupCustomer(customerId));

  it("„tel nicht erreicht“ zählt als Versuch und plant den nächsten", async () => {
    const id = await neu();
    const res = await addLeadNoteAction(id, "tel nicht erreicht");
    expect(res.ok && res.hinweis?.art).toBe("nicht_erreicht");
    const l = await prisma.lead.findUnique({ where: { id } });
    expect(l?.callAttempts).toBe(1);
    expect(l?.status).toBe("Nicht erreicht");
    expect(l?.followUpNote).toBe(callPlanNote(2));
  });

  it("„Rufnummer ungültig“ stoppt den Anrufplan und bietet den nächsten Schritt an", async () => {
    const id = await neu({ followUpAt: new Date(), followUpNote: callPlanNote(1), email: "x@example.com" });
    const res = await addLeadNoteAction(id, "Rufnummer ungültig");
    expect(res.ok && res.hinweis).toMatchObject({ art: "falsche_nummer", mail: true });
    const l = await prisma.lead.findUnique({ where: { id } });
    expect(l?.followUpAt).toBeNull();
    expect(l?.callAttempts).toBe(0);
  });

  it("normale Notiz bleibt nur Notiz", async () => {
    const id = await neu();
    const res = await addLeadNoteAction(id, "Partner entscheidet mit");
    expect(res.ok && res.hinweis).toBeUndefined();
    expect((await prisma.lead.findUnique({ where: { id } }))?.callAttempts).toBe(0);
  });

  it("Status nach vorn beendet die Plan-Wiedervorlage, eigene bleibt", async () => {
    const a = await neu({ followUpAt: new Date(), followUpNote: callPlanNote(3) });
    const b = await neu({ followUpAt: new Date(), followUpNote: "Unterlagen anfordern" });
    await syncFollowUpWithStatus(a, "Im Gespräch");
    await syncFollowUpWithStatus(b, "Im Gespräch");
    expect((await prisma.lead.findUnique({ where: { id: a } }))?.followUpNote).toBeNull();
    expect((await prisma.lead.findUnique({ where: { id: b } }))?.followUpNote).toBe("Unterlagen anfordern");
  });
});
