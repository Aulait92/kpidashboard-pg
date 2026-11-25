// Eskalation offene Lead-Antwort (Ole, 25.11.2026): Lead schreibt im Chat (needsAttention), nach 30 Minuten ohne
// menschliche Antwort ein Push an den Inhaber, höchstens einmal je Wartephase, Mo bis Sa 8 bis 20 Uhr, sonst ab 8 Uhr.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pushes: Array<{ to: string; title: string }> = [];
vi.mock("@/lib/push", () => ({
  sendToAdmins: vi.fn(async () => ({ sent: 1, removed: 0, errors: [] })),
  sendToBuyersOfCustomer: vi.fn(async (_c: string, p: { title: string }) => (pushes.push({ to: "buyers", ...p }), { sent: 1, removed: 0, errors: [] })),
  sendToUser: vi.fn(async (u: string, p: { title: string }) => (pushes.push({ to: u, ...p }), { sent: 1, removed: 0, errors: [] })),
}));

import { prisma } from "@/lib/prisma";
import { flagAttention } from "@/lib/whatsapp/attention";
import { runAntwortEskalation } from "@/lib/antwort-eskalation";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const MIN = 60_000;
// Mittwoch, 25.11.2026, 10 Uhr Berlin
const MI = new Date("2026-11-25T09:00:00Z");
let n = 0;

describe("Eskalation offene Lead-Antwort", () => {
  let kunde = "";
  let ppl = "";
  let inhaber = "";
  let berater = "";
  const push = vi.fn<(userIds: string[], p: { title: string; body: string; url: string; tag: string }) => Promise<number>>(async () => 1);

  /** Lead-Chat, in dem der Lead zur Zeit `at` geschrieben hat und der Berater gefragt ist. */
  const wartet = async (customerId: string, at: Date, o: { assigned?: string | null } = {}) => {
    const phone = `4915900${String(++n).padStart(5, "0")}`;
    const lead = await prisma.lead.create({
      data: { customerId, name: "Anna Becker", phone, formData: [{ label: "Vorname", value: "Anna" }, { label: "Nachname", value: "Becker" }], assignedUserId: o.assigned ?? null, status: "Im Gespräch" },
    });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: phone, leadId: lead.id, botActive: false, status: "open", lastMessageAt: at } });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", kind: "text", body: "Hallo?", createdAt: at } });
    await prisma.conversation.update({ where: { id: conv.id }, data: { needsAttention: true, attentionReason: "Neue Nachricht", attentionAt: at, attentionSince: at } });
    return conv;
  };
  const urls = () => push.mock.calls.map((c) => c[1].url);

  beforeAll(async () => {
    requireTestDb();
    kunde = (await makeCustomer({ plan: "ppl_software" })).id;
    ppl = (await makeCustomer({ plan: "ppl" })).id;
    inhaber = (await makeBuyer(kunde, "owner")).id;
    berater = (await makeBuyer(kunde, "advisor")).id;
    await makeBuyer(ppl, "owner");
  });
  afterAll(async () => {
    await cleanupCustomer(kunde);
    await cleanupCustomer(ppl);
  });
  beforeEach(() => {
    push.mockClear();
    pushes.length = 0;
  });

  it("nach 30 Minuten ein Push an den Inhaber, auch wenn ein Berater zuständig ist; nie doppelt je Wartephase", async () => {
    const zugeteilt = await wartet(kunde, new Date(MI.getTime() - 31 * MIN), { assigned: berater });
    const frisch = await wartet(kunde, new Date(MI.getTime() - 10 * MIN));
    const beantwortet = await wartet(kunde, new Date(MI.getTime() - 40 * MIN));
    await prisma.message.create({ data: { conversationId: beantwortet.id, direction: "outbound", kind: "text", body: "Bin gleich da", sentBy: "agent", createdAt: new Date(MI.getTime() - 35 * MIN) } });
    const pplChat = await wartet(ppl, new Date(MI.getTime() - 40 * MIN));

    const r = await runAntwortEskalation(MI, { push });
    expect(r.due).toBe(true);
    const call = push.mock.calls.find((c) => c[1].url.endsWith(zugeteilt.id));
    expect(call?.[0]).toEqual([inhaber]);
    expect(call?.[1]).toEqual({ title: "Anna wartet seit 30 Minuten auf Antwort", body: "Im Chat hat noch niemand geantwortet. Jetzt antworten?", url: `/buyer/chats?c=${zugeteilt.id}`, tag: `antwort-eskalation:${zugeteilt.id}` });
    for (const c of [frisch, beantwortet, pplChat]) expect(urls().some((u) => u.endsWith(c.id))).toBe(false);

    // Weiterer Lauf und neue Nachricht in derselben Wartephase: kein zweiter Push
    push.mockClear();
    await prisma.message.create({ data: { conversationId: zugeteilt.id, direction: "inbound", kind: "text", body: "Noch da?", createdAt: new Date(MI.getTime() + 5 * MIN) } });
    await runAntwortEskalation(new Date(MI.getTime() + 40 * MIN), { push });
    expect(urls().some((u) => u.endsWith(zugeteilt.id))).toBe(false);
    expect(urls().some((u) => u.endsWith(frisch.id))).toBe(true);

    // Neue Wartephase (Berater hat geantwortet, Lead schreibt wieder): wieder genau ein Push
    push.mockClear();
    await prisma.message.create({ data: { conversationId: zugeteilt.id, direction: "outbound", kind: "text", body: "Ja", sentBy: "agent", createdAt: new Date(MI.getTime() + 50 * MIN) } });
    await prisma.conversation.update({ where: { id: zugeteilt.id }, data: { needsAttention: false, attentionAt: null } });
    const t2 = new Date(MI.getTime() + 60 * MIN);
    await prisma.message.create({ data: { conversationId: zugeteilt.id, direction: "inbound", kind: "text", body: "Und?", createdAt: t2 } });
    await prisma.conversation.update({ where: { id: zugeteilt.id }, data: { needsAttention: true, attentionAt: t2, attentionSince: t2 } });
    await runAntwortEskalation(new Date(t2.getTime() + 31 * MIN), { push });
    await runAntwortEskalation(new Date(t2.getTime() + 36 * MIN), { push });
    expect(urls().filter((u) => u.endsWith(zugeteilt.id))).toHaveLength(1);
  });

  it("außerhalb der Zeiten nichts, ab 8 Uhr nachgeholt (Samstag ja, Sonntag nein)", async () => {
    // Dienstagabend 21 Uhr geschrieben
    const abends = await wartet(kunde, new Date("2026-11-24T20:00:00Z"));
    expect((await runAntwortEskalation(new Date("2026-11-24T21:00:00Z"), { push })).due).toBe(false);
    expect((await runAntwortEskalation(new Date("2026-11-25T06:30:00Z"), { push })).due).toBe(false);
    await runAntwortEskalation(new Date("2026-11-25T07:00:00Z"), { push });
    const c = push.mock.calls.find((x) => x[1].url.endsWith(abends.id));
    expect(c?.[1].title).toBe("Anna wartet seit 11 Stunden auf Antwort");
    expect((await runAntwortEskalation(new Date("2026-11-28T09:00:00Z"), { push })).due).toBe(true);
    expect((await runAntwortEskalation(new Date("2026-11-29T09:00:00Z"), { push })).due).toBe(false);
  });

  it("flagAttention: Beginn der Wartephase bleibt bei weiteren Nachrichten stehen", async () => {
    const lead = await prisma.lead.create({ data: { customerId: kunde, name: "Bea Test", phone: "491590099999", status: "Im Gespräch" } });
    const conv = await prisma.conversation.create({ data: { customerId: kunde, contactPhone: "491590099999", leadId: lead.id, botActive: false, status: "open" } });
    await flagAttention(conv.id, "Neue Nachricht: „Hallo“");
    const a = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(a.attentionSince).not.toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    await flagAttention(conv.id, "Neue Nachricht: „Noch da?“");
    const b = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(b.attentionSince?.getTime()).toBe(a.attentionSince?.getTime());
    expect(b.attentionAt!.getTime()).toBeGreaterThan(a.attentionAt!.getTime());
    // Erster Push „braucht dich“ nur einmal (wie bisher)
    expect(pushes.filter((p) => p.title.includes("braucht dich"))).toHaveLength(1);
  });
});
