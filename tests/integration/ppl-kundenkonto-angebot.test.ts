// Pay-per-Lead + Software, Variante „Kampagnen im eigenen Werbekonto“ (Ole, 20.11.2026): Angebot anlegen (Startpaket ab
// 1.500 €, ohne erste Woche), Variante gespeichert, Entwurf zurück auf bisher, Annahme ohne Zahlung außer dem
// Software-Abo, Auftragsbestätigung mit den Zeilen der Variante. Bisherige Angebote: pplModell bleibt leer.
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
import { acceptOffer, createOffer, updateDraftOffer } from "@/lib/offers";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const today = berlinTodayIso();
const contacts: string[] = [];
const nb = (s: string) => s.replace(/[  ]/g, " ");

async function eingabe(extra: Record<string, unknown> = {}) {
  const contact = await prisma.salesContact.create({ data: { name: "Kundenkonto Test", email: `kk-${uid()}@example.test` } });
  contacts.push(contact.id);
  return {
    owner: { salesContactId: contact.id },
    input: {
      contactName: "Klara Konto",
      email: `klara-${uid()}@example.test`,
      package: "ppl_software" as const,
      term: "none" as const,
      products: [],
      startDate: addDaysIso(today, 10),
      pplModell: "kundenkonto" as const,
      kundenkontoProdukte: [{ name: "Privatschutz", preis: "35", menge: "43" }],
      ersteWoche: { productKey: "TKV-Katze", price: 17, quantity: 20 },
      ...extra,
    },
  };
}
const base = { name: "Klara Konto", ip: "127.0.0.1", agent: "vitest", termsAccepted: true, business: { company: "Agentur Konto", confirmed: true } };

describe("Angebot Pay-per-Lead im eigenen Werbekonto", () => {
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
    await prisma.onboarding.deleteMany({ where: { offerId: { in: offers.map((o) => o.id) } } }).catch(() => {});
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    for (const ob of obs) if (ob.customerId) await prisma.customer.delete({ where: { id: ob.customerId } }).catch(() => {});
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });

  it("unter 1.500 € Startpaket: kein Angebot", async () => {
    const { owner, input } = await eingabe({ kundenkontoProdukte: [{ name: "Privatschutz", preis: "35", menge: "40" }] });
    await expect(createOffer(owner, input, null)).rejects.toThrow("Das Startpaket braucht mindestens");
  });

  it("speichert Variante und Produkte, keine erste Woche; Annahme mit Zeilen der Variante", async () => {
    const { owner, input } = await eingabe();
    const offer = await createOffer(owner, input, null);
    expect(offer).toMatchObject({ package: "ppl_software", pplModell: "kundenkonto", pplProductKey: null, pplPrice: null, monthlyFee: expect.anything(), setupFee: expect.anything() });
    expect(offer.pplProdukte).toEqual([{ name: "Privatschutz", preis: 35, menge: 43 }]);
    expect(Number(offer.monthlyFee)).toBe(349);
    expect(Number(offer.setupFee)).toBe(0);

    expect(await acceptOffer(offer.token, { ...base })).toEqual({ ok: true });
    const saved = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(saved).toMatchObject({ status: "accepted", pplModell: "kundenkonto" });
    const list = nb(mails.sent.find((m) => m.subject.startsWith("Ihre Auftragsbestätigung"))!.list!.join(" "));
    expect(list).toContain("Kampagnen im eigenen Werbekonto");
    expect(list).toContain("Startpaket: 43 Leads Privatschutz, zusammen 1.505,00 €");
    expect(list).toContain("Software: inklusive, solange Sie mindestens 1.500,00 € Leads im Monat beziehen");
    expect(list).not.toContain("Leads bestellen Sie wie gewohnt per Stück");
  });

  it("Entwurf zurück auf bisher: Variante und Produkte geleert", async () => {
    const { owner, input } = await eingabe();
    const offer = await createOffer(owner, input, null);
    const neu = await updateDraftOffer(offer.id, { ...input, pplModell: "pool", kundenkontoProdukte: null });
    expect(neu.pplModell).toBeNull();
    expect(neu.pplProdukte).toBeNull();
    expect(neu.pplProductKey).toBe("TKV-Katze");
  });
});
