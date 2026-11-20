// Onboarding Herr Lohmann (Ole, 20.11.2026):
// 1) „Passwort jetzt festlegen“ nur im Browser der Annahme, frischer Link ohne den Mail-Link zu entwerten; sobald das
//    Passwort steht, sind alle übrigen Links ungültig. „Einladungslink kopieren“ im Admin ebenso.
// 2) Pilot bis …: Erinnerungen 7 Tage vorher und am Ende, keine Platz-Abrechnung, kein Testkunde.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })), sendToCustomer: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/lib/vertrieb/auth", () => ({ requireAuth: async () => ({ userId: "admin", role: "ADMIN", email: "admin@test.local" }) }));

import { prisma } from "@/lib/prisma";
import { consumePasswordResetToken, issuePasswordResetToken } from "@/lib/auth";
import { acceptOffer, createOffer } from "@/lib/offers";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { merkeAnnahme } from "@/lib/annahme-direktzugang-server";
import { ANNAHME_COOKIE } from "@/lib/annahme-direktzugang";
import { passwortJetztAction } from "@/app/angebot/[token]/actions";
import { einladungslinkAction } from "@/app/admin/vertrieb/onboarding-actions";
import { setzePilot } from "@/lib/pilot-server";
import { pilotAufgabenKennung } from "@/lib/pilot";
import { syncSeatBilling } from "@/lib/billing";
import { requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const email = `lohmann-${tag}@allianz.test`;
const contacts: string[] = [];
const customers: string[] = [];

const tokenAus = (url: string) => decodeURIComponent(new URL(url, "https://app.test").searchParams.get("token") ?? "");

describe("Onboarding Herr Lohmann", () => {
  beforeAll(() => {
    requireTestDb();
    delete process.env.STRIPE_SECRET_KEY; // ohne Online-Zahlung startet das Onboarding mit der Annahme
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
    process.env.AUTH_SECRET = process.env.AUTH_SECRET || "testsecret-testsecret-testsecret-12";
  });
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email }, select: { id: true, customerId: true } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...users.map((u) => u.id), ...customers] } } });
    await prisma.onboarding.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.salesTask.deleteMany({ where: { OR: [{ contactId: { in: contacts } }, { note: { in: customers.map(pilotAufgabenKennung) } }] } });
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
    for (const u of users) if (u.customerId) customers.push(u.customerId);
    for (const id of customers) await prisma.customer.delete({ where: { id } }).catch(() => {});
  });

  it("Passwort jetzt festlegen: nur im Browser der Annahme, Mail-Link bleibt gültig bis das Passwort steht", async () => {
    const contact = await prisma.salesContact.create({ data: { name: `Lohmann ${tag}`, email: `kontakt-${tag}@example.test` } });
    contacts.push(contact.id);
    const offer = await createOffer(
      { salesContactId: contact.id },
      { contactName: "Herr Lohmann", company: `Allianz Lohmann ${tag}`, email, term: "12m", products: [{ name: "TKV-Katze", dailyBudget: 30 }], startDate: addDaysIso(berlinTodayIso(), 20) },
      null,
    );
    expect(await acceptOffer(offer.token, { name: "Herr Lohmann", ip: null, agent: "vitest", termsAccepted: true, business: { company: `Allianz Lohmann ${tag}`, confirmed: true } })).toEqual({ ok: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    // Anderer Browser (nur der Angebotslink): kein Link
    jar.clear();
    const fremd = await passwortJetztAction(offer.token);
    expect(fremd.url).toBeUndefined();
    expect(fremd.error).toBeTruthy();

    // Link „aus der Mail“ (wie sendWelcome) und danach der Knopf im Browser der Annahme
    const mail = await issuePasswordResetToken(email, 7 * 24 * 60 * 60 * 1000);
    await merkeAnnahme(offer.id);
    expect(jar.get(ANNAHME_COOKIE)).toBeTruthy();
    const res = await passwortJetztAction(offer.token);
    expect(res.url).toMatch(/^\/reset-password\?token=/);
    const direkt = tokenAus(res.url!);
    expect(direkt).not.toBe(mail!.rawToken);

    // Admin: Einladungslink kopieren, ebenfalls ohne die anderen zu entwerten
    const ob = await prisma.onboarding.findFirstOrThrow({ where: { offerId: offer.id } });
    const kopie = await einladungslinkAction(ob.id);
    expect(kopie.email).toBe(email);
    const kopiert = tokenAus(kopie.url!);

    const offen = await prisma.passwordResetToken.count({ where: { userId: user.id, usedAt: null } });
    expect(offen).toBeGreaterThanOrEqual(3);

    // Passwort über den Knopf setzen: danach gelten Mail-Link und kopierter Link nicht mehr
    expect(await consumePasswordResetToken(direkt, "Sicher123!")).toEqual({ ok: true });
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id, usedAt: null } })).toBe(0);
    expect(await consumePasswordResetToken(mail!.rawToken, "Anders123!")).toMatchObject({ ok: false, linkUngueltig: true });
    expect(await consumePasswordResetToken(kopiert, "Anders123!")).toMatchObject({ ok: false, linkUngueltig: true });

    // Schon angemeldet: kein neuer Link mehr über die Angebotsseite
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    expect(await passwortJetztAction(offer.token)).toEqual({ angemeldet: true });
  });

  it("Pilot bis …: Erinnerungen, keine Platz-Abrechnung, kein Testkunde", async () => {
    const c = await prisma.customer.create({ data: { name: `Pilot ${tag}`, seatsIncluded: 1, seatMonthly: 49 } });
    customers.push(c.id);
    const now = new Date();
    const bis = new Date(`${addDaysIso(berlinTodayIso(now), 20)}T12:00:00Z`);
    expect(await setzePilot(c.id, bis, now)).toEqual({ ok: true });
    const tasks = await prisma.salesTask.findMany({ where: { note: pilotAufgabenKennung(c.id), doneAt: null }, orderBy: { dueAt: "asc" } });
    expect(tasks).toHaveLength(2);
    expect(tasks[1].title).toContain("endet heute");

    // Datum ändern ersetzt die Erinnerungen
    const neu = new Date(`${addDaysIso(berlinTodayIso(now), 40)}T12:00:00Z`);
    await setzePilot(c.id, neu, now);
    expect(await prisma.salesTask.count({ where: { note: pilotAufgabenKennung(c.id), doneAt: null } })).toBe(2);

    const sync = await syncSeatBilling(c.id);
    expect(sync).toMatchObject({ ok: true, changed: false });
    expect(sync.ok && sync.note).toContain("Pilot");

    const gespeichert = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(gespeichert.isTest).toBe(false);
    expect(gespeichert.pilotBis?.toISOString()).toBe(neu.toISOString());

    // Entfernen: keine offenen Erinnerungen mehr
    await setzePilot(c.id, null, now);
    expect(await prisma.salesTask.count({ where: { note: pilotAufgabenKennung(c.id), doneAt: null } })).toBe(0);

    // Testkunden sind nie Pilot
    const t = await prisma.customer.create({ data: { name: `Pilot-Test ${tag}`, isTest: true } });
    customers.push(t.id);
    expect(await setzePilot(t.id, bis, now)).toMatchObject({ ok: false });
  });
});
