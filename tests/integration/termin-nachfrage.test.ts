import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const pushes: { title: string }[] = [];
vi.mock("@/lib/push", () => ({ sendToAdmins: async (p: { title: string }) => (pushes.push(p), { sent: 1 }) }));

import { prisma } from "@/lib/prisma";
import { createMeetingReviews, recordMeetingOutcome } from "@/lib/vertrieb/termin-review";
import { requireTestDb } from "./db";

// Nach jedem Termin: Aufgabe „Wie lief der Termin?“ (Ole, 13.11.2026)
const tag = Math.random().toString(36).slice(2, 8);
const ids: string[] = [];
const MIN = 60_000;
const contact = async (name: string, stage: "TERMIN" | "GEWONNEN" = "TERMIN") => {
  const c = await prisma.salesContact.create({ data: { name: `${name} ${tag}`, email: `${name.toLowerCase()}-${tag}@example.test`, stage } });
  ids.push(c.id);
  return c;
};
const review = (contactId: string) => prisma.salesTask.findFirst({ where: { contactId, title: { startsWith: "Wie lief der Termin" } } });

describe("Termin-Nachfrage", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.salesContact.deleteMany({ where: { id: { in: ids } } });
  });

  it("Calendly-Termin: nach dem Ende Nachfrage + Push, Termin-Aufgabe erledigt, nur einmal", async () => {
    const now = new Date();
    const c = await contact("Calendly");
    const terminTask = await prisma.salesTask.create({ data: { contactId: c.id, title: "Termin: Erstgespräch", type: "TERMIN", dueAt: new Date(now.getTime() - 60 * MIN) } });
    await prisma.salesMeeting.create({
      data: { contactId: c.id, title: "Erstgespräch", startAt: new Date(now.getTime() - 60 * MIN), endAt: new Date(now.getTime() - 30 * MIN), taskId: terminTask.id, calendlyUri: `uri-${tag}` },
    });
    const laufend = await contact("Laufend");
    await prisma.salesMeeting.create({ data: { contactId: laufend.id, title: "Läuft noch", startAt: new Date(now.getTime() - 10 * MIN), endAt: new Date(now.getTime() + 20 * MIN) } });

    pushes.length = 0;
    await createMeetingReviews(now);
    const r = await review(c.id);
    expect(r?.title).toBe(`Wie lief der Termin mit Calendly ${tag}?`);
    expect((await prisma.salesTask.findUniqueOrThrow({ where: { id: terminTask.id } })).doneAt).not.toBeNull();
    expect(pushes.some((p) => p.title.includes(`Calendly ${tag}`))).toBe(true);
    expect(await review(laufend.id)).toBeNull();

    await createMeetingReviews(now);
    expect(await prisma.salesTask.count({ where: { contactId: c.id, title: { startsWith: "Wie lief der Termin" } } })).toBe(1);
  });

  it("eigene Termin-Aufgabe: 60 Minuten nach Fälligkeit Nachfrage; „Termin vorbereiten“ nicht", async () => {
    const now = new Date();
    const c = await contact("Manuell");
    const t = await prisma.salesTask.create({ data: { contactId: c.id, title: "Termin", type: "TERMIN", dueAt: new Date(now.getTime() - 90 * MIN) } });
    const prep = await prisma.salesTask.create({ data: { contactId: c.id, title: "Termin aus Cold Mail vorbereiten", type: "TERMIN", dueAt: new Date(now.getTime() - 90 * MIN) } });
    await createMeetingReviews(now);
    expect((await prisma.salesTask.findUniqueOrThrow({ where: { id: t.id } })).doneAt).not.toBeNull();
    expect((await prisma.salesTask.findUniqueOrThrow({ where: { id: prep.id } })).doneAt).toBeNull();
    expect(await review(c.id)).not.toBeNull();
  });

  it("Ergebnis „Angebot geschickt“: Verlauf + Nachfass-Aufgabe, Stufe bleibt", async () => {
    const c = await contact("Angebot");
    const r = await prisma.salesTask.create({ data: { contactId: c.id, title: "Wie lief der Termin mit Angebot?", type: "TERMIN", dueAt: new Date() } });
    expect(await recordMeetingOutcome(r.id, "angebot_gesendet")).toMatchObject({ ok: true });
    expect((await prisma.salesTask.findUniqueOrThrow({ where: { id: r.id } })).doneAt).not.toBeNull();
    expect(await prisma.salesTask.findFirst({ where: { contactId: c.id, title: "Nachfassen: Angebot", doneAt: null } })).not.toBeNull();
    expect((await prisma.salesActivity.findFirst({ where: { contactId: c.id, type: "TERMIN" } }))?.outcome).toMatch(/Angebot geschickt/);
    expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } })).stage).toBe("TERMIN");
    // zweimal eintragen geht nicht
    expect(await recordMeetingOutcome(r.id, "gewonnen")).toMatchObject({ ok: false });
  });

  it("Abschluss → Gewonnen; Kein Interesse → Verloren, offene Aufgaben erledigt; Nicht erschienen → neuer Termin", async () => {
    const win = await contact("Win");
    const r1 = await prisma.salesTask.create({ data: { contactId: win.id, title: "Wie lief der Termin?", type: "TERMIN", dueAt: new Date() } });
    await recordMeetingOutcome(r1.id, "gewonnen");
    expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: win.id } })).stage).toBe("GEWONNEN");

    const lost = await contact("Lost");
    await prisma.salesTask.create({ data: { contactId: lost.id, title: "Nochmal anrufen", type: "ANRUF", dueAt: new Date() } });
    const r2 = await prisma.salesTask.create({ data: { contactId: lost.id, title: "Wie lief der Termin?", type: "TERMIN", dueAt: new Date() } });
    await recordMeetingOutcome(r2.id, "verloren");
    const l = await prisma.salesContact.findUniqueOrThrow({ where: { id: lost.id } });
    expect(l.stage).toBe("VERLOREN");
    expect(l.lossReason).toBe("KEIN_INTERESSE");
    expect(await prisma.salesTask.count({ where: { contactId: lost.id, doneAt: null } })).toBe(0);

    const ns = await contact("NoShow");
    const r3 = await prisma.salesTask.create({ data: { contactId: ns.id, title: "Wie lief der Termin?", type: "TERMIN", dueAt: new Date() } });
    await recordMeetingOutcome(r3.id, "nicht_erschienen");
    expect(await prisma.salesTask.findFirst({ where: { contactId: ns.id, title: "Neuen Termin vereinbaren", doneAt: null } })).not.toBeNull();
  });

  it("Gewonnen wird durch „Bedenkzeit“ nicht zurückgestuft", async () => {
    const c = await contact("Kunde", "GEWONNEN");
    const r = await prisma.salesTask.create({ data: { contactId: c.id, title: "Wie lief der Termin?", type: "TERMIN", dueAt: new Date() } });
    await recordMeetingOutcome(r.id, "bedenkzeit");
    expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } })).stage).toBe("GEWONNEN");
  });
});
