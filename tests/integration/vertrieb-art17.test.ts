// Löschung auf Verlangen (Art. 17) im Vertrieb und Auskunft (Art. 15) über die Diagnose (Ole, 19.11.2026).
// Instantly gemockt: Blocklist, Lead-Suche, DELETE /leads/{id}.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureInstantlyContact, recordReply } from "@/lib/vertrieb/instantly";
import { vertriebArt17Loeschen, art17Email } from "@/lib/vertrieb/art17";
import { emailHash, geloeschteAdressen, kontaktGesperrt } from "@/lib/vertrieb/sperrliste";
import { vorUploadPruefen } from "@/lib/vertrieb/nie-kontaktieren-server";
import { importContactsCsv } from "@/lib/vertrieb/import-contacts";
import { ART17_NAME } from "@/lib/vertrieb/nie-kontaktieren";
import { wendeLoeschprotokollAn } from "@/lib/loeschprotokoll";
import { vertriebAuskunftDiagnose, vertriebDsgvoDiagnose } from "@/lib/ops/vertrieb-auskunft";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const campaign = `Art17 Test ${tag}`;
let n = 0;
const ids: string[] = [];
const customers: string[] = [];

type Call = { method: string; path: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let instantlyKaputt = false;
const blocklist: string[] = [];

async function makeContact(extra: Record<string, unknown> = {}) {
  const email = `art17-${tag}-${++n}@agentur-${tag}.test`;
  const c = await prisma.salesContact.create({
    data: {
      email,
      name: `Agentur Muster ${n}`,
      salutation: "Herr",
      firstName: "Max",
      lastName: `Muster${n}`,
      phone: "+49 170 1234567",
      street: "Hauptstr. 1",
      zip: "12345",
      city: "Musterstadt",
      url: "https://agentur-muster.test",
      description: "Generalvertretung",
      enrichment: { import: { liste: "vermittler", quelle: "allianz-vertretersuche", gesellschaft: "Allianz", quelleUrl: "https://vertretung.example/max", abgerufenAm: "2026-11-01", importiertAm: "2026-11-02T10:00:00Z" } },
      ...extra,
    },
  });
  ids.push(c.id);
  await prisma.salesActivity.create({ data: { contactId: c.id, type: "ANRUF", outcome: "Nicht erreicht", note: "Max Muster war nicht da" } });
  await prisma.salesTask.create({ data: { contactId: c.id, title: "Max anrufen", type: "ANRUF", dueAt: new Date() } });
  return c;
}

async function antwort(contactId: string, text: string, sentAt = new Date()) {
  const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId } });
  return recordReply(contactId, { instantlyId: `in-${Math.random()}`, subject: "AW: Neue Kunden", text, fromEmail: c.email, threadId: "thr", eaccount: "ole@growth.test", isAutoReply: false, sentAt, campaign });
}

const reqs = (method: string, p: string) => calls.filter((c) => c.method === method && c.path.startsWith(p));

// Hooks auf Dateiebene: gelten für beide Blöcke (Aufräumen erst ganz am Ende)
beforeAll(async () => {
  requireTestDb();
  process.env.INSTANTLY_API_KEY = "test";
  process.env.INSTANTLY_AUTO_SYNC = "1";
  delete process.env.ANTHROPIC_API_KEY;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const u = new URL(String(url));
    const path = u.pathname.replace("/api/v2", "") + u.search;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, path, body });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
    if (instantlyKaputt && path.startsWith("/block-lists-entries") && method === "POST") return json({ message: `kaputt für ${body?.bl_value}` }, 500);
    if (path.startsWith("/block-lists-entries") && method === "GET") return json({ items: blocklist.filter((b) => b === u.searchParams.get("search")).map((b) => ({ bl_value: b })) });
    if (path.startsWith("/block-lists-entries") && method === "POST") {
      blocklist.push(String(body?.bl_value));
      return json({ id: "bl-1", bl_value: body?.bl_value });
    }
    if (path.startsWith("/leads/list")) return json({ items: [{ id: "lead-a", email: body?.search }, { id: "lead-b", email: body?.search }, { id: "lead-x", email: "andere@x.test" }] });
    if (path.startsWith("/leads/") && method === "DELETE") return json({ id: path.split("/")[2] });
    if (path.startsWith("/campaigns/search-by-contact")) return json({ items: [{ id: "camp-a" }] });
    if (path.startsWith("/leads/update-interest-status")) return json({}, 202);
    return json({ items: [] });
  });
});
beforeEach(() => {
  calls = [];
  instantlyKaputt = false;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.INSTANTLY_API_KEY;
  delete process.env.INSTANTLY_AUTO_SYNC;
  await prisma.salesContact.deleteMany({ where: { id: { in: ids } } });
  await prisma.salesContact.deleteMany({ where: { email: { contains: tag } } });
  await prisma.salesCampaign.deleteMany({ where: { name: campaign } });
  await prisma.loeschprotokoll.deleteMany({ where: { entityId: { in: ids } } });
  for (const c of customers) await cleanupCustomer(c);
});

describe("Vertrieb: Löschung auf Verlangen (Art. 17)", () => {
  it("Antwort „Löschen Sie meine Daten“: Hülle mit Sperrvermerk, alles andere weg, Instantly gelöscht", async () => {
    const c = await makeContact();
    await prisma.salesEmail.create({ data: { contactId: c.id, direction: "OUT", subject: "Neue Kunden", text: "Hallo Max", sentAt: new Date(Date.now() - 86400000) } });
    // „Überall“: zweiter Kontakt mit derselben Adresse als Zusatzadresse wird ganz gelöscht
    const zweiter = await makeContact({ altEmails: [c.email], enrichment: { instantlyPortion: { tag: "2026-11-18" } } });
    expect(await antwort(c.id, "Löschen Sie bitte umgehend meine Daten.\n\nMax Muster")).toBe(true);

    const h = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id }, include: { activities: true, tasks: true, emails: true, followups: true, campaigns: true } });
    expect(h.name).toBe(ART17_NAME);
    expect(h.email).toBe(art17Email(c.id));
    expect(h.altEmails).toEqual([]);
    expect(h.sperrHashes).toEqual([emailHash(c.email)]);
    expect(h.art17GeloeschtAt).not.toBeNull();
    expect(h.nieKontaktierenAt).not.toBeNull();
    expect(h.nieKontaktierenGrund).toBe("widerspruch");
    for (const f of ["salutation", "firstName", "lastName", "phone", "street", "zip", "city", "url", "description", "enrichment", "detectedData"] as const) expect(h[f]).toBeNull();
    expect(h.emails).toHaveLength(0);
    // nur die Aufgabe fürs alte Cold CRM (ohne Adresse)
    expect(h.tasks.map((t) => t.title)).toEqual([expect.stringMatching(/^Im alten Cold CRM \(Airtable\) löschen, Frist \d{2}\.\d{2}\.\d{4}$/)]);
    expect(h.tasks[0].note).not.toContain(c.email);
    expect(await prisma.salesContact.findUnique({ where: { id: zweiter.id } })).toBeNull();
    expect(await prisma.salesActivity.count({ where: { contactId: zweiter.id } })).toBe(0);
    expect(await prisma.loeschprotokoll.count({ where: { art: "vertriebskontakt", entityId: zweiter.id } })).toBe(1);
    expect(h.followups).toHaveLength(0);
    expect(h.campaigns).toHaveLength(0);
    expect(h.activities).toHaveLength(1);
    expect(h.activities[0].note).toMatch(/^Personenbezogene Daten am \d{2}\.\d{2}\.\d{4} auf Verlangen gelöscht \(Art\. 17 DSGVO\)\. Sperrvermerk bleibt\.$/);
    expect(JSON.stringify(h)).not.toContain(c.email);
    expect(JSON.stringify(h)).not.toContain("Muster");

    // Instantly: Adresse auf der Blocklist (einmal), beide Leads dieser Adresse gelöscht (nicht der fremde)
    expect(reqs("POST", "/block-lists-entries").map((x) => x.body)).toEqual([{ bl_value: c.email }]);
    expect(blocklist).toContain(c.email);
    expect(reqs("DELETE", "/leads/").map((x) => x.path).sort()).toEqual(["/leads/lead-a", "/leads/lead-b"]);

    // Audit ohne Personendaten, Löschprotokoll
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "vertrieb.geloescht_art17", entityId: c.id } });
    expect(JSON.stringify(log.details)).not.toContain("@");
    expect(log.details).toMatchObject({ quelle: "antwort", instantly: "erledigt" });
    expect(await prisma.loeschprotokoll.count({ where: { art: "vertriebskontakt_art17", entityId: c.id } })).toBe(1);
    expect(await kontaktGesperrt(c.id)).toBe(true);

    // Künftige Importe, Uploads und Antworten erkennen die Adresse über den Hash
    expect([...(await geloeschteAdressen([c.email.toUpperCase(), "neu@x.test"]))]).toEqual([c.email]);
    const upload = await vorUploadPruefen([c.email]);
    expect(upload.gesperrt).toEqual([{ email: c.email, grund: "nie_kontaktieren" }]);
    const imp = await importContactsCsv(`email,name\n${c.email},Agentur Muster\n`);
    expect(imp.created).toBe(0);
    expect(await prisma.salesContact.count({ where: { email: c.email } })).toBe(0);

    // Neue Antwort von der gelöschten Adresse: kein neuer Kontakt, kein Inhalt, nur Aufgabe
    const e = await ensureInstantlyContact(c.email, { firstName: "Max", company: "Agentur Muster" }, campaign);
    expect(e).toEqual({ id: c.id, created: false });
    expect(await antwort(c.id, "Haben Sie meine Daten wirklich gelöscht?")).toBe(false);
    const nach = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id }, include: { emails: true, tasks: true } });
    expect(nach.emails).toHaveLength(0);
    expect(nach.tasks.map((t) => t.title)).toContain("Neue Nachricht einer auf Verlangen gelöschten Adresse");
    expect(nach.tasks).toHaveLength(2);
  });

  it("Ausnahme: Adresse ist Lead eines Kunden → nur sperren und Aufgabe „Löschverlangen prüfen“", async () => {
    const cust = await makeCustomer();
    customers.push(cust.id);
    const c = await makeContact();
    await prisma.lead.create({ data: { customerId: cust.id, name: "Max Muster", email: c.email.toUpperCase() } });
    await antwort(c.id, "Ich verlange die Löschung meiner Daten nach Art. 17 DSGVO.");
    const k = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id }, include: { tasks: true } });
    expect(k.art17GeloeschtAt).toBeNull();
    expect(k.name).toBe(c.name);
    expect(k.nieKontaktierenAt).not.toBeNull();
    expect(k.tasks.map((t) => t.title).find((t) => t.startsWith("Löschverlangen prüfen (Kunde/Lead), Frist "))).toBeTruthy();
    expect(reqs("DELETE", "/leads/")).toHaveLength(0);
    // nur eine offene Aufgabe auch bei zweiter Antwort
    await antwort(c.id, "Nochmal: Löschen Sie meine Daten!");
    expect(await prisma.salesTask.count({ where: { contactId: c.id, title: { startsWith: "Löschverlangen prüfen" } } })).toBe(1);
  });

  it("Ausnahme gilt über alle Kontakte mit der Adresse: zweiter Kontakt hat ein Angebot → nichts gelöscht", async () => {
    const c = await makeContact();
    const zweiter = await makeContact({ altEmails: [c.email] });
    await prisma.offer.create({
      data: { salesContactId: zweiter.id, number: `A-${tag}`, token: `tok-${tag}`, contactName: "Testperson", term: "none", products: [], setupFee: 0, monthlyFee: 0, softwareFee: 0, validUntil: new Date() },
    });
    const r = await vertriebArt17Loeschen(c.id, { quelle: "admin", actor: { role: "admin" } });
    expect(r.status).toBe("ausnahme");
    expect(await prisma.salesContact.findUnique({ where: { id: zweiter.id } })).not.toBeNull();
    expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: zweiter.id } })).nieKontaktierenAt).not.toBeNull();
    expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } })).art17GeloeschtAt).toBeNull();
  });

  it("Ausnahme: Kunde (Kundenkonto) und Login-Domain", async () => {
    const cust = await makeCustomer();
    customers.push(cust.id);
    const kunde = await makeContact({ customerId: cust.id });
    expect((await vertriebArt17Loeschen(kunde.id, { quelle: "admin", actor: { role: "admin" } })).gruende).toContain("kunde");
    const login = await prisma.user.create({ data: { email: `chef@login-${tag}.test`, passwordHash: "x", role: "BUYER", customerId: cust.id } });
    const kollege = await makeContact({ email: `kollege@login-${tag}.test` });
    const r = await vertriebArt17Loeschen(kollege.id, { quelle: "admin", actor: { role: "admin" } });
    expect(r).toEqual({ status: "ausnahme", gruende: ["kunde_domain"] });
    await prisma.user.delete({ where: { id: login.id } });
  });

  it("Auskunft und Löschung zugleich: erst Auskunft (nichts gelöscht, zwei Aufgaben)", async () => {
    const c = await makeContact();
    await antwort(c.id, "Woher haben Sie meine Adresse? Löschen Sie anschließend meine Daten.");
    const k = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id }, include: { tasks: true } });
    expect(k.art17GeloeschtAt).toBeNull();
    expect(k.nieKontaktierenGrund).toBe("datenschutz");
    const titel = k.tasks.map((t) => t.title);
    expect(titel.some((t) => t.startsWith("Auskunft nach Art. 15 beantworten, Frist "))).toBe(true);
    expect(titel.some((t) => t.startsWith("Auskunft und Löschverlangen: erst Auskunft schicken"))).toBe(true);
  });

  it("Instantly-Fehler: lokal trotzdem gelöscht, Aufgabe ohne Adresse", async () => {
    instantlyKaputt = true;
    const c = await makeContact();
    const r = await vertriebArt17Loeschen(c.id, { quelle: "admin", actor: { role: "admin", email: "ole@growth.test" } });
    expect(r).toEqual({ status: "geloescht", instantly: "fehler" });
    const h = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id }, include: { tasks: true } });
    expect(h.name).toBe(ART17_NAME);
    expect(h.tasks).toHaveLength(2);
    const t = h.tasks.find((x) => x.title === "Instantly: Löschung (Art. 17) von Hand nachholen")!;
    expect(t.note).not.toContain(c.email);
    expect(t.note).toContain("[Adresse]");
    // zweiter Aufruf: schon gelöscht
    expect((await vertriebArt17Loeschen(c.id, { quelle: "admin", actor: { role: "admin" } })).status).toBe("schon_geloescht");
  });

  it("Widerspruch ohne Löschverlangen: sperren, nicht löschen", async () => {
    const c = await makeContact();
    await antwort(c.id, "Ich widerspreche der Nutzung meiner Daten zu Werbezwecken.");
    const k = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } });
    expect(k.nieKontaktierenGrund).toBe("widerspruch");
    expect(k.art17GeloeschtAt).toBeNull();
    expect(k.name).toBe(c.name);
    expect(reqs("DELETE", "/leads/")).toHaveLength(0);
  });

  it("Anwalt, Unterlassung, Schadensersatz: immer Absage und gesperrt (nie neutral oder später)", async () => {
    for (const text of ["Ich gebe das an meinen Anwalt weiter.", "Unterlassen Sie das künftig.", "Schadensersatz behalte ich mir vor. Gerne nächstes Jahr wieder? Nein."]) {
      const c = await makeContact();
      await antwort(c.id, text);
      const k = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id }, include: { emails: true } });
      expect(k.nieKontaktierenGrund).toBe("widerspruch");
      expect(k.emails.find((e) => e.direction === "IN")?.sentiment).toBe("NEGATIV");
    }
  });

  it("Löschprotokoll: nach einer Wiederherstellung wird die Hülle erneut anonymisiert", async () => {
    const c = await makeContact();
    await vertriebArt17Loeschen(c.id, { quelle: "admin", actor: { role: "admin" } });
    // „Wiederherstellung“: alte Daten zurück
    await prisma.salesContact.update({ where: { id: c.id }, data: { name: "Agentur Muster", email: c.email, firstName: "Max", art17GeloeschtAt: null, sperrHashes: [] } });
    await prisma.salesActivity.create({ data: { contactId: c.id, type: "ANRUF", note: "alter Verlauf" } });
    const pruef = await wendeLoeschprotokollAn({ nurPruefen: true });
    expect(pruef.offen).toContainEqual({ art: "vertriebskontakt_art17", entityId: c.id });
    await wendeLoeschprotokollAn();
    const h = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id }, include: { activities: true } });
    expect(h.name).toBe(ART17_NAME);
    expect(h.firstName).toBeNull();
    expect(h.sperrHashes).toEqual([emailHash(c.email)]);
    expect(h.activities).toHaveLength(1);
  });
});

describe("Diagnose: Auskunft (Art. 15) und DSGVO-Zähler", () => {
  it("Auskunft per E-Mail: Felder, Herkunft, Empfänger, Mails, Sperre und Mails nach der Sperre", async () => {
    const c = await makeContact();
    const camp = await prisma.salesCampaign.create({ data: { name: `${campaign} Auskunft` } });
    await prisma.salesCampaignLead.create({ data: { contactId: c.id, campaignId: camp.id, sentAt: new Date("2026-11-03T09:00:00Z") } });
    await prisma.salesContact.update({ where: { id: c.id }, data: { nieKontaktierenAt: new Date("2026-11-05T09:00:00Z"), nieKontaktierenGrund: "widerspruch" } });
    await prisma.salesEmail.create({ data: { contactId: c.id, direction: "OUT", subject: "Nachfass", sentAt: new Date("2026-11-07T09:00:00Z"), campaign: "manuell" } });

    const r = (await vertriebAuskunftDiagnose(new URLSearchParams({ email: c.email.toUpperCase() }))) as Record<string, unknown> & { felder: Record<string, unknown>; herkunft: Record<string, unknown>; sperre: Record<string, unknown> };
    expect(r).toMatchObject({ gefunden: true, id: c.id, anrede: "Herr", vorname: "Max", firma: c.name });
    expect(r.felder["E-Mail"]).toBe(c.email);
    expect(r.felder["Ort"]).toBe("Musterstadt");
    expect(r.herkunft).toMatchObject({ art: "öffentliche Vermittlerliste", quelle: "allianz-vertretersuche", quelleUrl: "https://vertretung.example/max", abgerufenAm: "2026-11-01" });
    expect((r.empfaenger as string[])[0]).toContain(`${campaign} Auskunft`);
    expect(r.mailsAnIhn).toEqual(
      expect.arrayContaining([
        { datum: "2026-11-03", weg: `Instantly-Kampagne „${campaign} Auskunft“ (letzte bekannte Mail)` },
        { datum: "2026-11-07", weg: "Mail (manuell)" },
      ]),
    );
    expect(r.sperre).toMatchObject({ seit: "2026-11-05", grund: "Widerspruch gegen Werbung", nachDerSperreRaus: [{ datum: "2026-11-07", weg: "Mail (manuell)" }] });
    await prisma.salesCampaign.delete({ where: { id: camp.id } });

    // per ID gleich
    expect(await vertriebAuskunftDiagnose(new URLSearchParams({ id: c.id }))).toMatchObject({ gefunden: true, id: c.id });
  });

  it("Suche liefert nur ID, Name, Firma, Status; ohne Treffer nichts", async () => {
    const c = await makeContact({ name: `Suchagentur ${tag}` });
    const r = (await vertriebAuskunftDiagnose(new URLSearchParams({ suche: `Suchagentur ${tag}` }))) as { treffer: Record<string, unknown>[] };
    expect(r.treffer).toHaveLength(1);
    expect(Object.keys(r.treffer[0]).sort()).toEqual(["firma", "id", "name", "status"]);
    expect(r.treffer[0]).toMatchObject({ id: c.id, firma: `Suchagentur ${tag}`, name: `Max Muster${n}` });
    expect(await vertriebAuskunftDiagnose(new URLSearchParams({ suche: `gibtesnicht${tag}` }))).toEqual({ treffer: [] });
    expect(await vertriebAuskunftDiagnose(new URLSearchParams({ email: `nie-gesehen-${tag}@x.test` }))).toEqual({ gefunden: false });
  });

  it("gelöschter Kontakt: Auskunft nur mit Löschvermerk (über den Hash)", async () => {
    const c = await makeContact();
    await vertriebArt17Loeschen(c.id, { quelle: "admin", actor: { role: "admin" } });
    const r = await vertriebAuskunftDiagnose(new URLSearchParams({ email: c.email }));
    expect(r).toMatchObject({ gefunden: true, id: c.id });
    expect(JSON.stringify(r)).not.toContain(c.email);
    expect((r as { geloeschtAufVerlangen: string }).geloeschtAufVerlangen).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("vertrieb-dsgvo zählt nur", async () => {
    const r = await vertriebDsgvoDiagnose(new URLSearchParams({ tage: "60" }));
    expect(Object.keys(r).sort()).toEqual(["antworten", "datenschutz", "loeschverlangen", "mitBezug", "tage", "widerspruch"]);
    expect(r.tage).toBe(60);
    expect(r.mitBezug).toBeGreaterThanOrEqual(r.widerspruch);
  });
});
