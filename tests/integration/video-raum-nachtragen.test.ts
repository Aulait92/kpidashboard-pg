// Video-Link nachtragen (Ole, 21.11.2026)
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mails = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: vi.fn(async (o: { attachments?: { content: string | Buffer }[] }) => {
    mails.push(String(o.attachments?.[0]?.content ?? ""));
    return { ok: true };
  }),
}));

import { prisma } from "@/lib/prisma";
import { videoRaumNachtragen } from "@/lib/video-raum-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ids: string[] = [];
const URL_ = "https://allianz.webex.com/meet/henrik.test";

describe("Video-Link nachtragen", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of ids) {
      await prisma.appointment.deleteMany({ where: { customerId: id } });
      await prisma.agentConfig.deleteMany({ where: { customerId: id } });
      await cleanupCustomer(id);
    }
  });

  it("künftige Videotermine ohne Link bekommen ihn, App-Kalender schickt Aktualisierung; andere bleiben", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    await prisma.agentConfig.create({ data: { customerId: c.id, advisorEmail: "henrik@allianz.test" } });
    const in3 = new Date(Date.now() + 3 * 86400000);
    const ende = new Date(in3.getTime() + 1800000);
    const ohne = await prisma.appointment.create({ data: { customerId: c.id, mode: "video", startsAt: in3, endsAt: ende, status: "booked", calendarEventId: "app:abc@terminbuchung", manageToken: `t${Date.now()}a` } });
    const tel = await prisma.appointment.create({ data: { customerId: c.id, mode: "phone", startsAt: in3, endsAt: ende, status: "booked", manageToken: `t${Date.now()}b` } });
    const vorbei = await prisma.appointment.create({ data: { customerId: c.id, mode: "video", startsAt: new Date(Date.now() - 86400000), status: "booked", manageToken: `t${Date.now()}c` } });
    expect(await videoRaumNachtragen(c.id, URL_)).toBe(1);
    expect((await prisma.appointment.findUnique({ where: { id: ohne.id } }))?.meetUrl).toBe(URL_);
    expect((await prisma.appointment.findUnique({ where: { id: tel.id } }))?.meetUrl).toBeNull();
    expect((await prisma.appointment.findUnique({ where: { id: vorbei.id } }))?.meetUrl).toBeNull();
    expect(mails.some((m) => m.includes("METHOD:REQUEST") && m.replace(/\r\n /g, "").includes(URL_))).toBe(true);
    expect(await videoRaumNachtragen(c.id, URL_)).toBe(0);
  });
});
