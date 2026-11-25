// Termin ohne Ergebnis (Ole, 25.11.2026): am nächsten Werktag ab 8 Uhr ein Push „Wie lief der Termin mit …?“ an den
// zuständigen Berater, sonst den Inhaber; höchstens einmal je Termin, nicht nachts, nicht bei erfasstem Ergebnis.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { runTerminErgebnisPush } from "@/lib/termin-ergebnis-push";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const H = 3_600_000;
// Mittwoch, 25.11.2026, 9 Uhr Berlin
const NOW = new Date("2026-11-25T08:00:00Z");

describe("Push „Wie lief der Termin?“", () => {
  let kunde = "";
  let ppl = "";
  let inhaber = "";
  let berater = "";
  const push = vi.fn<(userIds: string[] | null, customerId: string, p: { title: string; body: string; url: string; tag: string }) => Promise<unknown>>(async () => null);

  const termin = async (customerId: string, o: { startsAt: Date; assigned?: string | null; status?: string; attendance?: string | null; leadStatus?: string | null }) => {
    const lead = await prisma.lead.create({
      data: { customerId, name: "Anna Becker", formData: [{ label: "Vorname", value: "Anna" }, { label: "Nachname", value: "Becker" }], assignedUserId: o.assigned ?? null, status: o.leadStatus === undefined ? "In Beratung" : o.leadStatus },
    });
    return prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "phone", startsAt: o.startsAt, status: o.status ?? "booked", attendance: o.attendance ?? null } });
  };

  beforeAll(async () => {
    requireTestDb();
    kunde = (await makeCustomer({ plan: "ppl_software" })).id;
    ppl = (await makeCustomer({ plan: "ppl" })).id;
    inhaber = (await makeBuyer(kunde, "owner")).id;
    berater = (await makeBuyer(kunde, "advisor")).id;
  });
  afterAll(async () => {
    await cleanupCustomer(kunde);
    await cleanupCustomer(ppl);
  });

  it("je Termin ohne Ergebnis von gestern ein Push an den Berater bzw. Inhaber, nie doppelt", async () => {
    const zugeteilt = await termin(kunde, { startsAt: new Date(NOW.getTime() - 20 * H), assigned: berater });
    const offen = await termin(kunde, { startsAt: new Date(NOW.getTime() - 22 * H) });
    const heute = await termin(kunde, { startsAt: new Date(NOW.getTime() - 1 * H) });
    const erledigt = await termin(kunde, { startsAt: new Date(NOW.getTime() - 20 * H), status: "completed" });
    const nichtDa = await termin(kunde, { startsAt: new Date(NOW.getTime() - 20 * H), attendance: "nicht_erschienen" });
    const verloren = await termin(kunde, { startsAt: new Date(NOW.getTime() - 20 * H), leadStatus: "Verloren" });
    const alt = await termin(kunde, { startsAt: new Date(NOW.getTime() - 9 * 24 * H) });
    const pplTermin = await termin(ppl, { startsAt: new Date(NOW.getTime() - 20 * H) });

    const r = await runTerminErgebnisPush(NOW, { push });
    expect(r.due).toBe(true);
    const an = new Map(push.mock.calls.map((c) => [String((c[2] as { url: string }).url).split("/").pop(), c]));
    expect(an.get(zugeteilt.id)?.[0]).toEqual([berater]);
    expect(an.get(zugeteilt.id)?.[2]).toEqual({ title: "Wie lief der Termin mit Anna?", body: "Das Ergebnis fehlt noch. Ein Tipp genügt, den Rest trägt die App ein.", url: `/buyer/termine/${zugeteilt.id}`, tag: `termin-ergebnis:${zugeteilt.id}` });
    expect(an.get(offen.id)?.[0]).toEqual([inhaber]);
    for (const t of [heute, erledigt, nichtDa, verloren, alt, pplTermin]) expect(an.has(t.id)).toBe(false);
    expect((await prisma.appointment.findUnique({ where: { id: zugeteilt.id } }))?.ergebnisPushAt).not.toBeNull();

    push.mockClear();
    await runTerminErgebnisPush(new Date(NOW.getTime() + 2 * H), { push });
    expect(push.mock.calls.some((c) => [zugeteilt.id, offen.id].some((id) => String((c[2] as { url: string }).url).endsWith(id)))).toBe(false);
  });

  it("nicht nachts und nicht am Wochenende; ausgeschaltete Erinnerung: kein Push", async () => {
    push.mockClear();
    expect((await runTerminErgebnisPush(new Date("2026-11-25T05:00:00Z"), { push })).due).toBe(false);
    expect((await runTerminErgebnisPush(new Date("2026-11-28T09:00:00Z"), { push })).due).toBe(false);
    await prisma.user.update({ where: { id: berater }, data: { nextStepReminder: false } });
    const t = await termin(kunde, { startsAt: new Date(NOW.getTime() - 19 * H), assigned: berater });
    await runTerminErgebnisPush(NOW, { push });
    expect(push.mock.calls.some((c) => String((c[2] as { url: string }).url).endsWith(t.id))).toBe(false);
    expect((await prisma.appointment.findUnique({ where: { id: t.id } }))?.ergebnisPushAt).not.toBeNull();
  });
});
