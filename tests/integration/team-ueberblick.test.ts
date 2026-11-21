import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ladeTeamHeute, ladeTeamUeberblick } from "@/lib/team-ueberblick-server";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const H = 60 * 60 * 1000;

describe("Team-Überblick für den Inhaber (Ole, 21.11.2026)", () => {
  let customerId = "";
  let owner = "";
  let frank = "";
  let lena = "";
  const now = new Date();
  const at = (h: number) => new Date(now.getTime() + h * H);

  beforeAll(async () => {
    requireTestDb();
    const c = await makeCustomer();
    customerId = c.id;
    owner = (await makeBuyer(c.id, "owner")).id;
    frank = (await makeBuyer(c.id, "advisor")).id;
    lena = (await makeBuyer(c.id, "advisor")).id;
    await prisma.user.update({ where: { id: frank }, data: { displayName: "Frank Porthun" } });

    // Frank: Termin morgen im eigenen Kalender (Lead gehört Lena), Termin in 9 Tagen (zählt nicht), abgesagter Termin
    const becker = await prisma.lead.create({ data: { customerId, name: "Lena Becker", status: "Termin vereinbart", assignedUserId: lena } });
    await prisma.appointment.create({ data: { customerId, leadId: becker.id, mode: "video", startsAt: at(20), calendarKey: `user:${frank}` } });
    const spaet = await prisma.lead.create({ data: { customerId, name: "Später", status: "Termin vereinbart", assignedUserId: frank } });
    await prisma.appointment.create({ data: { customerId, leadId: spaet.id, mode: "phone", startsAt: at(24 * 9) } });
    const abgesagt = await prisma.lead.create({ data: { customerId, name: "Abgesagt", status: "Termin vereinbart", assignedUserId: frank } });
    await prisma.appointment.create({ data: { customerId, leadId: abgesagt.id, mode: "phone", startsAt: at(5), status: "cancelled" } });

    // Frank: neuer Lead ohne WhatsApp-Erstanschreiben, seit 3 Std. nicht angerufen
    await prisma.lead.create({ data: { customerId, name: "Neu Arndt", status: "Neuer Lead", phone: "4917612345678", assignedUserId: frank, createdAt: at(-3) } });
    // Frank: drei überfällige Wiedervorlagen
    for (const n of [1, 2, 3]) {
      await prisma.lead.create({ data: { customerId, name: `Wiedervorlage ${n}`, status: "Im Gespräch", assignedUserId: frank, followUpAt: at(-n), followUpNote: "Anrufen" } });
    }
    // Lena: Termin gestern ohne Ergebnis (Kalender der Agentur, Lead gehört Lena)
    const vorbei = await prisma.lead.create({ data: { customerId, name: "Vorbei", status: "Termin vereinbart", assignedUserId: lena } });
    await prisma.appointment.create({ data: { customerId, leadId: vorbei.id, mode: "phone", startsAt: at(-26) } });
    // Nicht zugeteilt: Termin übermorgen beim Inhaber
    const offen = await prisma.lead.create({ data: { customerId, name: "Ohne Berater", status: "Termin vereinbart" } });
    await prisma.appointment.create({ data: { customerId, leadId: offen.id, mode: "phone", startsAt: at(40) } });
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { customerId } });
    await prisma.lead.deleteMany({ where: { customerId } });
    await prisma.user.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  it("Termine der nächsten 7 Tage je Mitglied (Kalender vor Zuständigkeit, abgesagte nicht)", async () => {
    const u = (await ladeTeamUeberblick({ customerId, userId: owner, teamRole: "owner" }, now))!;
    expect(u.get(frank)!.termine.map((t) => t.name)).toEqual(["Lena Becker"]);
    expect(u.get(lena)!.termine).toEqual([]);
    expect(u.get(owner)!.termine.map((t) => t.name)).toEqual(["Ohne Berater"]);
  });

  it("Offenes je Mitglied mit Schwellen", async () => {
    const u = (await ladeTeamUeberblick({ customerId, userId: owner, teamRole: "owner" }, now))!;
    const f = u.get(frank)!;
    expect(f.offen.anruf.map((l) => l.name)).toEqual(["Neu Arndt"]);
    expect(f.offen.wiedervorlage.map((l) => l.name)).toEqual(["Wiedervorlage 3", "Wiedervorlage 2", "Wiedervorlage 1"]);
    // Termin abgesagt, kein neuer: ohne nächsten Schritt (lib/lead-next-step.ts)
    expect(f.offen.ohneSchritt.map((l) => l.name)).toEqual(["Abgesagt"]);
    expect(f.anzahlOffen).toBe(5);
    // Quote 4 von 5 = 80 %: noch nicht gelb
    expect(f.quote).toBeCloseTo(0.8);
    expect(f.warn).toEqual(["anruf", "wiedervorlage"]);
    const l = u.get(lena)!;
    expect(l.offen.ergebnis.map((x) => x.name)).toEqual(["Vorbei"]);
    // „Vorbei“ hat keinen nächsten Schritt, steht aber nur unter „Ergebnis fehlt“
    expect(l.offen.ohneSchritt).toEqual([]);
    expect(l.warn).toContain("ergebnis");
  });

  it("Heute: Zeilen für die anderen, nicht für den Inhaber selbst", async () => {
    const zeilen = await ladeTeamHeute({ customerId, userId: owner, teamRole: "owner" }, now);
    expect(zeilen.map((z) => z.name)).toContain("Frank Porthun");
    expect(zeilen.find((z) => z.userId === frank)!.satz).toBe("1 Lead wartet auf Anruf, 4 weitere offen");
    expect(zeilen.some((z) => z.userId === owner)).toBe(false);
    expect(zeilen.length).toBeLessThanOrEqual(3);
  });

  it("nur für den Inhaber: Berater bekommen nichts", async () => {
    expect(await ladeTeamUeberblick({ customerId, userId: frank, teamRole: "advisor" }, now)).toBeNull();
    expect(await ladeTeamHeute({ customerId, userId: frank, teamRole: "advisor" }, now)).toEqual([]);
  });

  it("ohne Team (eine Person): kein Überblick", async () => {
    const c = await makeCustomer();
    const solo = await makeBuyer(c.id, "owner");
    try {
      expect(await ladeTeamUeberblick({ customerId: c.id, userId: solo.id, teamRole: "owner" })).toBeNull();
    } finally {
      await prisma.user.deleteMany({ where: { customerId: c.id } });
      await cleanupCustomer(c.id);
    }
  });
});
