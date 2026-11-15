// Login mit „+“-Adressen (Go-live 15.11.2026): gleiche Normalisierung beim Anlegen (Onboarding),
// beim Passwort-Reset und beim Login. Ein „+“, das unterwegs (URL-Query) zum Leerzeichen wurde,
// findet trotzdem den Login. Diagnose-API mit unkodiertem „+“ in der URL ebenso.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })), sendToCustomer: vi.fn(async () => ({ sent: 0 })) }));

import { prisma } from "@/lib/prisma";
import { consumePasswordResetToken, issuePasswordResetToken, login, loginWithVerifiedEmail } from "@/lib/auth";
import { acceptOffer, createOffer } from "@/lib/offers";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { GET } from "@/app/api/ops/diagnose/route";
import { requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const email = `ole.k${tag}+1@gmail.com`;
const contacts: string[] = [];
const TOKEN = "test-read-token-0123456789-0123456789-abcdef";

describe("Login mit „+“-Adresse", () => {
  beforeAll(() => {
    requireTestDb();
    delete process.env.STRIPE_SECRET_KEY; // ohne Online-Zahlung startet das Onboarding mit der Annahme
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
    process.env.OPS_READ_TOKEN = TOKEN;
  });
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email }, select: { id: true, customerId: true } });
    await prisma.auditLog.deleteMany({ where: { actorEmail: { contains: tag } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: users.map((u) => u.id) } } });
    await prisma.onboarding.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.salesTask.deleteMany({ where: { contactId: { in: contacts } } });
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
    for (const u of users) if (u.customerId) await prisma.customer.delete({ where: { id: u.customerId } }).catch(() => {});
    delete process.env.OPS_READ_TOKEN;
  });

  it("Onboarding legt den Login normalisiert an, Reset und Login klappen mit jeder Schreibweise", async () => {
    const contact = await prisma.salesContact.create({ data: { name: `Plus ${tag}`, email: `plus-kontakt-${tag}@example.test` } });
    contacts.push(contact.id);
    const offer = await createOffer(
      { salesContactId: contact.id },
      { contactName: "Ole Plus", company: `Plus Agentur ${tag}`, email: `  Ole.K${tag}+1@Gmail.com `, term: "12m", products: [{ name: "TKV-Katze", dailyBudget: 30 }], startDate: addDaysIso(berlinTodayIso(), 20) },
      null,
    );
    expect(await acceptOffer(offer.token, { name: "Ole Plus", ip: null, agent: "vitest", termsAccepted: true, business: { company: `Plus Agentur ${tag}`, confirmed: true } })).toEqual({ ok: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.customerId).not.toBeNull();

    // Passwort über den Link setzen (Einladung bzw. „Passwort vergessen“ mit Leerzeichen statt „+“)
    const issued = await issuePasswordResetToken(`ole.k${tag} 1@gmail.com`);
    expect(issued?.userId).toBe(user.id);
    expect(await consumePasswordResetToken(issued!.rawToken, "Sicher123!")).toEqual({ ok: true });

    for (const variant of [email, ` OLE.K${tag.toUpperCase()}+1@GMAIL.COM `, `ole.k${tag} 1@gmail.com`, `ole.k${tag}%2B1@gmail.com`]) {
      const r = await login(variant, "Sicher123!");
      expect(r.ok, variant).toBe(true);
    }
    expect((await login(email, "falsch")).ok).toBe(false);

    // „Mit Google anmelden“: Google meldet die Gmail-Hauptadresse ohne „+1“
    const g = await loginWithVerifiedEmail(`ole.k${tag}@gmail.com`, "google");
    expect(g.ok && g.payload.userId).toBe(user.id);
    expect((await loginWithVerifiedEmail(`ole.k${tag}@gmail.com`, "microsoft")).ok).toBe(false);
  });

  it("Diagnose findet den Login auch mit unkodiertem „+“ in der URL", async () => {
    const r = await GET(new Request(`https://app.test/api/ops/diagnose?q=login&email=${email}`, { headers: { authorization: `Bearer ${TOKEN}` } }));
    const j = (await r.json()) as { data: { loginsExakt: number } };
    expect(j.data.loginsExakt).toBe(1);
  });
});
