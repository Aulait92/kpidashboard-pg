import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { addContactEmail, findContactIdByEmail, likelyDuplicates, mergeContacts, searchMergeCandidates } from "@/lib/vertrieb/contact-merge";
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

// Fall „Christian“ (Calendly, nur Vorname) ↔ „Christian Patzwald“: Dubletten über Telefon/E-Mail, nicht über den Vornamen.
describe("Vertrieb: Dubletten bei reinem Vornamen", () => {
  const tag = uid();
  // eindeutige Nummer je Testlauf: 0171 <7 Ziffern>
  const digits = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
  const ids: string[] = [];
  let patzwald = "";
  let christian = "";

  beforeAll(async () => {
    requireTestDb();
    const p = await prisma.salesContact.create({
      data: {
        name: `Allianz Versicherung Christian Patzwald${tag} Generalvertretung`,
        email: `christian.patzwald${tag}@allianz.de`,
        firstName: "Christian",
        lastName: `Patzwald${tag}`,
        phone: `0171 ${digits.slice(0, 3)} ${digits.slice(3)}`,
      },
    });
    patzwald = p.id;
    ids.push(p.id);
    // Viele Agenturen mit „Christian“ im Namen
    for (const n of ["Aigner", "Andreas", "Anzer", "Arndt", "Bach"]) {
      const c = await prisma.salesContact.create({
        data: { name: `Allianz Versicherung Christian ${n}${tag} Generalvertretung`, email: `christian.${n.toLowerCase()}${tag}@allianz.de`, firstName: "Christian", lastName: `${n}${tag}` },
      });
      ids.push(c.id);
    }
  });

  afterAll(async () => {
    await prisma.salesContact.deleteMany({ where: { id: { in: ids } } });
  });

  it("Calendly-Buchung nur mit Vornamen: Zuordnung über die Telefonnummer, kein neuer Kontakt", async () => {
    const { recordBooking } = await import("@/lib/vertrieb/calendly");
    const { Matcher } = await import("@/lib/vertrieb/linkedin");
    const r = await recordBooking(
      {
        uri: `https://api.calendly.com/inv-${tag}`,
        email: `cp${tag}@gmail.com`,
        name: "Christian",
        questions_and_answers: [{ question: "Telefonnummer", answer: `+49 171 ${digits}` }],
      },
      { uri: `https://api.calendly.com/ev-${tag}`, name: "Erstgespräch", start_time: "2026-11-20T10:00:00Z" },
      await Matcher.load(),
    );
    expect(r).toBe("new");
    const m = await prisma.salesMeeting.findUniqueOrThrow({ where: { calendlyUri: `https://api.calendly.com/inv-${tag}` } });
    expect(m.contactId).toBe(patzwald);
    expect(await prisma.salesContact.count({ where: { email: `cp${tag}@gmail.com` } })).toBe(0);
  });

  it("schon angelegter Kontakt „Christian“: Hinweis zeigt Patzwald über die Telefonnummer, keine Vornamen-Treffer", async () => {
    const c = await prisma.salesContact.create({ data: { name: "Christian", firstName: "Christian", email: `christian${tag}@gmail.com`, phone: `+49171${digits}`, stage: "TERMIN" } });
    christian = c.id;
    ids.push(c.id);
    const d = await likelyDuplicates(christian);
    expect(d.map((x) => x.id)).toEqual([patzwald]);
    expect(d[0].reason).toBe("gleiche Telefonnummer");
    // und umgekehrt
    expect((await likelyDuplicates(patzwald)).map((x) => x.id)).toEqual([christian]);
  });

  it("Telefon nur in den Buchungsantworten; reiner Vorname ohne Merkmal: kein Vorschlag", async () => {
    const c = await prisma.salesContact.create({ data: { name: "Christian", firstName: "Christian", email: `c2-${tag}@web.de` } });
    ids.push(c.id);
    await prisma.salesMeeting.create({ data: { contactId: c.id, title: "Erstgespräch", startAt: new Date(), answers: `Telefonnummer: 0171/${digits}`, inviteeEmail: `c2-${tag}@web.de` } });
    const d = await likelyDuplicates(c.id);
    expect(d[0]?.id).toBe(patzwald);
    expect(d.length).toBeLessThanOrEqual(3);
    const solo = await prisma.salesContact.create({ data: { name: "Christian", firstName: "Christian", email: `solo-${tag}@gmail.com` } });
    ids.push(solo.id);
    expect(await likelyDuplicates(solo.id)).toEqual([]);
  });

  it("Suche „Zusammenführen“ findet über Vor- und Nachname, Nachname, Telefon (andere Schreibweise) und weitere E-Mail", async () => {
    const found = async (q: string) => (await searchMergeCandidates(christian, q)).map((x) => x.id);
    expect(await found(`Christian Patzwald${tag}`)).toEqual([patzwald]);
    expect(await found(`Patzwald${tag}`)).toEqual([patzwald]);
    expect(await found(`+49 171 ${digits}`)).toContain(patzwald);
    await prisma.salesContact.update({ where: { id: patzwald }, data: { altEmails: [`buero-${tag}@patzwald.test`] } });
    expect(await found(`buero-${tag}@patzwald`)).toEqual([patzwald]);
  });
});
