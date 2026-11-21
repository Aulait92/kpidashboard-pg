// Admin liest mit (Ole, 21.11.2026): Push bei Lead, Termin, Abschluss; nie bei Testkunden/Testleads oder abgeschaltet.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ lead: null as unknown }));
const pushes = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/lib/prisma", () => ({ prisma: { lead: { findUnique: async () => db.lead } } }));
vi.mock("@/lib/push", () => ({ sendToAdmins: async (p: unknown) => void pushes.calls.push(p) }));
vi.mock("@/lib/monitoring", () => ({ reportError: () => {} }));

import { adminMitlesen, mitlesenText } from "@/lib/admin-mitlesen";

const lead = (o: Record<string, unknown> = {}, c: Record<string, unknown> = {}) => ({
  isTest: false,
  source: "Privatschutz",
  customerId: "c1",
  customer: { name: "Allianz Henrik Lohmann", isTest: false, adminMitlesen: true, ...c },
  ...o,
});

describe("adminMitlesen", () => {
  beforeEach(() => {
    pushes.calls = [];
  });

  it("Text ohne Allianz-Präfix, Detail oder Standard", () => {
    expect(mitlesenText("lead", "Allianz Henrik Lohmann", "Privatschutz")).toEqual({ title: "🆕 Lead bei Henrik Lohmann", body: "Privatschutz" });
    expect(mitlesenText("abschluss", "Makler Muster", null).body).toBe("Neuer Abschluss");
  });

  it("Push an Admins mit Link in die Kundenakte", async () => {
    db.lead = lead();
    await adminMitlesen({ leadId: "l1", ereignis: "termin", detail: "Mo., 24.11., 10:00 Uhr · Videocall", tagZusatz: "a1" });
    expect(pushes.calls).toEqual([{ title: "📅 Termin bei Henrik Lohmann", body: "Mo., 24.11., 10:00 Uhr · Videocall", url: "/admin/neu/kunden/c1", tag: "mitlesen-termin:a1" }]);
  });

  it("nicht bei Testlead, Testkunde oder abgeschaltet", async () => {
    for (const l of [lead({ isTest: true }), lead({}, { isTest: true }), lead({}, { adminMitlesen: false }), null]) {
      db.lead = l;
      await adminMitlesen({ leadId: "l1", ereignis: "lead" });
    }
    expect(pushes.calls).toEqual([]);
  });
});
