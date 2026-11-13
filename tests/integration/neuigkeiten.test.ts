// Neuigkeiten im Kundenbereich: Zielgruppe, Entwürfe, ungelesen/gelesen, Push nur mit Häkchen.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pushState = vi.hoisted(() => ({ calls: [] as { customerId: string; title: string }[] }));
vi.mock("@/lib/push", () => ({
  sendToBuyersOfCustomer: async (customerId: string, payload: { title: string }) => {
    pushState.calls.push({ customerId, title: payload.title });
    return { sent: 1, removed: 0, errors: [] };
  },
}));

import { prisma } from "@/lib/prisma";
import { listUpdatesForCustomer, markUpdatesSeen, saveUpdate, unreadUpdateCount, unreadUpdates } from "@/lib/neuigkeiten";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const T0 = new Date("2026-11-20T10:00:00Z");

describe("Neuigkeiten", () => {
  const customers: string[] = [];
  const updates: string[] = [];
  let software = "";
  let service = "";
  let ownerId = "";
  let advisorId = "";
  let serviceUserId = "";

  beforeAll(async () => {
    requireTestDb();
    const a = await makeCustomer({ plan: "software" });
    const b = await makeCustomer({ plan: "service" });
    software = a.id;
    service = b.id;
    customers.push(a.id, b.id);
    ownerId = (await makeBuyer(a.id, "owner")).id;
    advisorId = (await makeBuyer(a.id, "advisor")).id;
    serviceUserId = (await makeBuyer(b.id, "owner")).id;
    // Logins existieren schon länger: Ausgangspunkt „alles bis T0 gelesen“
    await prisma.user.updateMany({ where: { id: { in: [ownerId, advisorId, serviceUserId] } }, data: { updatesSeenAt: T0 } });
    // Starteinträge aus der Migration nicht mitzählen: nur Einträge nach T0 sind neu
    const mk = (title: string, audience: string, publishedAt: Date | null) =>
      prisma.productUpdate.create({ data: { title: `${title} ${tag}`, body: "Ein kurzer Text für Kunden.", audience, publishedAt } }).then((u) => (updates.push(u.id), u));
    await mk("Für alle", "alle", new Date(T0.getTime() + 60_000));
    await mk("Nur Software", "software", new Date(T0.getTime() + 120_000));
    await mk("Nur Betreuung", "betreuung", new Date(T0.getTime() + 180_000));
    await mk("Entwurf", "alle", null);
  });
  beforeEach(() => {
    pushState.calls = [];
  });
  afterAll(async () => {
    await prisma.productUpdate.deleteMany({ where: { OR: [{ id: { in: updates } }, { title: { contains: tag } }] } });
    for (const id of customers) await cleanupCustomer(id);
  });

  const now = new Date(T0.getTime() + 3_600_000);
  const mine = (list: { title: string }[]) => list.map((u) => u.title).filter((t) => t.endsWith(tag));

  it("filtert nach Paket und blendet Entwürfe aus", async () => {
    expect(mine(await listUpdatesForCustomer(software, now))).toEqual([`Nur Software ${tag}`, `Für alle ${tag}`]);
    expect(mine(await listUpdatesForCustomer(service, now))).toEqual([`Nur Betreuung ${tag}`, `Für alle ${tag}`]);
  });

  it("zählt Ungelesenes je Login und setzt es nach dem Öffnen auf 0", async () => {
    expect(await unreadUpdateCount(ownerId, software, now)).toBe(2);
    expect(await unreadUpdateCount(advisorId, software, now)).toBe(2);
    expect(await unreadUpdateCount(serviceUserId, service, now)).toBe(2);
    expect(mine(await unreadUpdates(serviceUserId, service, now))).not.toContain(`Nur Software ${tag}`);
    await markUpdatesSeen(ownerId, now);
    expect(await unreadUpdateCount(ownerId, software, now)).toBe(0);
    // Berater bleibt ungelesen (je Login)
    expect(await unreadUpdateCount(advisorId, software, now)).toBe(2);
  });

  it("Push nur mit Häkchen und nur einmal je Eintrag", async () => {
    // Ein Login mit Push beim Software-Kunden
    const sub = await prisma.pushSubscription.create({ data: { endpoint: `https://push.test/${tag}`, p256dh: "x", auth: "y", userId: ownerId } });
    try {
      const ohne = await saveUpdate({ title: `Ohne Push ${tag}`, body: "Ein kurzer Text für Kunden.", kind: "neu", audience: "software", publish: true, push: false });
      expect(ohne).toMatchObject({ ok: true, pushed: 0 });
      expect(pushState.calls).toHaveLength(0);

      const entwurf = await saveUpdate({ title: `Entwurf Push ${tag}`, body: "Ein kurzer Text für Kunden.", kind: "neu", audience: "alle", publish: false, push: true });
      expect(entwurf).toMatchObject({ ok: true, pushed: 0 });
      expect(pushState.calls).toHaveLength(0);

      const mit = await saveUpdate({ title: `Mit Push ${tag}`, body: "Ein kurzer Text für Kunden.", kind: "neu", audience: "software", publish: true, push: true });
      expect(mit.ok).toBe(true);
      expect(pushState.calls.map((c) => c.customerId)).toContain(software);
      expect(pushState.calls.map((c) => c.customerId)).not.toContain(service);
      const before = pushState.calls.length;
      // erneut speichern mit Häkchen → kein zweiter Push
      if (mit.ok) await saveUpdate({ id: mit.id, title: `Mit Push ${tag}`, body: "Ein kurzer Text für Kunden.", kind: "verbessert", audience: "software", publish: true, push: true });
      expect(pushState.calls.length).toBe(before);
    } finally {
      await prisma.pushSubscription.delete({ where: { id: sub.id } });
    }
  });
});
