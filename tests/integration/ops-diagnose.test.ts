// Diagnose-API: nur mit eigenem Lese-Schlüssel, nur feste Abfragen (Ole, 14.11.2026).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/ops/diagnose/route";
import { prisma } from "@/lib/prisma";
import { requireTestDb } from "./db";

const TOKEN = "test-read-token-0123456789-0123456789-abcdef";
const req = (q: string, token?: string) => new Request(`https://app.test/api/ops/diagnose?q=${q}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("Diagnose-API", () => {
  const before = process.env.OPS_READ_TOKEN;
  beforeAll(() => {
    requireTestDb();
    process.env.OPS_READ_TOKEN = TOKEN;
  });
  afterAll(() => {
    process.env.OPS_READ_TOKEN = before;
  });

  it("ohne oder mit falschem Schlüssel: 401", async () => {
    expect((await GET(req("uebersicht"))).status).toBe(401);
    expect((await GET(req("uebersicht", "falsch"))).status).toBe(401);
  });

  it("feste Abfragen liefern Daten, unbekannte nicht", async () => {
    const r = await GET(req("uebersicht", TOKEN));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { data: { abfragen: string[] } };
    expect(j.data.abfragen).toContain("stripe");
    expect((await GET(req("stripe", TOKEN))).status).toBe(200);
    expect((await GET(req("drop table", TOKEN))).status).toBe(400);
  });

  it("verrät keine Schlüsselwerte, nur live/test", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_abc";
    const j = (await (await GET(req("stripe", TOKEN))).json()) as { data: Record<string, unknown> };
    expect(j.data.schluessel).toBe("test");
    expect(JSON.stringify(j)).not.toContain("sk_test_abc");
  });

  it("login: Befund zu einer E-Mail ohne Hash, zählt Fehlversuche auch mit Leerzeichen statt +", async () => {
    const { makeCustomer, makeBuyer, cleanupCustomer } = await import("./db");
    const c = await makeCustomer();
    const u = await makeBuyer(c.id, "owner");
    const plus = u.email.replace("@", "+1@");
    await prisma.user.update({ where: { id: u.id }, data: { email: plus } });
    await prisma.customer.update({ where: { id: c.id }, data: { isTest: true } });
    await prisma.auditLog.create({ data: { action: "login.failed", actorEmail: plus.replace("+", " ") } });
    await prisma.auditLog.create({ data: { action: "login.failed", actorEmail: plus } });
    const r = await GET(req(`login&email=${encodeURIComponent(" " + plus.toUpperCase() + " ")}`, TOKEN));
    const j = (await r.json()) as { data: { loginsExakt: number; logins: { kundeTest: boolean; role: string; hashArt: string }[]; fehlversuche15Min: Record<string, number> } };
    expect(j.data.loginsExakt).toBe(1);
    expect(j.data.logins[0]).toMatchObject({ role: "BUYER", kundeTest: true });
    expect(j.data.logins[0].hashArt).toBe("x");
    expect(JSON.stringify(j)).not.toContain("passwordHash");
    expect(j.data.fehlversuche15Min.exakt).toBe(1);
    expect(j.data.fehlversuche15Min[JSON.stringify(plus.replace("+", " "))]).toBe(1);
    await prisma.auditLog.deleteMany({ where: { actorEmail: { in: [plus, plus.replace("+", " ")] } } });
    await cleanupCustomer(c.id);
    await prisma.user.deleteMany({ where: { id: u.id } });
  });

  it("instantly-auswertung: nur Zahlen, keine Texte oder Kontaktadressen", async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const camp = await prisma.salesCampaign.create({ data: { name: `Diagnose ${tag}` } });
    const contact = await prisma.salesContact.create({ data: { name: `Agentur ${tag}`, email: `kontakt-${tag}@agentur.test` } });
    await prisma.salesCampaignLead.create({ data: { contactId: contact.id, campaignId: camp.id, sentAt: new Date(), openCount: 2, lastOpenAt: new Date(), replyCount: 1, lastReplyAt: new Date() } });
    await prisma.salesEmail.create({
      data: { contactId: contact.id, campaign: camp.name, direction: "IN", subject: "Re: Neue Kunden", text: `Geheimtext ${tag}, kein Bedarf`, eaccount: `postfach-${tag}@pg.test`, sentiment: "NEGATIV", sentAt: new Date() },
    });
    const r = await GET(req("instantly-auswertung", TOKEN));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { data: { kampagnen: { gesamt: { kampagne: string; absagen: number }[] }; markdown: string } };
    expect(j.data.kampagnen.gesamt.find((z) => z.kampagne === camp.name)).toMatchObject({ absagen: 1 });
    expect(j.data.markdown).toContain(`| ${camp.name} |`);
    const s = JSON.stringify(j);
    expect(s).not.toContain(`kontakt-${tag}`);
    expect(s).not.toContain(`postfach-${tag}@`);
    expect(s).not.toContain("Geheimtext");
    await prisma.salesContact.delete({ where: { id: contact.id } });
    await prisma.salesCampaign.delete({ where: { id: camp.id } });
  });
});
