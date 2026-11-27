// Konfetti bei gewonnenem Deal (Ole, 27.11.2026): Der Server meldet „gewonnen“ nur, wenn der Lead mit dieser Aktion neu
// auf „Abschluss“ steht, damit der Toast je Deal einmal feiert und nie beim zweiten Tipp. Dazu der Admin-Push
// „Neuer Kunde: {Name}, {Paket}“ bei der Angebotsannahme (bestehender Push, neuer Titel).
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
vi.mock("@/lib/push", async (orig) => ({ ...(await orig<typeof import("@/lib/push")>()), sendToUser: async () => ({ sent: 0, removed: 0, errors: [] }), sendToAdmins: async () => ({ sent: 0, removed: 0, errors: [] }) }));

import { prisma } from "@/lib/prisma";
import { appointmentOutcomeResult, callbackOutcomeResult } from "@/app/buyer/inbox-actions";
import { setLeadStatusAction } from "@/app/buyer/actions";
import { abschlussEintragenAction } from "@/app/buyer/abschluss-actions";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

describe("Abschluss: gewonnen nur beim ersten Mal", () => {
  let customerId = "";
  let n = 0;
  const lead = (extra: Record<string, unknown> = {}) =>
    prisma.lead.create({ data: { customerId, name: "Lisa Koch", phone: `49151300${String(++n).padStart(4, "0")}`, status: "Im Gespräch", ...extra } });

  beforeAll(async () => {
    requireTestDb();
    const c = await makeCustomer({ retainerMonthly: 990 });
    customerId = c.id;
    const u = await makeBuyer(c.id, "owner");
    st.userId = u.id;
    st.customerId = c.id;
  });
  afterAll(() => cleanupCustomer(customerId));

  it("Anrufergebnis „Abschluss“: gewonnen mit Lead-ID, zweiter Tipp ohne", async () => {
    const l = await lead();
    const r1 = await callbackOutcomeResult(l.id, "won", null);
    expect(r1.ok && r1.gewonnen).toBe(l.id);
    const r2 = await callbackOutcomeResult(l.id, "won", null);
    expect(r2.ok).toBe(true);
    expect(r2.ok && r2.gewonnen).toBeFalsy();
    // Andere Ergebnisse feiern nie
    const l2 = await lead();
    const r3 = await callbackOutcomeResult(l2.id, "offer");
    expect(r3.ok && r3.gewonnen).toBeFalsy();
  });

  it("Termin-Ergebnis „Abschluss“ und Abschluss-Blatt", async () => {
    const l = await lead({ status: "In Beratung" });
    const a = await prisma.appointment.create({ data: { customerId, leadId: l.id, mode: "phone", startsAt: new Date(Date.now() - 2 * 3600_000) } });
    const r = await appointmentOutcomeResult(a.id, "closed", null);
    expect(r.ok && r.gewonnen).toBe(l.id);
    const l2 = await lead();
    const b1 = await abschlussEintragenAction(l2.id);
    expect(b1.ok && b1.gewonnen).toBe(l2.id);
    const b2 = await abschlussEintragenAction(l2.id);
    expect(b2.ok && b2.gewonnen).toBeFalsy();
  });

  it("Phase im Kontakt bzw. in der Pipeline", async () => {
    const l = await lead();
    const r1 = await setLeadStatusAction(l.id, "Abschluss");
    expect(r1).toEqual({ ok: true, gewonnen: true });
    expect(await setLeadStatusAction(l.id, "Abschluss")).toEqual({ ok: true });
    expect(await setLeadStatusAction(l.id, "Im Gespräch")).toEqual({ ok: true });
  });
});
