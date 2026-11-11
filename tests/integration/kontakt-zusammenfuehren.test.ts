import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { addContactEmail, findContactIdByEmail, likelyDuplicates, mergeContacts } from "@/lib/vertrieb/contact-merge";
import { requireTestDb } from "./db";

// Dubletten zusammenführen (z. B. Calendly mit anderer E-Mail) und weitere E-Mail-Adressen.
const uid = () => Math.random().toString(36).slice(2, 8);

describe("Vertriebskontakte zusammenführen", () => {
  const ids: string[] = [];
  const offerIds: string[] = [];
  const campaignIds: string[] = [];
  const tag = uid();
  let keep = "";
  let drop = "";

  beforeAll(async () => {
    requireTestDb();
    const k = await prisma.salesContact.create({
      data: { name: `Agentur Schmidt ${tag}`, email: `jens-${tag}@agentur.test`, firstName: "Jens", lastName: `Schmidt${tag}`, stage: "INTERESSE", callAttempts: 2 },
    });
    const d = await prisma.salesContact.create({
      data: { name: `Jens Schmidt${tag} Allianz`, email: `jens.schmidt-${tag}@allianz.test`, firstName: "Jens", lastName: `Schmidt${tag}`, phone: "+49 170 1", stage: "TERMIN", callAttempts: 1, altEmails: [`privat-${tag}@mail.test`] },
    });
    keep = k.id;
    drop = d.id;
    ids.push(keep, drop);
    await prisma.salesMeeting.create({ data: { contactId: drop, title: "Erstgespräch", startAt: new Date("2026-11-12T10:00:00Z") } });
    await prisma.salesTask.create({ data: { contactId: drop, title: "Nachfassen", dueAt: new Date("2026-11-13T09:00:00Z") } });
    await prisma.salesActivity.create({ data: { contactId: drop, type: "ANRUF" } });
    const c1 = await prisma.salesCampaign.create({ data: { name: `K1 ${tag}` } });
    const c2 = await prisma.salesCampaign.create({ data: { name: `K2 ${tag}` } });
    campaignIds.push(c1.id, c2.id);
    await prisma.salesCampaignLead.create({ data: { contactId: keep, campaignId: c1.id } });
    await prisma.salesCampaignLead.create({ data: { contactId: drop, campaignId: c1.id } });
    await prisma.salesCampaignLead.create({ data: { contactId: drop, campaignId: c2.id } });
    const n = uid();
    const o = await prisma.offer.create({
      data: { number: `ZF-${n}`, token: `zf-${n}`, contactName: "Jens", term: "12m", products: [], setupFee: 0, monthlyFee: 600, softwareFee: 0, validUntil: new Date("2026-12-31"), salesContactId: drop, status: "sent" },
    });
    offerIds.push(o.id);
  });

  afterAll(async () => {
    await prisma.offer.deleteMany({ where: { id: { in: offerIds } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: ids } } });
    await prisma.salesCampaign.deleteMany({ where: { id: { in: campaignIds } } });
  });

  it("schlägt den Kontakt mit gleichem Vor- und Nachnamen als Dublette vor", async () => {
    expect((await likelyDuplicates(keep)).map((x) => x.id)).toContain(drop);
  });

  it("führt alles in den ersten Kontakt zusammen und löscht den zweiten", async () => {
    const r = await mergeContacts(keep, drop, "test");
    expect(r.ok).toBe(true);
    expect(await prisma.salesContact.findUnique({ where: { id: drop } })).toBeNull();
    const c = await prisma.salesContact.findUniqueOrThrow({
      where: { id: keep },
      include: { meetings: true, tasks: true, activities: true, offers: true, campaigns: true },
    });
    expect(c.meetings).toHaveLength(1);
    expect(c.tasks).toHaveLength(1);
    expect(c.offers.map((o) => o.id)).toEqual(offerIds);
    expect(c.campaigns.map((x) => x.campaignId).sort()).toEqual([...campaignIds].sort());
    expect(c.activities.some((a) => a.type === "NOTIZ" && a.note?.includes("Zusammengeführt"))).toBe(true);
    expect(c.phone).toBe("+49 170 1"); // leeres Feld ergänzt
    expect(c.stage).toBe("TERMIN"); // weiter fortgeschrittene Phase
    expect(c.callAttempts).toBe(3);
    expect(c.email).toBe(`jens-${tag}@agentur.test`);
    expect(c.altEmails.sort()).toEqual([`jens.schmidt-${tag}@allianz.test`, `privat-${tag}@mail.test`].sort());
  });

  it("findet den Kontakt danach auch über die weiteren E-Mail-Adressen", async () => {
    expect(await findContactIdByEmail(`Jens.Schmidt-${tag}@Allianz.test`)).toBe(keep);
    expect(await findContactIdByEmail(`privat-${tag}@mail.test`)).toBe(keep);
  });

  it("weitere E-Mail: gültig, nicht doppelt, nicht von einem anderen Kontakt", async () => {
    expect(await addContactEmail(keep, "kein-mail")).toMatchObject({ ok: false });
    const other = await prisma.salesContact.create({ data: { name: `Andere ${tag}`, email: `andere-${tag}@x.test` } });
    ids.push(other.id);
    expect(await addContactEmail(keep, `andere-${tag}@x.test`)).toMatchObject({ ok: false });
    expect(await addContactEmail(keep, ` NEU-${tag}@x.test `)).toEqual({ ok: true });
    expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: keep } })).altEmails).toContain(`neu-${tag}@x.test`);
  });

  it("lehnt Zusammenführen mit sich selbst ab", async () => {
    expect(await mergeContacts(keep, keep)).toMatchObject({ ok: false });
  });
});
