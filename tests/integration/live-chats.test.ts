// Live-Aktualisierung der Chats: der Marker des Kundenbereichs (/api/buyer/updates) sieht nur
// Chats des eigenen Kunden (Berater nur eigene), der Admin-Marker nur mit Admin-Sitzung.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BuyerContext } from "@/lib/buyer-context";

const st = vi.hoisted(() => ({
  ctx: null as BuyerContext | null,
  session: null as { role: string } | null,
}));
vi.mock("@/lib/buyer-context", () => ({ getBuyerContext: async () => st.ctx }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: async () => st.session }));

import { prisma } from "@/lib/prisma";
import { GET as buyerUpdates } from "@/app/api/buyer/updates/route";
import { GET as adminUpdates } from "@/app/api/admin/chats/updates/route";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

let clock = Date.parse("2026-11-16T10:00:00Z");
// Kurzzeit-Puffer in lib/live.ts (1,5 s je Login) umgehen: Uhr zwischen den Abfragen vorstellen.
async function marker(ctx: BuyerContext | null): Promise<{ status: number; v?: string }> {
  st.ctx = ctx;
  clock += 5_000;
  vi.setSystemTime(clock);
  const res = await buyerUpdates();
  return { status: res.status, ...((await res.json()) as { v?: string }) };
}

let msgAt = Date.parse("2030-01-01T09:00:00Z"); // jünger als alles, was andere Tests anlegen
async function message(conversationId: string, direction = "inbound", sentBy: string | null = null) {
  msgAt += 60_000;
  await prisma.message.create({ data: { conversationId, direction, body: "Hallo", sentBy, createdAt: new Date(msgAt) } });
}

describe("Live-Marker der Chats", () => {
  const ids: string[] = [];
  let a = "";
  let b = "";
  let convA = "";
  let convA2 = "";
  let convB = "";
  let advisorId = "";
  let ownerCtx: BuyerContext;
  let advisorCtx: BuyerContext;

  beforeAll(async () => {
    requireTestDb();
    vi.useFakeTimers({ toFake: ["Date"] });
    a = (await makeCustomer()).id;
    b = (await makeCustomer()).id;
    ids.push(a, b);
    const owner = await makeBuyer(a, "owner");
    const advisor = await makeBuyer(a, "advisor");
    advisorId = advisor.id;
    ownerCtx = { customerId: a, email: owner.email, preview: false, userId: owner.id, teamRole: "owner" };
    advisorCtx = { customerId: a, email: advisor.email, preview: false, userId: advisor.id, teamRole: "advisor" };
    convA = (await prisma.conversation.create({ data: { customerId: a, contactPhone: "491700000001", assignedUserId: advisorId } })).id;
    convA2 = (await prisma.conversation.create({ data: { customerId: a, contactPhone: "491700000002" } })).id;
    convB = (await prisma.conversation.create({ data: { customerId: b, contactPhone: "491700000003" } })).id;
    await message(convA);
  });

  afterAll(async () => {
    vi.useRealTimers();
    for (const id of ids) {
      await prisma.conversation.deleteMany({ where: { customerId: id } });
      await prisma.user.deleteMany({ where: { customerId: id } });
      await cleanupCustomer(id);
    }
  });

  it("ohne Anmeldung kein Marker", async () => {
    expect((await marker(null)).status).toBe(401);
  });

  it("Nachrichten eines anderen Kunden ändern den Marker nicht", async () => {
    const before = await marker(ownerCtx);
    expect(before.status).toBe(200);
    expect(before.v).toMatch(/\|m[0-9a-z]+$/);
    await message(convB);
    await message(convB, "outbound", "app");
    await prisma.conversation.update({ where: { id: convB }, data: { needsAttention: true, lastMessageAt: new Date(msgAt) } });
    expect((await marker(ownerCtx)).v).toBe(before.v);
  });

  it("eigene neue Nachricht (auch Echo aus der WhatsApp-App) ändert ihn", async () => {
    const before = await marker(ownerCtx);
    await message(convA2, "outbound", "app");
    expect((await marker(ownerCtx)).v).not.toBe(before.v);
  });

  it("Berater: nur Nachrichten in eigenen Chats zählen", async () => {
    const before = await marker(advisorCtx);
    await message(convA2);
    expect((await marker(advisorCtx)).v).toBe(before.v);
    await message(convA);
    expect((await marker(advisorCtx)).v).not.toBe(before.v);
  });

  it("Admin-Marker nur für Admins, ändert sich bei jeder neuen Nachricht", async () => {
    st.session = { role: "BUYER" };
    expect((await adminUpdates()).status).toBe(403);
    st.session = null;
    expect((await adminUpdates()).status).toBe(403);
    st.session = { role: "ADMIN" };
    const v1 = ((await (await adminUpdates()).json()) as { v: string }).v;
    await message(convB, "outbound", "app");
    const v2 = ((await (await adminUpdates()).json()) as { v: string }).v;
    expect(v2).not.toBe(v1);
  });
});
