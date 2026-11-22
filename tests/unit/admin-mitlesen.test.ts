// Admin liest mit (Ole, 21.11.2026): Push bei Lead, Termin, Abschluss; nie bei Testkunden/Testleads oder abgeschaltet.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ lead: null as unknown, pool: null as unknown }));
const pushes = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/lib/prisma", () => ({ prisma: { lead: { findUnique: async () => db.lead }, poolLead: { findFirst: async () => db.pool } } }));
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
    db.pool = null;
  });

  it("Lead über Perspective: kein Push (Mail kommt von Perspective), Termin trotzdem", async () => {
    db.lead = lead();
    db.pool = { via: "perspective" };
    await adminMitlesen({ leadId: "l1", ereignis: "lead" });
    expect(pushes.calls).toEqual([]);
    await adminMitlesen({ leadId: "l1", ereignis: "termin", detail: "x" });
    expect(pushes.calls).toHaveLength(1);
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

describe("Antwort im Chat (Ole, 22.11.2026)", () => {
  beforeEach(() => {
    pushes.calls = [];
    db.pool = null;
  });

  it("Push ohne Nachrichtentext, mit Link in den Chat", async () => {
    db.lead = lead();
    await adminMitlesen({ leadId: "l1", ereignis: "antwort", tagZusatz: "k1", url: "/admin/neu/leads/chats?c=k1" });
    expect(pushes.calls).toEqual([{ title: "💬 Antwort bei Henrik Lohmann", body: "Ein Lead hat im Chat geantwortet", url: "/admin/neu/leads/chats?c=k1", tag: "mitlesen-antwort:k1" }]);
  });

  it("nicht bei abgeschaltetem Mitlesen oder Testlead", async () => {
    db.lead = lead({}, { adminMitlesen: false });
    await adminMitlesen({ leadId: "l1", ereignis: "antwort" });
    db.lead = lead({ isTest: true });
    await adminMitlesen({ leadId: "l1", ereignis: "antwort" });
    expect(pushes.calls).toEqual([]);
  });

  it("Gateway: je Chat höchstens ein Push, solange der Lead weiterschreibt", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/whatsapp/gateway.ts", "utf8");
    expect(src).toContain('ereignis: "antwort"');
    expect(src).toContain("ANTWORT_PAUSE_MS");
  });
});
