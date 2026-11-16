import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { recordReply } from "@/lib/vertrieb/instantly";
import { likelyDuplicates, mergeContacts, removeContactEmail } from "@/lib/vertrieb/contact-merge";
import {
  addContactPhone,
  addDetectedEmail,
  backfillContactData,
  captureFromBooking,
  captureFromLead,
  makePrimaryPhone,
  removeContactPhone,
} from "@/lib/vertrieb/kontaktdaten-server";
import { requireTestDb } from "./db";

// Kontaktdaten automatisch aus Mails und Buchungen übernehmen (Ole, 16.11.2026)
const tag = Math.random().toString(36).slice(2, 8);
const num = () => String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
const ids: string[] = [];
const contact = async (data: { email?: string; phone?: string | null; name?: string } = {}) => {
  const c = await prisma.salesContact.create({
    data: { name: data.name ?? `Kontaktdaten ${tag} ${ids.length}`, email: data.email ?? `kd-${ids.length}-${tag}@agentur-${tag}.test`, phone: data.phone ?? null },
  });
  ids.push(c.id);
  return c;
};
const get = (id: string) => prisma.salesContact.findUniqueOrThrow({ where: { id }, include: { phones: true } });
const notes = (id: string) => prisma.salesActivity.findMany({ where: { contactId: id, outcome: { in: ["Neue Telefonnummer erkannt", "Neue E-Mail-Adresse erkannt"] } } });

describe("Kontaktdaten aus Mails und Buchungen", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.salesContact.deleteMany({ where: { id: { in: ids } } });
  });

  it("Calendly-Buchung mit abweichender E-Mail ergibt eine weitere E-Mail, Hauptwerte bleiben", async () => {
    const tel = num();
    const c = await contact({ phone: `0171 ${tel}` });
    const { recordBooking } = await import("@/lib/vertrieb/calendly");
    const r = await recordBooking(
      { uri: `https://api.calendly.com/kd-${tag}`, email: `Privat-${tag}@gmail.com`, name: "Max Muster", text_reminder_number: `+49 171 ${tel}` },
      { uri: `https://api.calendly.com/kd-ev-${tag}`, name: "Erstgespräch", start_time: "2026-11-25T10:00:00Z" },
    );
    expect(r).toBe("new");
    const after = await get(c.id);
    expect(after.email).toBe(c.email);
    expect(after.phone).toBe(`0171 ${tel}`);
    expect(after.altEmails).toEqual([`privat-${tag}@gmail.com`]);
    expect(after.detectedData).toMatchObject({ emails: { [`privat-${tag}@gmail.com`]: { source: "CALENDLY" } } });
    expect(after.phones).toEqual([]); // gleiche Nummer, andere Schreibweise: keine Doppelanlage
    expect((await notes(c.id)).map((n) => n.outcome)).toEqual(["Neue E-Mail-Adresse erkannt"]);
  });

  it("Signatur mit Mobilnummer ergibt eine weitere Nummer vom Typ Mobil, Hauptnummer bleibt", async () => {
    const mobil = num();
    const c = await contact({ phone: "0421 123456" });
    await recordReply(c.id, {
      subject: `Re: Anfrage ${tag}`,
      text: `Gerne, rufen Sie mich an.\n\nViele Grüße\nMax Muster\nTel.: 0421 123456\nMobil: 0171 ${mobil}\n\nAm 12.11.2026 schrieb Ole:\n> Mobil: 0151 52418846`,
      fromEmail: `max.muster-${tag}@agentur-${tag}.test`,
      isAutoReply: false,
      sentAt: new Date("2026-11-12T09:00:00Z"),
    });
    const after = await get(c.id);
    expect(after.phone).toBe("0421 123456");
    expect(after.phones.map((p) => ({ phone: p.phone, kind: p.kind, source: p.source }))).toEqual([{ phone: `+49171${mobil}`, kind: "MOBIL", source: "MAIL" }]);
    // Absenderadresse ist eine weitere Adresse
    expect(after.altEmails).toEqual([`max.muster-${tag}@agentur-${tag}.test`]);
    const outcomes = (await notes(c.id)).map((n) => n.outcome).sort();
    expect(outcomes).toEqual(["Neue E-Mail-Adresse erkannt", "Neue Telefonnummer erkannt"]);
  });

  it("zitierter Verlauf, Tool-Fußzeilen, eigene und System-Adressen ergeben nichts", async () => {
    const c = await contact({ phone: "0421 777777" });
    await recordReply(c.id, {
      subject: `Re: Termin ${tag}`,
      text: `Passt.\n\n-----Ursprüngliche Nachricht-----\nVon: Dritter <dritter@firma.test>\nMobil: 0172 ${num()}`,
      fromEmail: `ole@performancegrowth.de`,
      isAutoReply: false,
      sentAt: new Date(),
    });
    await recordReply(c.id, {
      subject: `Neuer Termin ${tag}`,
      text: `Termin gebucht.\n\nPowered by Calendly.com\nSupport: +1 415 555 0100`,
      fromEmail: `notifications@calendly.com`,
      isAutoReply: false,
      sentAt: new Date(Date.now() + 3600_000),
    });
    const after = await get(c.id);
    expect(after.phones).toEqual([]);
    expect(after.altEmails).toEqual([]);
    expect(await notes(c.id)).toEqual([]);
  });

  it("keine Doppelanlage bei anderer Schreibweise", async () => {
    const mobil = num();
    const c = await contact({ phone: "0421 222222" });
    expect(await addContactPhone(c.id, `0171 ${mobil}`, { source: "MAIL" })).toBe("added");
    expect(await addContactPhone(c.id, `+49 (0) 171-${mobil}`, { source: "BUCHUNG" })).toBe("known");
    expect(await addContactPhone(c.id, `0049171${mobil}`, { source: "FORMULAR" })).toBe("known");
    expect(await addContactPhone(c.id, "+49 421 222222", { source: "FORMULAR" })).toBe("known");
    expect(await addDetectedEmail(c.id, `Neu-${tag}@Agentur-${tag}.test`, { source: "MAIL" })).toBe("added");
    expect(await addDetectedEmail(c.id, ` neu-${tag}@agentur-${tag}.test `, { source: "BUCHUNG" })).toBe("known");
    expect(await addDetectedEmail(c.id, c.email.toUpperCase(), { source: "BUCHUNG" })).toBe("known");
    const after = await get(c.id);
    expect(after.phones).toHaveLength(1);
    expect(after.altEmails).toEqual([`neu-${tag}@agentur-${tag}.test`]);
  });

  it("fehlt der Hauptwert, wird der erste erkannte Haupt", async () => {
    const c = await contact({ email: `lead-${tag}@ohne-email.invalid` });
    const mobil = num();
    const r = await captureFromLead(c.id, { email: `echt-${tag}@agentur-${tag}.test`, phone: `0171 ${mobil}`, source: "FORMULAR" });
    expect(r).toEqual({ emails: 1, phones: 1 });
    const after = await get(c.id);
    expect(after.email).toBe(`echt-${tag}@agentur-${tag}.test`);
    expect(after.phone).toBe(`0171 ${mobil}`);
    expect(after.phones).toEqual([]);
    // Zweite Nummer ist dann eine weitere Nummer
    await captureFromBooking(c.id, { phone: "+49 421 333333", source: "BUCHUNG", at: new Date("2026-11-14T10:00:00Z") });
    expect((await get(c.id)).phones.map((p) => [p.phone, p.kind, p.source])).toEqual([["+49421333333", "FESTNETZ", "BUCHUNG"]]);
  });

  it("Als Haupt setzen und Entfernen; entfernte Werte kommen nicht wieder", async () => {
    const c = await contact({ phone: "0421 444444" });
    const mobil = num();
    await addContactPhone(c.id, `0171 ${mobil}`, { source: "MAIL" });
    const p = (await get(c.id)).phones[0];
    await makePrimaryPhone(c.id, p.id);
    let after = await get(c.id);
    expect(after.phone).toBe(`+49 171 ${mobil}`);
    expect(after.phones.map((x) => [x.phone, x.source])).toEqual([["+49421444444", "HAUPT"]]);
    await removeContactPhone(c.id, after.phones[0].id);
    expect(await addContactPhone(c.id, "0421 444444", { source: "MAIL" })).toBe("known");
    await addDetectedEmail(c.id, `weg-${tag}@agentur-${tag}.test`, { source: "MAIL" });
    await removeContactEmail(c.id, `weg-${tag}@agentur-${tag}.test`);
    expect(await addDetectedEmail(c.id, `weg-${tag}@agentur-${tag}.test`, { source: "MAIL" })).toBe("known");
    after = await get(c.id);
    expect(after.phones).toEqual([]);
    expect(after.altEmails).toEqual([]);
  });

  it("Treffer gegen einen anderen Kontakt erscheint als Dubletten-Vorschlag", async () => {
    const mobil = num();
    const other = await contact({ phone: `+49 171 ${mobil}`, name: `Andere Agentur ${tag}` });
    const c = await contact({ phone: "0421 555555", name: `Erste Agentur ${tag}` });
    await recordReply(c.id, { subject: `Re: X ${tag}`, text: `Grüße\nMax\nHandy: 0171/${mobil}`, isAutoReply: false, sentAt: new Date() });
    const d = await likelyDuplicates(c.id);
    expect(d.map((x) => x.id)).toEqual([other.id]);
    expect(d[0].reason).toBe("gleiche Telefonnummer");
    // und umgekehrt über die weitere Nummer
    expect((await likelyDuplicates(other.id)).map((x) => x.id)).toContain(c.id);
    // Zusammenführen nimmt weitere Nummern mit, ohne Doppelte
    const r = await mergeContacts(other.id, c.id);
    expect(r.ok).toBe(true);
    ids.splice(ids.indexOf(c.id), 1);
    const merged = await get(other.id);
    expect(merged.phones.map((p) => p.phone).sort()).toEqual(["+49421555555"]);
  });

  it("rückwirkend über Buchungen und Mails: Zählung stimmt, zweiter Lauf ergänzt nichts", async () => {
    const mobil = num();
    const c = await contact({ phone: null });
    await prisma.salesMeeting.create({
      data: { contactId: c.id, title: "Erstgespräch", startAt: new Date(), inviteeEmail: `buchung-${tag}@agentur-${tag}.test`, answers: `Telefonnummer: 0421 ${num()}`, createdAt: new Date("2026-11-10T10:00:00Z") },
    });
    await prisma.salesEmail.create({
      data: { contactId: c.id, direction: "IN", subject: "alt", text: `Danke!\n\nBeste Grüße\nMax\nMobil: 0171 ${mobil}`, fromEmail: `max-${tag}@agentur-${tag}.test`, isAutoReply: false, sentAt: new Date("2026-11-12T10:00:00Z") },
    });
    await prisma.salesEmail.create({
      data: { contactId: c.id, direction: "IN", subject: "Abwesend", text: `Vertretung: Mobil 0172 ${num()}`, fromEmail: `max-${tag}@agentur-${tag}.test`, isAutoReply: true, sentAt: new Date("2026-11-13T10:00:00Z") },
    });
    const first = await backfillContactData({ contactIds: [c.id] });
    expect(first).toEqual({ contacts: 1, emails: 2, phones: 2 });
    const after = await get(c.id);
    // Buchung war zuerst: deren Nummer wird Haupt, die Signatur-Nummer weitere Nummer
    expect(after.phone).toMatch(/^0421 /);
    expect(after.phones.map((p) => [p.phone, p.kind, p.source])).toEqual([[`+49171${mobil}`, "MOBIL", "MAIL"]]);
    expect(after.phones[0].detectedAt.toISOString()).toBe("2026-11-12T10:00:00.000Z");
    expect(after.altEmails.sort()).toEqual([`buchung-${tag}@agentur-${tag}.test`, `max-${tag}@agentur-${tag}.test`]);
    const second = await backfillContactData({ contactIds: [c.id] });
    expect(second).toEqual({ contacts: 1, emails: 0, phones: 0 });
    expect(await notes(c.id)).toHaveLength(4);
  });
});
