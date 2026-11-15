// Annahme eines Angebots (Anwalts-Memo, 15.11.2026): Firma und Bestätigung „Unternehmer (§ 14 BGB)“ sind Pflicht
// und werden gespeichert; bei Startpreis ist das Häkchen zum Übergang in die reguläre Vergütung Pflicht;
// Auftragsbestätigung nennt Datum und Betrag.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mails = vi.hoisted(() => ({ sent: [] as { subject: string; list?: string[] }[] }));
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })), sendToCustomer: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/lib/email", async (orig) => {
  const real = await orig<typeof import("@/lib/email")>();
  return {
    ...real,
    sendCustomerMail: vi.fn(async (o: { subject: string; list?: string[] }) => {
      mails.sent.push(o);
      return { ok: true };
    }),
  };
});

import { prisma } from "@/lib/prisma";
import { acceptOffer, createOffer } from "@/lib/offers";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { fmtIso, periodEndIso } from "@/lib/vertrag-laufzeit";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const today = berlinTodayIso();
const contacts: string[] = [];

async function newOffer(extra: Record<string, unknown> = {}) {
  const contact = await prisma.salesContact.create({ data: { name: "Unternehmer Test", email: `u-${uid()}@example.test` } });
  contacts.push(contact.id);
  return createOffer(
    { salesContactId: contact.id },
    {
      contactName: "Uwe Unternehmer",
      email: `uwe-${uid()}@example.test`,
      term: "12m",
      products: [{ name: "Katzenversicherung", dailyBudget: 40 }],
      startDate: addDaysIso(today, 20),
      customerChoice: false,
      ...extra,
    },
    null,
  );
}
const base = { name: "Uwe Unternehmer", ip: "127.0.0.1", agent: "vitest", termsAccepted: true };

describe("Angebot annehmen: Unternehmer und Startpreis", () => {
  beforeAll(() => {
    requireTestDb();
    delete process.env.STRIPE_SECRET_KEY;
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
  });
  beforeEach(() => {
    mails.sent = [];
  });
  afterAll(async () => {
    const offers = await prisma.offer.findMany({ where: { salesContactId: { in: contacts } }, select: { id: true } });
    const obs = await prisma.onboarding.findMany({ where: { offerId: { in: offers.map((o) => o.id) } }, select: { customerId: true } });
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    for (const ob of obs) if (ob.customerId) await prisma.customer.delete({ where: { id: ob.customerId } }).catch(() => {});
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });

  it("ohne Firma oder ohne Bestätigung keine Annahme; mit Angaben gespeichert, Firma übernommen", async () => {
    const offer = await newOffer();
    expect(await acceptOffer(offer.token, { ...base })).toMatchObject({ ok: false, error: expect.stringContaining("Firma") });
    expect(await acceptOffer(offer.token, { ...base, business: { company: "Agentur Uwe", confirmed: false } })).toMatchObject({ ok: false, error: expect.stringContaining("Unternehmer") });
    expect(await acceptOffer(offer.token, { ...base, business: { company: "Agentur Uwe", vatId: "DE12", confirmed: true } })).toMatchObject({ ok: false, error: expect.stringContaining("USt-IdNr.") });
    expect((await prisma.offer.findUnique({ where: { id: offer.id } }))!.status).not.toBe("accepted");

    expect(await acceptOffer(offer.token, { ...base, business: { company: " Agentur  Uwe ", vatId: "de 123 456 789", confirmed: true } })).toEqual({ ok: true });
    const saved = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(saved).toMatchObject({ status: "accepted", acceptedCompany: "Agentur Uwe", acceptedVatId: "DE123456789", acceptedAsBusiness: true, acceptedPriceStep: false, company: "Agentur Uwe" });
    const log = await prisma.auditLog.findFirst({ where: { action: "offer.accept", entityId: offer.id } });
    expect(log?.details).toMatchObject({ company: "Agentur Uwe", vatId: "DE123456789", asBusiness: true });

    const mail = mails.sent.find((m) => m.subject.startsWith("Ihre Auftragsbestätigung"));
    expect(mail).toBeTruthy();
    const start = addDaysIso(today, 20);
    expect(mail!.list!.join(" ")).toContain(`Mindestlaufzeit 12 Monate bis ${fmtIso(periodEndIso(start, 12))}`);
  });

  it("Startpreis: Häkchen zum Übergang ist Pflicht und wird gespeichert, Mail nennt Datum und Betrag", async () => {
    const offer = await newOffer({ introMonthlyFee: 500, introMonths: 2, company: "Agentur Start" });
    const business = { company: "Agentur Start", confirmed: true };
    expect(await acceptOffer(offer.token, { ...base, business })).toMatchObject({ ok: false, error: expect.stringContaining("Startpreis") });
    expect(await acceptOffer(offer.token, { ...base, business, priceStepAck: true })).toEqual({ ok: true });
    expect(await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } })).toMatchObject({ acceptedPriceStep: true, acceptedAsBusiness: true });
    const start = addDaysIso(today, 20);
    const list = mails.sent.find((m) => m.subject.startsWith("Ihre Auftragsbestätigung"))!.list!.join(" ").replace(/ /g, " ");
    expect(list).toContain(`Startpreis: 500 € netto im Monat vom ${fmtIso(start)} bis ${fmtIso(periodEndIso(start, 2))}`);
    expect(list).toMatch(/Danach automatisch [\d.]+ € netto im Monat ab /);
  });

  it("Testangebot: keine Auftragsbestätigung", async () => {
    const offer = await newOffer({ test: true });
    expect(await acceptOffer(offer.token, { ...base, business: { company: "Test GmbH", confirmed: true } })).toEqual({ ok: true });
    expect(mails.sent.some((m) => m.subject.startsWith("Ihre Auftragsbestätigung"))).toBe(false);
  });
});
