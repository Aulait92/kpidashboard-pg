// Show-up-Paket (Ole, 17.11.2026): Komplettcheck = Ja → Termin auf 45 Min. verlängern, wenn der Kalender frei ist,
// sonst Hinweis an den Vermittler. Kalender und Push simuliert.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { komplettcheckVerlaengern } from "@/lib/komplettcheck-dauer";
import { loadErscheinensquote } from "@/lib/erscheinensquote-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const MIN = 60 * 1000;

describe("Show-up: Komplettcheck 45 Minuten, Erscheinensquote", () => {
  let customerId = "";
  const termin = async (extra: Record<string, unknown> = {}) => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Anna Becker", formData: [{ label: "Anrede", value: "Frau" }], source: "Privatschutz" } });
    const start = new Date(Date.now() + 2 * 24 * 60 * MIN);
    return prisma.appointment.create({
      data: { customerId, leadId: lead.id, mode: "video", status: "booked", startsAt: start, endsAt: new Date(start.getTime() + 30 * MIN), calendarEventId: "ev1", ...extra },
    });
  };

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
  });
  afterAll(() => cleanupCustomer(customerId));

  it("Kalender frei: Ereignis und Termin auf 45 Min., einmal", async () => {
    const t = await termin();
    const updateEventEnd = vi.fn(async () => {});
    const getBusy = vi.fn(async () => [{ start: t.startsAt, end: t.endsAt! }]);
    const kalender = async () => ({ getBusy, updateEventEnd });
    expect(await komplettcheckVerlaengern(t.id, { kalender, push: vi.fn() })).toBe("verlaengert");
    expect(updateEventEnd).toHaveBeenCalledWith("ev1", new Date(t.startsAt.getTime() + 45 * MIN));
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.endsAt?.getTime()).toBe(t.startsAt.getTime() + 45 * MIN);
    expect(row.verlaengerung).toBe("verlaengert");
    expect(await komplettcheckVerlaengern(t.id, { kalender })).toBe("nichts");
    expect(updateEventEnd).toHaveBeenCalledTimes(1);
    const h = await prisma.leadHistory.findFirst({ where: { leadId: t.leadId! } });
    expect(h?.text).toContain("auf 45 Minuten verlängert");
  });

  it("Kalender danach belegt bzw. ohne Kalenderereignis: Hinweis an den Vermittler, Termin bleibt", async () => {
    const t = await termin();
    const push = vi.fn(async () => null);
    const kalender = async () => ({
      getBusy: async () => [{ start: new Date(t.endsAt!.getTime()), end: new Date(t.endsAt!.getTime() + 60 * MIN) }],
      updateEventEnd: vi.fn(async () => {}),
    });
    expect(await komplettcheckVerlaengern(t.id, { kalender, push })).toBe("hinweis");
    expect((push.mock.calls[0] as unknown as [unknown, unknown, { title: string; url: string }])[2]).toMatchObject({ title: "Komplettcheck mit Frau Becker", url: `/buyer/termine/${t.id}` });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: t.id } })).endsAt?.getTime()).toBe(t.endsAt!.getTime());
    const ohne = await termin({ calendarEventId: null });
    expect(await komplettcheckVerlaengern(ohne.id, { push })).toBe("hinweis");
    const lang = await termin({ endsAt: null, calendarEventId: "x" });
    await prisma.appointment.update({ where: { id: lang.id }, data: { endsAt: new Date(lang.startsAt.getTime() + 60 * MIN) } });
    expect(await komplettcheckVerlaengern(lang.id, { push })).toBe("schon_lang");
  });

  it("Erscheinensquote je Kunde aus Anwesenheit und Ergebnis", async () => {
    const vorbei = new Date(Date.now() - 2 * 24 * 60 * MIN);
    await termin({ startsAt: vorbei, createdAt: new Date(vorbei.getTime() - 30 * 60 * MIN), attendance: "erschienen" });
    await termin({ startsAt: vorbei, createdAt: new Date(vorbei.getTime() - 30 * 60 * MIN), status: "no_show" });
    const q = await loadErscheinensquote({ customerId, tage: 30 });
    expect(q.gesamt).toMatchObject({ gesamt: 2, quote: 50 });
    expect(q.nachVorlauf.find((z) => z.gruppe === "24 bis 48 h")?.gesamt).toBe(2);
  });
});
