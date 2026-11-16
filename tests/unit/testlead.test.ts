// Testlead (Ole, 16.11.2026, lib/testlead.ts): Admin → Kunde → Leads → „Testlead schicken“. Reine Regeln:
// Herkunfts-Filter nehmen Testleads überall raus, Eingaben, Logzeilen ohne Nummern, nur Admins dürfen schicken.
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { userId: string; email: string; role: "ADMIN" | "BUYER"; customerId?: string } }));
const created = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: async () => session.current }));
vi.mock("@/lib/testlead", async (orig) => {
  const real = await orig<typeof import("@/lib/testlead")>();
  return {
    ...real,
    createTestLead: async (...a: unknown[]) => {
      created.calls.push(a);
      return { ok: true, leadId: "l1", outreach: "WhatsApp-Erstanschreiben ist raus." };
    },
    deleteTestLead: async (...a: unknown[]) => {
      created.calls.push(a);
      return { ok: true, customerId: "c1" };
    },
  };
});

import { LEAD_ORIGINS, NOT_TEST_LEAD, originWhere, PAID_LEAD_WHERE } from "@/lib/lead-herkunft";
import { checkTestLeadInput, outreachText, testLeadLine, TEST_LEAD_DEFAULT_NAME } from "@/lib/testlead";
import { deleteTestLeadAdminAction, sendTestLeadAction } from "@/app/admin/kunden/[id]/leads/testlead-actions";

describe("Testleads zählen nirgends (Herkunfts-Filter)", () => {
  it("jede Herkunft und die bezahlten Leads schließen Testleads aus", () => {
    expect(NOT_TEST_LEAD).toEqual({ isTest: false });
    for (const o of LEAD_ORIGINS) expect(originWhere(o.key)).toMatchObject({ isTest: false });
    expect(PAID_LEAD_WHERE).toMatchObject({ isTest: false });
  });
});

describe("Eingaben", () => {
  it("normalisiert die Nummer, setzt den Standardnamen und verlangt ein Produkt", () => {
    expect(checkTestLeadInput({ customerId: "c", name: "", product: "PKV Wechsel", phone: "0151 1234 5678" })).toEqual({
      ok: true,
      name: TEST_LEAD_DEFAULT_NAME,
      product: "PKV Wechsel",
      phone: "4915112345678",
    });
    expect(checkTestLeadInput({ customerId: "c", name: "Ole", product: "", phone: "+49 151 12345678" })).toMatchObject({ ok: false });
    expect(checkTestLeadInput({ customerId: "c", name: "Ole", product: "Zahn", phone: "12" })).toMatchObject({ ok: false });
  });

  it("Rückmeldung zum Erstanschreiben", () => {
    expect(outreachText("sent", 0, true)).toMatch(/raus/);
    expect(outreachText(null, 15, true)).toMatch(/15 Min/);
    expect(outreachText(null, 0, false)).toMatch(/Assistent ist bei diesem Kunden aus/);
    expect(outreachText("no_template", 0, true)).toMatch(/24-Stunden-Fenster/);
  });
});

describe("Logzeilen", () => {
  it("Präfix mit Lead-ID, nur übergebene Werte, keine Leerzeichen in Werten", () => {
    expect(testLeadLine("abc", "outreach sent", { mode: "text", waMessageId: "wamid.X", empty: "", none: null })).toBe(
      "[testlead abc] outreach sent mode=text waMessageId=wamid.X",
    );
    expect(testLeadLine("abc", "intake", { product: "PKV Wechsel" })).toBe("[testlead abc] intake product=PKV_Wechsel");
  });
});

describe("nur Admins", () => {
  beforeEach(() => {
    created.calls = [];
  });

  it("ohne Admin-Sitzung wird weder geschickt noch gelöscht", async () => {
    session.current = null;
    expect(await sendTestLeadAction({ customerId: "c1", name: "Test", product: "PKV", phone: "015112345678" })).toEqual({ ok: false, error: "Nur Admins." });
    session.current = { userId: "u1", email: "kunde@test.local", role: "BUYER", customerId: "c1" };
    expect(await sendTestLeadAction({ customerId: "c1", name: "Test", product: "PKV", phone: "015112345678", confirmed: true })).toEqual({ ok: false, error: "Nur Admins." });
    expect(await deleteTestLeadAdminAction("c1", "l1")).toEqual({ ok: false, error: "Nur Admins." });
    expect(created.calls).toHaveLength(0);
  });

  it("Admin darf schicken (Bestätigung wird durchgereicht)", async () => {
    session.current = { userId: "a1", email: "ole@test.local", role: "ADMIN" };
    const r = await sendTestLeadAction({ customerId: "c1", name: "Test", product: "PKV", phone: "015112345678", confirmed: true });
    expect(r).toMatchObject({ ok: true, leadId: "l1" });
    expect(created.calls[0]).toEqual([{ customerId: "c1", name: "Test", product: "PKV", phone: "015112345678", confirmed: true }, { id: "a1", email: "ole@test.local", role: "ADMIN" }]);
  });
});
