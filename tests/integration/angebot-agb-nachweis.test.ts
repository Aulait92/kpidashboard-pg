// Nachweis der gezeigten AGB bei der Annahme (Ole, 26.11.2026): Stand, Merkmale des Filters (Paket, Pay-per-Lead,
// Vorauszahlung), Abschnitte und Hash am Angebot und im Protokoll; danach zeigt das Angebot genau diese Fassung.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })), sendToCustomer: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/lib/email", async (orig) => {
  const real = await orig<typeof import("@/lib/email")>();
  return { ...real, sendCustomerMail: vi.fn(async () => ({ ok: true })) };
});

import { prisma } from "@/lib/prisma";
import { acceptOffer, createOffer } from "@/lib/offers";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { agbDesAngebots, agbNachweis } from "@/lib/agb-angebot";
import { LEGAL_VERSION } from "@/lib/legal-texts";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const contacts: string[] = [];
const base = { name: "Nora Nachweis", ip: "127.0.0.1", agent: "vitest", termsAccepted: true, business: { company: "Agentur Nachweis", vatId: null, confirmed: true } };

async function newOffer(extra: Record<string, unknown>) {
  const contact = await prisma.salesContact.create({ data: { name: "AGB Nachweis", email: `n-${uid()}@example.test` } });
  contacts.push(contact.id);
  return createOffer(
    { salesContactId: contact.id },
    {
      contactName: "Nora Nachweis",
      email: `nora-${uid()}@example.test`,
      term: "12m",
      products: [{ name: "Katzenversicherung", dailyBudget: 40 }],
      startDate: addDaysIso(berlinTodayIso(), 20),
      customerChoice: false,
      ...extra,
    } as Parameters<typeof createOffer>[1],
    null,
  );
}

describe("AGB-Nachweis bei der Annahme", () => {
  beforeAll(() => {
    requireTestDb();
    delete process.env.STRIPE_SECRET_KEY;
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
  });
  afterAll(async () => {
    const offers = await prisma.offer.findMany({ where: { salesContactId: { in: contacts } }, select: { id: true } });
    const obs = await prisma.onboarding.findMany({ where: { offerId: { in: offers.map((o) => o.id) } }, select: { customerId: true } });
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    for (const ob of obs) if (ob.customerId) await prisma.customer.delete({ where: { id: ob.customerId } }).catch(() => {});
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });

  it("Betreuung + Software ohne Vorauszahlung: Stand, Merkmale, Abschnitte und Hash gespeichert", async () => {
    const offer = await newOffer({ package: "software" });
    expect(offer.agbVersion).toBeNull();
    const vorher = agbNachweis(offer);
    expect(await acceptOffer(offer.token, base)).toEqual({ ok: true });
    const saved = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(saved.agbVersion).toBe(LEGAL_VERSION);
    expect(saved.agbMerkmale).toMatchObject({ paket: "software", ppl: false, kampagnen: true, vorauszahlung: "nein", archiv: false });
    expect((saved.agbMerkmale as { abschnitte: string[] }).abschnitte).toHaveLength(17);
    expect(saved.agbHash).toBe(vorher.agbHash);
    const log = await prisma.auditLog.findFirst({ where: { action: "offer.accept", entityId: offer.id } });
    expect(log?.details).toMatchObject({ agbVersion: LEGAL_VERSION, agbHash: vorher.agbHash, agbMerkmale: { paket: "software", vorauszahlung: "nein" } });
    // Angenommen: gezeigt wird die gespeicherte Fassung
    expect(agbNachweis(saved).agbHash).toBe(saved.agbHash);
    expect(JSON.stringify(agbDesAngebots(saved).abschnitte)).not.toMatch(/Pay-per-Lead|Umsatzsteuer auf Leads|Vorauszahlung/);
  });

  it("Vorauszahlung zur Wahl, monatlich gewählt: gespeichert ist die gezeigte Fassung (wählbar)", async () => {
    const offer = await newOffer({ package: "software", annual: true });
    expect(offer.annualChoice).toBe(true);
    expect(await acceptOffer(offer.token, { ...base, annual: false })).toEqual({ ok: true });
    const saved = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(saved.annualPrepay).toBe(false);
    expect(saved.agbMerkmale).toMatchObject({ vorauszahlung: "waehlbar" });
    expect(JSON.stringify(agbDesAngebots(saved).abschnitte)).toContain("Vorauszahlung");
  });

  it("Nur Betreuung", async () => {
    const offer = await newOffer({ package: "service" });
    expect(await acceptOffer(offer.token, base)).toEqual({ ok: true });
    const saved = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(saved.agbMerkmale).toMatchObject({ paket: "service", ppl: false, kampagnen: true });
  });
});
