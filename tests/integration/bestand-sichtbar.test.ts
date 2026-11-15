// Bestandskunden-Modul vorerst für Kunden ausgeblendet (Ole, 15.11.2026): /buyer/bestand leitet ohne Schalter und ohne
// aktives Modul auf Heute um, Anfragen werden abgelehnt, Neuigkeiten zum Modul sind ausgeblendet (nicht gelöscht).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/push", () => ({ sendToAdmins: async () => ({ sent: 0 }), sendToBuyersOfCustomer: async () => ({ sent: 0 }), sendToUser: async () => ({ sent: 0 }) }));
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendCustomerMail: async () => ({ sent: true }) }));
const ctxState = vi.hoisted(() => ({ ctx: null as null | { customerId: string; email: string; preview: boolean; userId: string | null; teamRole: "owner" | "advisor" } }));
vi.mock("@/lib/buyer-context", () => ({ getBuyerContext: async () => ctxState.ctx }));

import { prisma } from "@/lib/prisma";
import BestandPage from "@/app/buyer/bestand/page";
import { requestBestandModuleAction } from "@/app/buyer/bestand/actions";
import { loadBestandVisible } from "@/lib/bestand/sichtbar-server";
import { listUpdatesForCustomer } from "@/lib/neuigkeiten";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const open = async () => BestandPage({ searchParams: Promise.resolve({}) });
const redirectOf = async (p: Promise<unknown>) => p.then(() => null).catch((e: { url?: string }) => e.url ?? null);

describe("Bestandskunden-Modul ausgeblendet", () => {
  const customers: string[] = [];
  const updateIds: string[] = [];
  beforeAll(async () => {
    requireTestDb();
    const now = new Date(Date.now() - 60_000);
    for (const [id, title] of [
      [`upd_test_bestand_${uid()}`, "Bestand: Test-Neuigkeit zum Modul"],
      [`upd_test_allg_${uid()}`, "Allgemeine Test-Neuigkeit"],
    ]) {
      await prisma.productUpdate.create({ data: { id, title, body: "Test", kind: "neu", audience: "alle", publishedAt: now } });
      updateIds.push(id);
    }
  });
  afterAll(async () => {
    await prisma.productUpdate.deleteMany({ where: { id: { in: updateIds } } });
    for (const id of customers) await cleanupCustomer(id);
  });

  async function owner(extra: Record<string, unknown> = {}) {
    const c = await makeCustomer({ plan: "software", ...extra });
    customers.push(c.id);
    const u = await makeBuyer(c.id, "owner");
    ctxState.ctx = { customerId: c.id, email: u.email, preview: false, userId: u.id, teamRole: "owner" };
    return c;
  }

  it("ohne Schalter: Direktaufruf leitet auf Heute, Anfrage abgelehnt, Neuigkeit zum Modul ausgeblendet", async () => {
    const c = await owner();
    expect(await loadBestandVisible(c.id)).toBe(false);
    expect(await redirectOf(open())).toBe("/buyer");
    expect(await requestBestandModuleAction({}, new FormData())).toEqual({ error: "Das Modul ist gerade nicht buchbar." });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).bestandRequestedAt).toBeNull();
    const titles = (await listUpdatesForCustomer(c.id)).map((u) => u.title);
    expect(titles).toContain("Allgemeine Test-Neuigkeit");
    expect(titles).not.toContain("Bestand: Test-Neuigkeit zum Modul");
    // Admin-Vorschau sieht das Modul
    expect(await loadBestandVisible(c.id, { preview: true })).toBe(true);
  });

  it("mit Schalter (Testkunde): Seite und Neuigkeit sichtbar", async () => {
    const c = await owner({ bestandSichtbar: true });
    expect(await loadBestandVisible(c.id)).toBe(true);
    expect(await redirectOf(open())).toBeNull();
    expect((await listUpdatesForCustomer(c.id)).map((u) => u.title)).toContain("Bestand: Test-Neuigkeit zum Modul");
  });

  it("aktives Modul bleibt sichtbar, auch ohne Schalter", async () => {
    const c = await owner({ existingCustomersEnabled: true });
    expect(await loadBestandVisible(c.id)).toBe(true);
  });
});
