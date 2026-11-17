import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { phoneDigitsKey, phoneQuery } from "@/lib/telefonsuche";
import { adoptFoundPhone, indexMailPhones, indexPendingMailPhones, searchPhonesAdmin } from "@/lib/telefonsuche-server";
import { recordReply } from "@/lib/vertrieb/instantly";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

// Telefonsuche (Ole, 16.11.2026): Ziffern-Spalten per Trigger, Admin-Suche über alle Nummernfelder und Mail-Signaturen.
const tag = Math.random().toString(36).slice(2, 8);
// Zufällige 8-stellige Rufnummer je Test, damit fremde Testdaten nicht stören
// Achtstellig; die letzten fünf Ziffern beginnen nie mit 0 (Suche nach „00…“ wäre eine Auslandsvorwahl → zufällig rot)
const rnd = () => String(Math.floor(Math.random() * 900) + 100) + String(Math.floor(Math.random() * 90_000) + 10_000);
const contactIds: string[] = [];
const customerIds: string[] = [];

const contact = async (data: { phone?: string | null; name?: string; customerId?: string } = {}) => {
  const c = await prisma.salesContact.create({
    data: { name: data.name ?? `Telefonsuche ${tag} ${contactIds.length}`, email: `ts-${contactIds.length}-${tag}@agentur-${tag}.test`, phone: data.phone ?? null, customerId: data.customerId },
  });
  contactIds.push(c.id);
  return c;
};
const search = async (q: string) => {
  const pq = phoneQuery(q);
  if (!pq) throw new Error(`keine Telefonsuche: ${q}`);
  return searchPhonesAdmin(pq);
};
const keys = async (q: string) => (await search(q)).map((h) => `${h.kind}:${h.id}`).sort();
const mail = (contactId: string, text: string, extra: { isAutoReply?: boolean; direction?: string } = {}) =>
  prisma.salesEmail.create({ data: { contactId, text, direction: extra.direction ?? "IN", isAutoReply: extra.isAutoReply ?? false, sentAt: new Date("2026-11-12T09:00:00Z"), fromEmail: `x-${tag}@agentur-${tag}.test` } });

describe("Telefonsuche", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.salesContact.deleteMany({ where: { OR: [{ id: { in: contactIds } }, { email: { endsWith: `@perf-${tag}.test` } }] } });
    for (const id of customerIds) {
      await prisma.lead.deleteMany({ where: { customerId: id } });
      await prisma.conversation.deleteMany({ where: { customerId: id } });
      await cleanupCustomer(id);
    }
  });

  it("die SQL-Normalisierung entspricht phoneKey (TypeScript)", async () => {
    const samples = [
      "+49 152 58142143", "0049 152 58142143", "0152-581 42 143", "015258142143", "(0152) 581/42143", "+49 (0) 152 581 42 143",
      "4915258142143", "+43 664 1234567", "0043 664 1234567", "Tel: 0171 1234567", "030 / 123 456 78", "+41 79 123 45 67",
      "123", "", "abc", "0171 12", "+1 (415) 555-0100", "0 171 1234567", " 0171 1234567 ",
    ];
    const rows = await prisma.$queryRaw<{ raw: string; k: string | null }[]>`SELECT x AS raw, telefon_ziffern(x) AS k FROM unnest(${samples}::text[]) AS x`;
    for (const r of rows) expect(r.k, r.raw).toBe(phoneDigitsKey(r.raw));
  });

  it("verschiedene Schreibweisen derselben Nummer finden denselben Kontakt", async () => {
    const n = rnd();
    const c = await contact({ phone: `+49 152 ${n}` });
    for (const q of [`+49 152 ${n}`, `0049 152 ${n}`, `0152-${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5)}`, `0152${n}`, `(0152) ${n.slice(0, 4)}/${n.slice(4)}`, `49152${n}`]) {
      expect(await keys(q), q).toEqual([`kontakt:${c.id}`]);
    }
    const [hit] = await search(`0152 ${n}`);
    expect(hit.match).toBe(`+49 152 ${n} · Hauptnummer`);
    expect(hit.action).toBeUndefined();
  });

  it("Teilsuche mit Endziffern und mit dem Anfang", async () => {
    const n = rnd();
    const c = await contact({ phone: `0160 ${n}` });
    expect(await keys(n.slice(-5))).toContain(`kontakt:${c.id}`);
    expect(await keys(n.slice(-6))).toContain(`kontakt:${c.id}`);
    expect(await keys(`0160 ${n.slice(0, 4)}`)).toContain(`kontakt:${c.id}`);
    expect(await keys(`0160 ${n}`)).toEqual([`kontakt:${c.id}`]);
    // Weitere Nummer am Kontakt (SalesContactPhone, E.164) ebenso
    const m = rnd();
    await prisma.salesContactPhone.create({ data: { contactId: c.id, phone: `+49172${m}`, kind: "MOBIL", source: "BUCHUNG", detectedAt: new Date("2026-11-14T10:00:00Z") } });
    const [hit] = await search(`0172 ${m}`);
    expect(hit.id).toBe(c.id);
    expect(hit.match).toBe(`+49 172 ${m} · weitere Nummer, aus Buchung 14.11.`);
  });

  it("Nummer nur in einer Mail-Signatur findet den Kontakt, mit Quelle und Übernahme", async () => {
    const n = rnd();
    const c = await contact({ phone: "0421 123456" });
    const e = await mail(c.id, `Hallo Herr Kannapinn,\n\ngerne nächste Woche.\n\nViele Grüße\nMax Muster\nAgentur Muster\nMobil: 0171 ${n}`);
    expect(await keys(`0171 ${n}`)).toEqual([]); // noch nicht eingetragen
    const r = await indexPendingMailPhones(1000);
    expect(r.mails).toBeGreaterThan(0);
    expect(await indexPendingMailPhones(1000)).toEqual({ mails: 0, phones: 0 }); // idempotent
    const hits = await search(`+49 171 ${n}`);
    expect(hits.map((h) => h.id)).toEqual([c.id]);
    expect(hits[0].match).toBe(`+49 171 ${n} · in E-Mail-Signatur vom 12.11.`);
    expect(hits[0].action?.label).toBe("Als weitere Nummer übernehmen");
    expect(await keys(n.slice(-5))).toContain(`kontakt:${c.id}`);

    // „Als weitere Nummer übernehmen“ über die Kontaktdaten-Übernahme
    const [p] = await prisma.salesEmailPhone.findMany({ where: { emailId: e.id } });
    expect(await adoptFoundPhone("mail", p.id)).toBe("added");
    const after = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id }, include: { phones: true } });
    expect(after.phone).toBe("0421 123456");
    expect(after.phones.map((x) => [x.phone, x.kind, x.source])).toEqual([[`+49171${n}`, "MOBIL", "MAIL"]]);
    const again = await search(`0171 ${n}`);
    expect(again[0].match).toBe(`+49 171 ${n} · weitere Nummer, aus E-Mail-Signatur 12.11.`);
    expect(again[0].action).toBeUndefined();
    expect(await adoptFoundPhone("mail", p.id)).toBe("known");
  });

  it("keine Treffer auf Nummern aus zitierten Fremd-Mails, Abwesenheitsnotizen oder eigenen Mails", async () => {
    const fremd = rnd();
    const vertretung = rnd();
    const ausgehend = rnd();
    const c = await contact();
    await mail(c.id, `Danke, passt.\n\nGruß\nMax\n\nAm 11.11.2026 um 10:00 schrieb Peter Fremd <peter@fremd.test>:\n> Viele Grüße\n> Peter Fremd\n> Tel.: 0160 ${fremd}`);
    await mail(c.id, `Ich bin bis 20.11. nicht im Büro.\n\nViele Grüße\nVertretung: Frau Beispiel\nTel.: 0170 ${vertretung}`, { isAutoReply: true });
    await mail(c.id, `Hallo,\n\nViele Grüße\nOle\nMobil: 0176 ${ausgehend}`, { direction: "OUT" });
    await indexPendingMailPhones(1000);
    expect(await keys(`0160 ${fremd}`)).toEqual([]);
    expect(await keys(fremd.slice(-5))).not.toContain(`kontakt:${c.id}`);
    expect(await keys(`0170 ${vertretung}`)).toEqual([]);
    expect(await keys(`0176 ${ausgehend}`)).toEqual([]);
  });

  it("neue Antwort über Instantly wird sofort eingetragen", async () => {
    const n = rnd();
    const c = await contact({ phone: "0421 7654321" });
    await recordReply(c.id, {
      subject: `Re: Anfrage ${tag}`,
      text: `Gerne.\n\nBeste Grüße\nErika Beispiel\nHandy: 0157 ${n}`,
      fromEmail: `erika-${tag}@agentur-${tag}.test`,
      isAutoReply: false,
      sentAt: new Date("2026-11-15T08:00:00Z"),
    });
    expect(await prisma.salesEmailPhone.count({ where: { email: { contactId: c.id } } })).toBe(1);
    expect(await keys(`0157-${n}`)).toEqual([`kontakt:${c.id}`]);
  });

  it("Kunden-Stammdaten, Buchung, Lead und WhatsApp-Chat", async () => {
    const cust = await makeCustomer();
    customerIds.push(cust.id);
    const [nKontakt, nErst, nWa, nLead, nChat, nBuchung] = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];
    await contact({ phone: `089 ${nKontakt}`, customerId: cust.id });
    await prisma.erstinformation.create({ data: { customerId: cust.id, token: `ts-${tag}`, telefon: `+49 30 ${nErst}` } });
    await prisma.whatsAppAccount.create({ data: { customerId: cust.id, phoneNumber: `49151${nWa}` } });
    const lead = await prisma.lead.create({ data: { customerId: cust.id, name: `Lead ${tag}`, phone: `49176${nLead}` } });
    const chat = await prisma.conversation.create({ data: { customerId: cust.id, contactPhone: `49177${nChat}`, contactName: `Chat ${tag}` } });
    const lc = await prisma.conversation.create({ data: { customerId: cust.id, leadId: lead.id, contactPhone: `49176${nLead}` } });
    const booked = await contact();
    const meeting = await prisma.salesMeeting.create({ data: { contactId: booked.id, title: "Erstgespräch", startAt: new Date("2026-11-20T10:00:00Z"), inviteePhone: `0162 ${nBuchung}`, bookingTypeId: null, manageToken: `ts-${tag}` } });

    expect(await keys(`089 ${nKontakt}`)).toEqual([`kunde:${cust.id}`]);
    expect((await search(`030 ${nErst}`))[0]).toMatchObject({ kind: "kunde", id: cust.id, match: `+49 30${nErst.slice(0, 1)} ${nErst.slice(1)} · Erstinformation` });
    expect((await search(`0151 ${nWa}`))[0]).toMatchObject({ kind: "kunde", id: cust.id });
    // Lead und sein Chat: ein Treffer (Lead), der Chat ohne Lead extra
    expect(await keys(`0176 ${nLead}`)).toEqual([`lead:${lead.id}`]);
    expect(lc.id).toBeTruthy();
    expect(await keys(nChat.slice(-6))).toContain(`chat:${chat.id}`);
    const [b] = await search(`+49 162 ${nBuchung}`);
    expect(b).toMatchObject({ kind: "kontakt", id: booked.id, match: `+49 162 ${nBuchung} · in Buchung vom ${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(meeting.createdAt)}` });
    expect(b.action?.body).toEqual({ quelle: "buchung", id: meeting.id });
    expect(await adoptFoundPhone("buchung", meeting.id)).toBe("main"); // Kontakt ohne Nummer: wird Hauptnummer
  });

  it("Spalten folgen Änderungen der Nummer (Trigger)", async () => {
    const [a, b] = [rnd(), rnd()];
    const c = await contact({ phone: `0171 ${a}` });
    await prisma.salesContact.update({ where: { id: c.id }, data: { phone: `0172 ${b}` } });
    expect(await keys(`0171 ${a}`)).toEqual([]);
    expect(await keys(`0172 ${b}`)).toEqual([`kontakt:${c.id}`]);
    await prisma.salesContact.update({ where: { id: c.id }, data: { phone: null } });
    const row = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id }, select: { phoneDigits: true, phoneDigitsRev: true } });
    expect(row).toEqual({ phoneDigits: null, phoneDigitsRev: null });
  });

  it("Laufzeit mit 5.000 Kontakten, weiteren Nummern und Mails unter 300 ms", async () => {
    const N = 5000;
    const base = Date.now() % 1_000_000;
    const phone = (i: number) => `0151 ${String(10_000_000 + ((base + i * 7919) % 89_999_999)).padStart(8, "0")}`;
    await prisma.salesContact.createMany({
      data: Array.from({ length: N }, (_, i) => ({ id: `perf_${tag}_${i}`, name: `Perf ${tag} ${i}`, email: `p${i}@perf-${tag}.test`, phone: phone(i) })),
    });
    await prisma.salesContactPhone.createMany({
      data: Array.from({ length: N }, (_, i) => ({ contactId: `perf_${tag}_${i}`, phone: `+49160${String(10_000_000 + i * 13)}`, source: "BUCHUNG" })),
    });
    const mails = await prisma.salesEmail.createManyAndReturn({
      data: Array.from({ length: 2000 }, (_, i) => ({ contactId: `perf_${tag}_${i}`, direction: "IN", text: `Hallo\n\nViele Grüße\nPerf\nMobil: 0170 ${String(20_000_000 + i * 17)}`, sentAt: new Date() })),
      select: { id: true },
    });
    for (const m of mails) await indexMailPhones(m.id);
    for (const t of ["SalesContact", "SalesContactPhone", "SalesEmailPhone", "SalesEmail"]) await prisma.$executeRawUnsafe(`ANALYZE "${t}"`);
    const target = phone(4242);
    const queries = [target, target.replace(/\s/g, "").slice(-5), `+49 160 ${10_000_000 + 4242 * 13}`, String(20_000_000 + 1234 * 17).slice(-6), target.slice(0, 9)];
    await search(queries[0]); // Verbindung aufwärmen
    const times: Record<string, number> = {};
    for (const q of queries) {
      const t0 = performance.now();
      const hits = await search(q);
      times[q] = Math.round(performance.now() - t0);
      expect(hits.length, q).toBeGreaterThan(0);
      expect(times[q], q).toBeLessThan(300);
    }
    console.log("Telefonsuche Laufzeit (ms):", JSON.stringify(times));
    expect((await search(target)).map((h) => h.id)).toContain(`perf_${tag}_4242`);
  }, 120_000);
});
