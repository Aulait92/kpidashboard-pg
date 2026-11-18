// Du/Sie gegenüber dem Vermittler (Ole, 18.11.2026): Feld Customer.vermittlerDu.
// Geprüft: Backfill der Migration (aus Offer.mailDu über Onboarding.offerId, nur leere Felder), Annahme eines Angebots
// setzt das Feld (neuer Kunde, vorhandenes Konto, Paketwechsel), Laden mit Rückfall auf das Angebot, Admin-Änderung
// mit Änderungsprotokoll, Anrede am Angebot zieht das Kundenkonto mit. leadAddress bleibt unberührt.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getCurrentSession: async () => ({ userId: "admin-test", email: "admin@example.test", role: "ADMIN" }),
}));
vi.mock("@/lib/push", async (orig) => ({
  ...(await orig<typeof import("@/lib/push")>()),
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));

import { prisma } from "@/lib/prisma";
import { createOffer } from "@/lib/offers";
import { startOnboarding } from "@/lib/onboarding";
import { ladeVermittlerAnrede, setzeVermittlerDu } from "@/lib/vermittler-ansprache-server";
import { setzeErinnerungAdmin } from "@/lib/angebot-zahlungserinnerung-server";
import { setVermittlerDuAction } from "@/app/admin/kunden/[id]/whatsapp/module-actions";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const contacts: string[] = [];
const offers: string[] = [];
const customers: string[] = [];

/** Angenommenes Angebot mit Anrede Du oder Sie. */
async function angebot(mailDu: boolean) {
  const tag = uid();
  const contact = await prisma.salesContact.create({ data: { name: `Anrede ${tag}`, email: `anr-${tag}@example.test` } });
  contacts.push(contact.id);
  const offer = await createOffer(
    { salesContactId: contact.id },
    { contactName: "Max Muster", company: `Agentur ${tag}`, email: `max-${tag}@example.test`, term: "12m", products: [{ name: "TKV-Katze", dailyBudget: 30 }], startDate: addDaysIso(berlinTodayIso(), 30), customerChoice: false, abschlussBonus: 0 },
    null,
  );
  offers.push(offer.id);
  return prisma.offer.update({ where: { id: offer.id }, data: { status: "accepted", acceptedAt: new Date(), mailDu } });
}

async function kunde(extra: Record<string, unknown> = {}) {
  const c = await makeCustomer(extra);
  customers.push(c.id);
  return c;
}

describe("Anrede gegenüber dem Vermittler (Customer.vermittlerDu)", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
  });
  afterAll(async () => {
    await prisma.onboarding.deleteMany({ where: { OR: [{ offerId: { in: offers } }, { customerId: { in: customers } }] } }).catch(() => {});
    const neu = await prisma.salesContact.findMany({ where: { id: { in: contacts } }, select: { customerId: true } });
    for (const id of new Set([...customers, ...neu.map((c) => c.customerId).filter((x): x is string => !!x)])) {
      await prisma.user.deleteMany({ where: { customerId: id } }).catch(() => {});
      await cleanupCustomer(id);
    }
    await prisma.offer.deleteMany({ where: { id: { in: offers } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } });
  });

  it("Backfill der Migration: Du/Sie aus dem angenommenen Angebot, gesetzte Werte und Kunden ohne Angebot bleiben", async () => {
    const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261118999950_vermittler_du/migration.sql"), "utf8");
    const update = sql.slice(sql.indexOf("UPDATE"));
    const [oDu, oSie, oGesetzt] = [await angebot(true), await angebot(false), await angebot(true)];
    const [kDu, kSie, kGesetzt, kOhne] = [await kunde(), await kunde(), await kunde({ vermittlerDu: false }), await kunde()];
    await prisma.onboarding.createMany({
      data: [
        { customerId: kDu.id, offerId: oDu.id },
        { customerId: kSie.id, offerId: oSie.id },
        { customerId: kGesetzt.id, offerId: oGesetzt.id },
        { customerId: kOhne.id },
      ],
    });
    await prisma.$executeRawUnsafe(update);
    const du = async (id: string) => (await prisma.customer.findUniqueOrThrow({ where: { id }, select: { vermittlerDu: true } })).vermittlerDu;
    expect(await du(kDu.id)).toBe(true);
    expect(await du(kSie.id)).toBe(false);
    expect(await du(kGesetzt.id)).toBe(false); // schon gesetzt: bleibt
    expect(await du(kOhne.id)).toBeNull(); // ohne Angebot: unbekannt (= Sie)
    // Zweiter Lauf ändert nichts
    await prisma.$executeRawUnsafe(update);
    expect(await du(kDu.id)).toBe(true);
  });

  it("Annahme mit vorhandenem Konto übernimmt mailDu, leadAddress bleibt", async () => {
    const o = await angebot(true);
    const c = await kunde({ leadAddress: "sie" });
    const r = await startOnboarding(o.id, { customerId: c.id, sendWelcome: false });
    expect(r.ok).toBe(true);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, select: { vermittlerDu: true, leadAddress: true } });
    expect(after).toEqual({ vermittlerDu: true, leadAddress: "sie" });
  });

  it("Annahme legt ein neues Konto mit der Anrede aus dem Angebot an", async () => {
    const o = await angebot(false);
    const r = await startOnboarding(o.id, { sendWelcome: false });
    expect(r.ok && r.created).toBe(true);
    if (!r.ok) return;
    customers.push(r.customerId);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: r.customerId }, select: { vermittlerDu: true } })).vermittlerDu).toBe(false);
  });

  it("Paketwechsel (neues angenommenes Angebot am bestehenden Konto) übernimmt die neue Anrede", async () => {
    const c = await kunde({ vermittlerDu: false });
    await prisma.onboarding.create({ data: { customerId: c.id } });
    const o = await angebot(true);
    const r = await startOnboarding(o.id, { customerId: c.id, sendWelcome: false });
    expect(r.ok).toBe(true);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, select: { vermittlerDu: true } })).vermittlerDu).toBe(true);
  });

  it("Laden: Kundenfeld vor Angebot, ohne beides Sie", async () => {
    const o = await angebot(true);
    const c = await kunde();
    await prisma.onboarding.create({ data: { customerId: c.id, offerId: o.id } });
    expect(await ladeVermittlerAnrede(c.id)).toEqual({ kunde: null, angebot: true, du: true });
    await prisma.customer.update({ where: { id: c.id }, data: { vermittlerDu: false } });
    expect(await ladeVermittlerAnrede(c.id)).toEqual({ kunde: false, angebot: null, du: false });
    const ohne = await kunde();
    expect((await ladeVermittlerAnrede(ohne.id)).du).toBe(false);
  });

  it("Admin ändert die Anrede in der Kundenakte, mit Eintrag im Änderungsprotokoll", async () => {
    const c = await kunde();
    const fd = new FormData();
    fd.set("customerId", c.id);
    fd.set("anrede", "du");
    await setVermittlerDuAction(fd);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, select: { vermittlerDu: true } })).vermittlerDu).toBe(true);
    const log = await prisma.auditLog.findFirst({ where: { action: "customer.vermittler_du", entityId: c.id }, orderBy: { at: "desc" } });
    expect(log?.actorEmail).toBe("admin@example.test");
    expect(log?.details).toMatchObject({ von: "unbekannt", nach: "du" });
    // Gleicher Wert: nichts geändert, kein zweiter Eintrag
    expect(await setzeVermittlerDu(c.id, true)).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "customer.vermittler_du", entityId: c.id } })).toBe(1);
    // Ungültige Eingabe ändert nichts
    fd.set("anrede", "ihr");
    await setVermittlerDuAction(fd);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, select: { vermittlerDu: true } })).vermittlerDu).toBe(true);
  });

  it("Anrede am angenommenen Angebot ändern zieht das verknüpfte Kundenkonto mit", async () => {
    const o = await angebot(false);
    const c = await kunde({ vermittlerDu: false });
    await prisma.onboarding.create({ data: { customerId: c.id, offerId: o.id } });
    expect((await setzeErinnerungAdmin(o.id, { du: true })).ok).toBe(true);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, select: { vermittlerDu: true } })).vermittlerDu).toBe(true);
  });
});
