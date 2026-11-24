import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const thread = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock("@/lib/vertrieb/instantly", () => ({ threadEmails: async () => thread.items }));

import { prisma } from "@/lib/prisma";
import { eigeneAntwortenAbgleichen, NACHFASSEN_VIDEO } from "@/lib/vertrieb/instantly-eigene-antwort";
import { requireTestDb } from "./db";

// Eigene Antwort in der Instantly-Unibox stellt die Aufgabe auf „Nachfassen: Video angesehen?“ um (Ole, 24.11.2026)
const tag = Math.random().toString(36).slice(2, 8);
let contactId = "";

describe("Instantly: eigene Antwort → Nachfassen", () => {
  beforeAll(async () => {
    requireTestDb();
    const c = await prisma.salesContact.create({ data: { name: `Eigene Antwort ${tag}`, email: `ea-${tag}@agentur.test` } });
    contactId = c.id;
    await prisma.salesEmail.create({
      data: { contactId, direction: "IN", subject: "AW: Kurze Idee", text: "Ja, schicken Sie mir das Video", sentiment: "POSITIV", isAutoReply: false, threadId: `th-${tag}`, sentAt: new Date("2026-11-21T17:05:00Z") },
    });
    await prisma.salesTask.createMany({
      data: [
        { contactId, title: "Auf Cold-Mail-Antwort reagieren", type: "NACHFASSEN", dueAt: new Date("2026-11-22T08:00:00Z") },
        { contactId, title: "Nachfassen nach Instantly", type: "NACHFASSEN", dueAt: new Date("2026-11-26T08:00:00Z") },
      ],
    });
  });
  afterAll(async () => {
    await prisma.salesContact.delete({ where: { id: contactId } }).catch(() => {});
  });

  it("ohne eigene Antwort ändert sich nichts", async () => {
    thread.items = [{ id: `in-${tag}`, ue_type: 2, timestamp_email: "2026-11-21T17:05:00Z", timestamp_created: "2026-11-21T17:05:00Z", subject: "AW", body: null, content_preview: null, thread_id: `th-${tag}` }];
    await eigeneAntwortenAbgleichen(new Date("2026-11-24T10:00:00Z"));
    const offen = await prisma.salesTask.findMany({ where: { contactId, doneAt: null } });
    expect(offen.map((t) => t.title).sort()).toEqual(["Auf Cold-Mail-Antwort reagieren", "Nachfassen nach Instantly"]);
  });

  it("eigene Antwort mit Video: Antwort-Aufgabe erledigt, Nachfassen in 2 Werktagen, nur einmal", async () => {
    thread.items.push({ id: `out-${tag}`, ue_type: 3, timestamp_email: "2026-11-24T09:30:00Z", timestamp_created: "2026-11-24T09:30:00Z", subject: "AW: Kurze Idee", body: { text: "Hier das Video: https://app.performancegrowth.de/praesentation/x" }, content_preview: null, thread_id: `th-${tag}`, eaccount: "ole@pg.test" });
    const now = new Date("2026-11-24T10:00:00Z");
    expect(await eigeneAntwortenAbgleichen(now)).toBe(1);
    const offen = await prisma.salesTask.findMany({ where: { contactId, doneAt: null } });
    expect(offen).toHaveLength(1);
    expect(offen[0]).toMatchObject({ title: NACHFASSEN_VIDEO, type: "NACHFASSEN" });
    expect(offen[0].dueAt.toISOString()).toBe("2026-11-26T08:00:00.000Z");
    expect(await prisma.salesEmail.count({ where: { contactId, direction: "OUT" } })).toBe(1);
    expect(await prisma.salesActivity.count({ where: { contactId, outcome: "Antwort gesendet (Instantly)" } })).toBe(1);
    // Zweiter Lauf: nichts doppelt
    expect(await eigeneAntwortenAbgleichen(now)).toBe(0);
    expect(await prisma.salesTask.count({ where: { contactId, doneAt: null } })).toBe(1);
  });
});
