// Termine Stufe 2 (Ole, 18.11.2026) mit Datenbank: Push „Wie lief der Termin mit {Name}?“ genau einmal 15 Minuten nach
// Terminende und nur ohne Ergebnis, „Ergebnis fehlt“ ab dem nächsten Morgen auf Mein Tag (statt der Nachfrage-Aufgabe),
// Termine nur als Aufgabe „Termin“ in Verkaufen → Termine, Kennzahlen oben, Ergebnis „Folgetermin“.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const pushes: { title: string; body: string; url?: string; tag?: string }[] = [];
vi.mock("@/lib/push", () => ({ sendToAdmins: async (p: (typeof pushes)[number]) => (pushes.push(p), { sent: 1, removed: 0, errors: [] }) }));

import { prisma } from "@/lib/prisma";
import { loadAdminHeute } from "@/lib/admin-heute";
import { createMeetingReviews, recordMeetingOutcome } from "@/lib/vertrieb/termin-review";
import { ladeErgebnisFehlt, ladeTerminUebersicht } from "@/lib/vertrieb/termine-uebersicht-server";
import { requireTestDb } from "./db";

const MIN = 60_000;
const H = 60 * MIN;
const T = 24 * H;
const uid = Math.random().toString(36).slice(2, 8);
const ids: string[] = [];
const kontakt = async (name: string, extra: Record<string, unknown> = {}) => {
  const c = await prisma.salesContact.create({ data: { name: `${name} ${uid}`, email: `${name.toLowerCase()}-${uid}@test.local`, stage: "TERMIN", ...extra } });
  ids.push(c.id);
  return c;
};
const nachfragen = (contactId: string) => prisma.salesTask.findMany({ where: { contactId, title: { startsWith: "Wie lief der Termin" } } });
const meinePushes = () => pushes.filter((p) => p.title.includes(uid));

describe("Termine Stufe 2", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.offer.deleteMany({ where: { salesContactId: { in: ids } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: ids } } });
  });

  it("Push genau einmal 15 Minuten nach Terminende, mit Name und Sprung zum Ergebnis", async () => {
    const now = new Date();
    const c = await kontakt("Push", { firstName: "Paula", lastName: `Push ${uid}` });
    const m = await prisma.salesMeeting.create({ data: { contactId: c.id, title: "Meta-Leads-Call", startAt: new Date(now.getTime() - 40 * MIN), endAt: new Date(now.getTime() - 10 * MIN) } });

    pushes.length = 0;
    await createMeetingReviews(now);
    expect(meinePushes()).toHaveLength(0);
    expect(await nachfragen(c.id)).toHaveLength(0);

    const spaeter = new Date(now.getTime() + 6 * MIN);
    await createMeetingReviews(spaeter);
    await createMeetingReviews(new Date(spaeter.getTime() + 5 * MIN));
    expect(meinePushes()).toEqual([
      { title: `Wie lief der Termin mit Paula Push ${uid}?`, body: expect.stringContaining("Folgetermin"), url: `/admin/vertrieb/kontakte/${c.id}#ergebnis`, tag: `termin-review:${m.id}` },
    ]);
    const r = await nachfragen(c.id);
    expect(r).toHaveLength(1);
    expect(await prisma.salesMeeting.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ reviewTaskId: r[0].id, reviewCheckedAt: expect.any(Date) });
  });

  it("kein Push und keine Nachfrage, wenn das Ergebnis schon eingetragen ist; abgesagte Termine nie", async () => {
    const now = new Date();
    const c = await kontakt("Erledigt");
    const terminTask = await prisma.salesTask.create({ data: { contactId: c.id, title: "Termin: Erstgespräch", type: "TERMIN", dueAt: new Date(now.getTime() - H) } });
    const m = await prisma.salesMeeting.create({ data: { contactId: c.id, title: "Erstgespräch", startAt: new Date(now.getTime() - H), endAt: new Date(now.getTime() - 30 * MIN), taskId: terminTask.id } });
    await prisma.salesActivity.create({ data: { contactId: c.id, type: "TERMIN", outcome: "Termin gehabt, Angebot geschickt", occurredAt: new Date(now.getTime() - 25 * MIN) } });
    const abgesagt = await kontakt("Abgesagt");
    await prisma.salesMeeting.create({ data: { contactId: abgesagt.id, title: "Erstgespräch", startAt: new Date(now.getTime() - H), status: "ABGESAGT" } });
    // eigene Termin-Aufgabe mit Notiz danach: erledigt, keine Nachfrage
    const hand = await kontakt("Hand");
    const t = await prisma.salesTask.create({ data: { contactId: hand.id, title: "Termin", type: "TERMIN", dueAt: new Date(now.getTime() - 90 * MIN) } });
    await prisma.salesActivity.create({ data: { contactId: hand.id, type: "NOTIZ", note: "Gutes Gespräch, meldet sich", occurredAt: new Date(now.getTime() - 30 * MIN) } });

    pushes.length = 0;
    await createMeetingReviews(now);
    await createMeetingReviews(new Date(now.getTime() + 5 * MIN));
    expect(meinePushes()).toEqual([]);
    expect(await nachfragen(c.id)).toHaveLength(0);
    expect(await nachfragen(abgesagt.id)).toHaveLength(0);
    expect(await nachfragen(hand.id)).toHaveLength(0);
    expect(await prisma.salesMeeting.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ reviewTaskId: null, reviewCheckedAt: expect.any(Date) });
    expect((await prisma.salesTask.findUniqueOrThrow({ where: { id: terminTask.id } })).doneAt).not.toBeNull();
    expect((await prisma.salesTask.findUniqueOrThrow({ where: { id: t.id } })).doneAt).not.toBeNull();
  });

  it("„Ergebnis fehlt“ am nächsten Morgen auf Mein Tag (ersetzt die Nachfrage), weg nach dem Eintragen", async () => {
    const now = new Date();
    const c = await kontakt("Morgen", { firstName: "Moritz", lastName: `Morgen ${uid}` });
    const review = await prisma.salesTask.create({ data: { contactId: c.id, title: `Wie lief der Termin mit Moritz Morgen ${uid}?`, type: "TERMIN", dueAt: new Date(now.getTime() - 29 * H) } });
    const m = await prisma.salesMeeting.create({ data: { contactId: c.id, title: "Entscheidungs-Call", startAt: new Date(now.getTime() - 30 * H), reviewTaskId: review.id, reviewCheckedAt: new Date(now.getTime() - 29 * H) } });

    const fehlt = (await ladeErgebnisFehlt(now)).filter((p) => p.key === `terminergebnis:${m.id}`);
    expect(fehlt).toEqual([
      expect.objectContaining({ title: `Ergebnis fehlt: Moritz Morgen ${uid}`, tone: "bad", action: { label: "Ergebnis eintragen", href: `/admin/vertrieb/kontakte/${c.id}#ergebnis` }, quick: { kind: "termin", taskId: review.id } }),
    ]);
    const heute = await loadAdminHeute(now);
    expect(heute.items.filter((i) => i.key === `terminergebnis:${m.id}`)).toHaveLength(1);
    expect(heute.items.some((i) => i.key === `task:${review.id}`)).toBe(false);

    // Ergebnis „Folgetermin“: Stufe Termin, Aufgabe „Folgetermin buchen“, Punkt verschwindet
    expect(await recordMeetingOutcome(review.id, "termin")).toMatchObject({ ok: true });
    expect(await prisma.salesTask.findFirst({ where: { contactId: c.id, title: "Folgetermin buchen", doneAt: null } })).not.toBeNull();
    expect((await ladeErgebnisFehlt(now)).some((p) => p.key === `terminergebnis:${m.id}`)).toBe(false);
  });

  it("Folgetermin schon gebucht: keine Aufgabe „Folgetermin buchen“", async () => {
    const c = await kontakt("Gebucht");
    await prisma.salesMeeting.create({ data: { contactId: c.id, title: "Entscheidungs-Call", startAt: new Date(Date.now() + 2 * T) } });
    const r = await prisma.salesTask.create({ data: { contactId: c.id, title: "Wie lief der Termin?", type: "TERMIN", dueAt: new Date() } });
    expect(await recordMeetingOutcome(r.id, "termin")).toMatchObject({ ok: true });
    expect(await prisma.salesTask.count({ where: { contactId: c.id, doneAt: null } })).toBe(0);
    expect((await prisma.salesActivity.findFirst({ where: { contactId: c.id } }))?.outcome).toBe("Termin vereinbart");
  });

  it("Termine nur als Aufgabe „Termin“ stehen in der Liste; Aufgaben einer Buchung nicht doppelt; Kennzahlen", async () => {
    const now = new Date();
    const a = await kontakt("Aufgabe", { firstName: "Anna", lastName: `Aufgabe ${uid}` });
    const t = await prisma.salesTask.create({ data: { contactId: a.id, title: "Termin", type: "TERMIN", dueAt: new Date(now.getTime() - 3 * T), doneAt: new Date(now.getTime() - 3 * T + H) } });
    await prisma.salesActivity.create({ data: { contactId: a.id, type: "TERMIN", outcome: "Termin gehabt, Angebot geschickt", occurredAt: new Date(now.getTime() - 3 * T + 2 * H) } });
    const k = await prisma.salesTask.create({ data: { contactId: a.id, title: "Termin mit Anna", type: "TERMIN", dueAt: new Date(now.getTime() + 2 * T) } });
    // Buchung mit eigener verknüpfter Aufgabe: nur einmal in der Liste
    const b = await kontakt("Buchung");
    const bt = await prisma.salesTask.create({ data: { contactId: b.id, title: "Termin: Erstgespräch", type: "TERMIN", dueAt: new Date(now.getTime() - 2 * T) } });
    const bm = await prisma.salesMeeting.create({ data: { contactId: b.id, title: "Erstgespräch", startAt: new Date(now.getTime() - 2 * T), taskId: bt.id } });

    const { zeilen, kennzahlen } = await ladeTerminUebersicht({ ansicht: "30" }, now);
    const meine = zeilen.filter((z) => z.kontakt.id === a.id || z.kontakt.id === b.id);
    expect(meine.map((z) => [z.termin.id, z.artLabel, z.ergebnis.art])).toEqual([
      [bm.id, "Erstgespräch", "fehlt"],
      [t.id, "Termin (Aufgabe)", "eingetragen"],
    ]);
    const kommend = await ladeTerminUebersicht({ ansicht: "kommend" }, now);
    expect(kommend.zeilen.filter((z) => z.kontakt.id === a.id).map((z) => [z.termin.id, z.artLabel])).toEqual([[k.id, "Termin (Aufgabe)"]]);
    expect(kennzahlen.angebot.anzahl).toBeGreaterThanOrEqual(1);
    expect(kennzahlen.woche.anzahl).toBeGreaterThanOrEqual(0);
  });
});
