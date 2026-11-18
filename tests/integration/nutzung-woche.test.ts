// Diagnose q=nutzung-woche gegen die Datenbank: echte Kunden zählen, Test-Kunden und Admin-Vorschau nicht,
// und im JSON stehen keine Namen, E-Mails, Telefonnummern, IDs oder Texte (Hilfe-Fragen nur als Themen).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/ops/diagnose/route";
import { nutzungWoche } from "@/lib/ops/nutzung-woche";
import { prisma } from "@/lib/prisma";
import { cleanupCustomer, requireTestDb } from "./db";

const TOKEN = "test-read-token-0123456789-0123456789-abcdef";
const tag = Math.random().toString(36).slice(2, 10);
const H = 60 * 60 * 1000;
const D = 24 * H;
const vor = (ms: number) => new Date(Date.now() - ms);

describe("Diagnose nutzung-woche", () => {
  const before = process.env.OPS_READ_TOKEN;
  const kundenIds: string[] = [];
  const geheim: string[] = [];
  let kA = "";
  let kB = "";
  let kT = "";

  beforeAll(async () => {
    requireTestDb();
    process.env.OPS_READ_TOKEN = TOKEN;
    const mkKunde = async (name: string, extra: Record<string, unknown> = {}) => {
      const c = await prisma.customer.create({ data: { name, ...extra } });
      kundenIds.push(c.id);
      geheim.push(name, c.id);
      return c.id;
    };
    kA = await mkKunde(`Nutzwoche Alpha Maklerbuero ${tag}`);
    kB = await mkKunde(`Nutzwoche Beta Vermittlung ${tag}`, { plan: "service" });
    kT = await mkKunde(`Nutzwoche Testkunde ${tag}`, { isTest: true });
    const mkUser = async (customerId: string, n: string) => {
      const email = `nutzwoche-${n}-${tag}@example.org`;
      const u = await prisma.user.create({ data: { email, passwordHash: "x", role: "BUYER", customerId, teamRole: "owner", displayName: `Berater ${n} ${tag}` } });
      geheim.push(email, u.id, `Berater ${n} ${tag}`);
      return u.id;
    };
    const uA1 = await mkUser(kA, "a1");
    const uA2 = await mkUser(kA, "a2");
    const uB1 = await mkUser(kB, "b1");
    const uT1 = await mkUser(kT, "t1");

    // Leads mit Namen, Telefon und E-Mail
    const leadName = `Lea Leadname${tag}`;
    const leadMail = `lea-${tag}@example.org`;
    const leadPhone = "4915112345678";
    const leadA = await prisma.lead.create({
      data: { customerId: kA, name: leadName, email: leadMail, phone: leadPhone, status: "Termin vereinbart", createdAt: vor(2 * D), followUpAt: vor(3 * D), followUpNote: `Rückruf ${leadName}` },
    });
    const leadA2 = await prisma.lead.create({ data: { customerId: kA, name: `Otto Ohneschritt${tag}`, status: "Im Gespräch", createdAt: vor(10 * D) } });
    geheim.push(leadName, leadMail, leadPhone, leadA.id, leadA2.id, `Otto Ohneschritt${tag}`);
    const conv = await prisma.conversation.create({ data: { customerId: kA, leadId: leadA.id, contactPhone: leadPhone, contactName: leadName } });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "outbound", sentBy: "bot", body: `Hallo ${leadName}`, createdAt: new Date(leadA.createdAt.getTime() + 5 * 60000) } });
    await prisma.leadHistory.create({ data: { leadId: leadA2.id, customerId: kA, kind: "notiz", text: `Notiz zu ${leadName}`, userId: uA1, createdAt: new Date(leadA2.createdAt.getTime() + 30 * 60000) } });
    await prisma.appointment.create({ data: { customerId: kA, leadId: leadA2.id, mode: "phone", startsAt: vor(3 * D), status: "booked" } });

    const ev = (customerId: string, userId: string, type: string, name: string, at: Date, extra: Record<string, unknown> = {}) =>
      prisma.usageEvent.create({ data: { customerId, userId, type, name, at, ...extra } });
    await Promise.all([
      ev(kA, uA1, "page", "/buyer/heute", vor(1 * D)),
      ev(kA, uA1, "page", "/buyer/heute", vor(1 * D)),
      ev(kA, uA2, "page", "/buyer/heute", vor(2 * D)),
      ev(kA, uA1, "page", `/buyer/kontakte/${leadA.id}`, vor(1 * D)),
      ev(kA, uA1, "page", "/buyer/bestand/import", vor(1 * D)),
      ev(kB, uB1, "page", "/buyer/bestand/import", vor(1 * D)),
      ev(kB, uB1, "page", "/buyer/heute", vor(9 * D)),
      ev(kA, uA1, "page", "/buyer/zahlen", vor(30 * D)),
      ev(kA, uA1, "action", "chat.done", vor(1 * D)),
      ev(kA, uA1, "error", `toast: „${leadName}“ (${leadMail}) konnte nicht gespeichert werden`, vor(1 * D)),
      ev(kA, uA1, "feedback", "feedback", vor(1 * D), { meta: { text: `Feedback über ${leadName}` } }),
      ev(kA, uA1, "help", "question", vor(1 * D), { meta: { question: `Wie schreibe ich ${leadName} per WhatsApp an? ${leadMail}`, answer: `Antwort für ${leadName}`, rating: "down" } }),
      ev(kB, uB1, "help", "question", vor(2 * D), { meta: { question: "Wo finde ich meine Rechnung?", answer: "Unter Konto" } }),
      ev(kA, uA1, "support", "contacted", vor(1 * D), { meta: { ref: "H-1", reason: "bug", summary: `Problem mit ${leadName}`, source: "ai", channel: "email" } }),
      // Admin-Vorschau und Test-Kunde zählen nicht
      ev(kA, uA1, "page", "/buyer/vorschau-nur", vor(1 * D), { preview: true }),
      ev(kT, uT1, "page", "/buyer/testkunde-nur", vor(1 * D)),
    ]);
    await prisma.auditLog.create({ data: { action: "bestand.import", customerId: kA, actorId: uA1, actorEmail: `nutzwoche-a1-${tag}@example.org`, actorRole: "BUYER", at: vor(1 * D) } });
    await prisma.customerFeedback.create({ data: { customerId: kA, kind: "day30", token: `nw-${tag}-1`, score: 9, comment: `Super, ${leadName}`, answeredAt: vor(1 * D) } });
    await prisma.customerFeedback.create({ data: { customerId: kB, kind: "day7", token: `nw-${tag}-2`, score: 4, answeredAt: vor(2 * D) } });
  });

  afterAll(async () => {
    process.env.OPS_READ_TOKEN = before;
    await prisma.auditLog.deleteMany({ where: { customerId: { in: kundenIds } } });
    await prisma.usageEvent.deleteMany({ where: { customerId: { in: kundenIds } } });
    await prisma.lead.deleteMany({ where: { customerId: { in: kundenIds } } });
    await prisma.user.deleteMany({ where: { customerId: { in: kundenIds } } });
    for (const id of kundenIds) await cleanupCustomer(id);
  });

  it("zählt echte Kunden, nicht Test-Kunden und Vorschau", async () => {
    const r = await nutzungWoche(new URLSearchParams(), { kunden: kundenIds });
    expect(r.tage).toBe(7);
    expect(r.basis).toMatchObject({ echteKunden: 2, davonSoftware: 1 });
    expect(r.aktiv.kunden).toEqual({ aktuell: 2, vorher: 1, veraenderungProzent: 100 });
    expect(r.aktiv.nutzer.aktuell).toBe(3);
    expect(r.seiten.top[0]).toEqual({ name: "/buyer/heute", anzahl: 3, vorher: 1, kunden: 1 });
    expect(r.seiten.top.map((s) => s.name)).toContain("/buyer/kontakte/[id]");
    expect(r.seiten.top.map((s) => s.name)).not.toContain("/buyer/vorschau-nur");
    expect(r.seiten.top.map((s) => s.name)).not.toContain("/buyer/testkunde-nur");
    expect(r.seiten.ungenutzt).toEqual([{ name: "/buyer/zahlen", anzahlDavor: 1 }]);
    expect(r.aktionen.top).toEqual([{ name: "chat.done", anzahl: 1, vorher: 0, kunden: 1 }]);
    expect(r.abbrueche.import).toMatchObject({ messung: "ja", aktuell: { gestartet: 2, abgeschlossen: 1, abbruchProzent: 50 } });
    expect(r.abbrueche.whatsappVerbinden).toMatchObject({ messung: "keine Messung" });
    expect(r.abbrueche.angebotSenden).toMatchObject({ messung: "keine Messung" });
    expect(r.fehlerToasts.gesamt.aktuell).toBe(1);
    expect(r.feedback.formularEtwasUnklar.aktuell).toBe(1);
    expect(r.feedback.umfrage.aktuell).toMatchObject({ antworten: 2, startTag7: { anzahl: 1, schnitt: 4 }, weiterempfehlung: { anzahl: 1, nps: 100 } });
    expect(r.feedback.hilfeBewertung.nichtHilfreich.aktuell).toBe(1);
    expect(r.support).toMatchObject({ kontaktiert: { aktuell: 1 }, nachGrund: { "Möglicher Fehler": 1 }, nachKanal: { email: 1 } });
    expect(r.hilfeFragen.gesamt.aktuell).toBe(2);
    expect(r.hilfeFragen.themen.filter((t) => t.anzahl > 0)).toEqual(
      expect.arrayContaining([
        { thema: "WhatsApp", anzahl: 1, vorher: 0 },
        { thema: "Abrechnung/Rechnung", anzahl: 1, vorher: 0 },
      ]),
    );
    expect(r.aufgaben).toMatchObject({ wiedervorlagenOffen: 1, ueberfaelligUeber24h: 1, ueberfaelligProzent: 100, termineOhneErgebnis: 1 });
    expect(r.naechsterSchritt).toMatchObject({ offeneLeads: 2, mitSchritt: 1, ohneSchritt: 1, davonErgebnisFehlt: 1, mitSchrittProzent: 50 });
    expect(r.ersteReaktion.aktuell).toMatchObject({ neueLeads: 1, ersteReaktion: { gemessen: 1, medianMinuten: 5 } });
    expect(r.ersteReaktion.vorher).toMatchObject({ neueLeads: 1, ersteVermittlerAktion: { gemessen: 1, medianMinuten: 30 } });
  });

  it("über die Diagnose-API: keine Namen, E-Mails, Nummern, IDs oder Texte im JSON", async () => {
    const res = await GET(new Request("https://app.test/api/ops/diagnose?q=nutzung-woche&tage=7", { headers: { authorization: `Bearer ${TOKEN}` } }));
    expect(res.status).toBe(200);
    const text = await res.text();
    const j = JSON.parse(text) as { q: string; data: { software: { tage: number }; ppl: { tage: number }; gesamt: { tage: number } } };
    expect(j.q).toBe("nutzung-woche");
    expect(j.data.software.tage).toBe(7);
    expect(j.data.ppl.tage).toBe(7);
    expect(j.data.gesamt.tage).toBe(7);
    const direkt = JSON.stringify(await nutzungWoche(new URLSearchParams(), { kunden: kundenIds }));
    for (const s of [text, direkt]) {
      for (const g of geheim) expect(s).not.toContain(g);
      expect(s).not.toContain(tag);
      expect(s).not.toContain("@example.org");
      expect(s).not.toContain("Antwort für");
      expect(s).not.toContain("Feedback über");
      expect(s).not.toContain("Problem mit");
    }
    expect((await GET(new Request("https://app.test/api/ops/diagnose?q=nutzung-woche"))).status).toBe(401);
  });
});
