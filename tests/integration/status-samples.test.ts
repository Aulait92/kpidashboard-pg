import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Push an Admins nicht wirklich verschicken
const { sendToAdmins } = vi.hoisted(() => ({
  sendToAdmins: vi.fn<(p: { title: string; body: string }) => Promise<{ sent: number; removed: number; errors: string[] }>>(async () => ({ sent: 0, removed: 0, errors: [] })),
}));
vi.mock("@/lib/push", () => ({ sendToAdmins }));

import { prisma } from "@/lib/prisma";
import { currentStatus, recordStatusSample, statusHistory } from "@/lib/status-server";
import { contactEscalation, loadSupportRequests, offerEscalation } from "@/lib/support-server";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

// Statusseite: Messpunkte aus dem Cron (alle 5 Min., 90 Tage) und Verlauf; Support-Weitergabe.
const DAY = 86_400_000;
const now = new Date("2026-11-11T10:00:00Z");
const ok = { app: "ok", leads: "ok", whatsapp: "ok", calendar: "ok", payments: "ok", jobs: "ok" };

describe("Statusseite: Messpunkte", () => {
  let savedBeats: { key: string; at: Date; ok: boolean; note: string | null }[] = [];

  beforeAll(async () => {
    requireTestDb();
    savedBeats = await prisma.systemHeartbeat.findMany();
    await prisma.systemHeartbeat.deleteMany();
    await prisma.statusSample.deleteMany();
    await prisma.statusIncident.deleteMany();
  });

  afterAll(async () => {
    await prisma.statusSample.deleteMany();
    await prisma.statusIncident.deleteMany();
    await prisma.systemHeartbeat.deleteMany();
    for (const b of savedBeats) await prisma.systemHeartbeat.create({ data: b });
  });

  it("schreibt höchstens einen Messpunkt je 5 Minuten", async () => {
    await prisma.systemHeartbeat.create({ data: { key: "cron", at: now, ok: true } });
    expect((await recordStatusSample(now)).recorded).toBe(true);
    expect((await recordStatusSample(new Date(now.getTime() + 2 * 60000))).recorded).toBe(false);
    expect((await recordStatusSample(new Date(now.getTime() + 5 * 60000))).recorded).toBe(true);
    const rows = await prisma.statusSample.findMany({ orderBy: { at: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject(ok);
  });

  it("hält den Zustand fest (Cron hängt) und löscht Messpunkte älter als 90 Tage", async () => {
    await prisma.statusSample.create({ data: { at: new Date(now.getTime() - 91 * DAY), ...ok } });
    const later = new Date(now.getTime() + 30 * 60000); // Cron seit 30 Min. still
    const r = await recordStatusSample(later);
    expect(r).toEqual({ recorded: true, pruned: 1 });
    const last = await prisma.statusSample.findFirstOrThrow({ orderBy: { at: "desc" } });
    expect(last).toMatchObject({ jobs: "down", whatsapp: "degraded", app: "ok" });
  });

  it("Meldungen aus dem Admin wirken auf den aktuellen Zustand, beendete nicht mehr", async () => {
    await prisma.systemHeartbeat.update({ where: { key: "cron" }, data: { at: now } });
    const inc = await prisma.statusIncident.create({ data: { title: "Zahlungsdienst gestört", level: "down", component: "payments", startsAt: new Date(now.getTime() - 60000) } });
    expect((await currentStatus(now)).payments).toBe("down");
    await prisma.statusIncident.update({ where: { id: inc.id }, data: { resolvedAt: new Date(now.getTime() - 1000) } });
    expect((await currentStatus(now)).payments).toBe("ok");
  });

  it("Verlauf: Tagesbalken und Verfügbarkeit nur aus vorhandenen Messpunkten", async () => {
    await prisma.statusSample.deleteMany();
    // Vorgestern: 10 Messpunkte, davon 3 mit Störung beim WhatsApp-Assistenten
    const d2 = new Date(now.getTime() - 2 * DAY);
    await prisma.statusSample.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({ at: new Date(d2.getTime() + i * 5 * 60000), ...ok, whatsapp: i < 3 ? "down" : "ok" })),
    });
    const h = await statusHistory(now);
    expect(h.since?.getTime()).toBe(d2.getTime());
    expect(h.hasFull30).toBe(false);
    expect(h.components.whatsapp.days).toHaveLength(90);
    const day = d2.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
    expect(h.components.whatsapp.days.find((d) => d.day === day)?.level).toBe("down");
    expect(h.components.app.days.find((d) => d.day === day)?.level).toBe("ok");
    expect(h.components.app.days.at(-1)?.level).toBeNull(); // heute keine Messung
    expect(h.components.whatsapp.uptime30).toBeCloseTo(70, 5);
    expect(h.components.app.uptime30).toBe(100);
  });
});

describe("Hilfe-Chat: Weitergabe an unser Team", () => {
  let customerId = "";
  let userId = "";
  const env = { ...process.env };

  beforeAll(async () => {
    requireTestDb();
    const c = await makeCustomer({ name: "Agentur Weitergabe" });
    customerId = c.id;
    userId = (await makeBuyer(c.id, "owner")).id;
    process.env.SUPPORT_WHATSAPP_NUMBER = "+49 151 0000000";
    delete process.env.SUPPORT_EMAIL;
  });

  afterAll(async () => {
    process.env = env;
    await prisma.usageEvent.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  it("baut den WhatsApp-Link ohne Kontaktdaten und meldet den Kontakt einmal an die Admins", async () => {
    const ctx = { customerId, email: "x@test.local", preview: false, userId, teamRole: "owner" as const };
    const e = await offerEscalation(ctx, { reason: "billing", summary: "Doppelte Abbuchung, Rückruf an 0170 1234567", source: "rule" });
    expect(e.ref).toMatch(/^PG-[A-Z0-9]{6}$/);
    expect(e.mailtoUrl).toBeNull();
    expect(e.whatsappUrl).toMatch(/^https:\/\/wa\.me\/491510000000\?text=/);
    const text = decodeURIComponent(e.whatsappUrl!.split("text=")[1]);
    expect(text).toContain("Agentur Weitergabe");
    expect(text).toContain(e.ref);
    expect(text).not.toContain("1234567");

    expect(await contactEscalation(ctx, e.id, "whatsapp")).toBe(true);
    expect(await contactEscalation(ctx, e.id, "whatsapp")).toBe(true);
    expect(sendToAdmins).toHaveBeenCalledTimes(1);
    const push = sendToAdmins.mock.calls[0][0];
    expect(push.title).toContain(e.ref);
    expect(push.body).not.toContain("1234567");
    const list = await loadSupportRequests(1);
    expect(list.find((r) => r.id === e.id)).toMatchObject({ channel: "whatsapp", customer: "Agentur Weitergabe" });
  });

  it("fremde Kunden können die Anfrage nicht ändern", async () => {
    const ctx = { customerId, email: "x@test.local", preview: false, userId, teamRole: "owner" as const };
    const e = await offerEscalation(ctx, { reason: "bug", summary: "Seite lädt nicht", source: "ai" });
    expect(await contactEscalation({ ...ctx, customerId: "anderer" }, e.id, "team")).toBe(false);
  });
});
