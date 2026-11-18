// Empfehlungsrabatt auf die Einrichtung (Kollegen empfehlen, Ole 14.11.2026):
// automatisch im Angebot an empfohlene Kontakte, alle 3 Laufzeiten, Missbrauchsfälle,
// Übersteuerung, Stripe-Betrag (gemockt: Listenpreis + einmaliger Gutschein),
// Angebotsdokument und Nachziehen offener Angebote.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const stripeState = vi.hoisted(() => ({ sessions: [] as Record<string, unknown>[], coupons: [] as Record<string, unknown>[] }));

vi.mock("stripe", () => {
  const s = stripeState;
  class FakeStripe {
    products = {
      search: async () => ({ data: [] }),
      create: async (p: { metadata: { pg_key: string } }) => ({ id: `prod_${p.metadata.pg_key}` }),
    };
    tax = { registrations: { list: async () => ({ data: [{ id: "taxreg_1" }] }) } };
    customers = { create: async () => ({ id: `cus_${Math.random().toString(36).slice(2, 8)}` }), update: async () => ({}) };
    coupons = {
      create: async (params: Record<string, unknown>) => {
        s.coupons.push(params);
        return { id: `coupon_${s.coupons.length}` };
      },
    };
    checkout = {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          s.sessions.push(params);
          return { id: `cs_${s.sessions.length}`, url: "https://checkout.stripe.test/x" };
        },
      },
    };
  }
  return { default: FakeStripe };
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/lib/prisma";
import { acceptOffer, createOffer } from "@/lib/offers";
import { createCheckoutForOffer } from "@/lib/billing";
import { backfillReferralDiscounts, consentTextFor, ensureReferralCode, referralSetupDiscount, submitReferral } from "@/lib/kollegen";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { OfferDocument, toOfferDoc } from "@/components/offer-document";
import { offerDiscountLine } from "@/lib/email";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const DAY = 24 * 60 * 60 * 1000;
const today = berlinTodayIso();

describe("Empfehlungsrabatt auf die Einrichtung", () => {
  const customers: string[] = [];
  const contacts: string[] = [];
  let code = "";
  let referrerId = "";
  const tag = uid();

  beforeAll(async () => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
    await prisma.referralSettings.deleteMany({});
    await prisma.referralSettings.create({ data: { id: "default", benefitKind: "setup_discount", benefitAmount: 300, rewardKind: "bestand", rewardMonths: 3 } });
    const c = await makeCustomer({ name: `Agentur Empfehler ${tag}` });
    referrerId = c.id;
    customers.push(c.id);
    const owner = await makeBuyer(c.id, "owner");
    await prisma.user.update({ where: { id: owner.id }, data: { displayName: "Erna Empfehler" } });
    code = await ensureReferralCode(c.id);
  });

  beforeEach(() => {
    stripeState.sessions = [];
    stripeState.coupons = [];
  });

  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
    for (const id of customers) await cleanupCustomer(id);
    await prisma.referralSettings.deleteMany({});
  });

  let viaForm = 0;
  /**
   * Empfohlener Kontakt: die ersten über die Landingpage (echter Ablauf), danach direkt
   * (die Landingpage nimmt je Code höchstens 5 Empfehlungen pro Stunde an).
   */
  async function referred(prefix = "kollege") {
    const email = `${prefix}-${uid()}@kollegen-agentur.test`;
    if (viaForm < 3) {
      viaForm++;
      const r = await submitReferral({ code, name: "Kai Kollege", company: `Agentur ${prefix} ${tag}`, email, phone: "0170 1234567", consent: true });
      if (!r.ok || !r.contactId) throw new Error("Empfehlung nicht angelegt");
      contacts.push(r.contactId);
      return r.contactId;
    }
    const contact = await prisma.salesContact.create({ data: { name: `Agentur ${prefix} ${tag}`, email, customerSource: "EMPFEHLUNG" } });
    contacts.push(contact.id);
    await prisma.colleagueReferral.create({ data: { referrerId, contactId: contact.id, name: "Kai Kollege", email, consentAt: new Date(), consentText: consentTextFor("Erna Empfehler") } });
    return contact.id;
  }

  const offerFor = (contactId: string, extra: Record<string, unknown> = {}) =>
    createOffer(
      { salesContactId: contactId },
      { contactName: "Kai Kollege", email: `kai-${uid()}@example.test`, term: "12m", products: [{ name: "TKV-Katze", dailyBudget: 30 }], startDate: addDaysIso(today, 20), ...extra },
      null,
    );

  const accept = (token: string, term: string) =>
    acceptOffer(token, { name: "Kai Kollege", ip: "127.0.0.1", agent: "vitest", termsAccepted: true, business: { company: "Agentur Test", confirmed: true }, term, startDate: addDaysIso(today, 20) });

  it("neues Angebot an Empfohlenen: Rabatt automatisch, Zeile mit Namen (Einwilligung), Laufzeit bleibt wählbar", async () => {
    const contactId = await referred();
    const d = await referralSetupDiscount(contactId);
    expect(d).toMatchObject({ eligible: true, amount: 300, referrerName: "Erna Empfehler", label: "Empfehlungsrabatt (empfohlen von Erna Empfehler)" });
    const offer = await offerFor(contactId);
    expect(Number(offer.setupFee)).toBe(690);
    expect(Number(offer.setupListFee)).toBe(990);
    expect(Number(offer.setupDiscount)).toBe(300);
    expect(offer.setupDiscountLabel).toBe("Empfehlungsrabatt (empfohlen von Erna Empfehler)");
    expect(offer.customerChoosesTerm).toBe(true);
  });

  it.each([
    ["none", 2490, 2190],
    ["3m", 1990, 1690],
    ["12m", 990, 690],
  ])("Laufzeit %s: %d → %d, Stripe-Posten zum Listenpreis plus Gutschein über 300 €", async (term, list, fee) => {
    const contactId = await referred(`laufzeit-${term}`);
    const offer = await offerFor(contactId);
    expect(await accept(offer.token, term)).toEqual({ ok: true });
    const saved = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(saved.term).toBe(term);
    expect(Number(saved.setupFee)).toBe(fee);
    expect(Number(saved.setupListFee)).toBe(list);

    expect(await createCheckoutForOffer(offer.id)).toEqual({ url: "https://checkout.stripe.test/x" });
    const session = stripeState.sessions[0] as { line_items: { price_data: { unit_amount: number } }[]; discounts?: { coupon: string }[] };
    expect(session.line_items[0].price_data.unit_amount).toBe(list * 100);
    expect(session.discounts).toEqual([{ coupon: "coupon_1" }]);
    expect(stripeState.coupons[0]).toMatchObject({ amount_off: 30000, currency: "eur", duration: "once", max_redemptions: 1, name: "Empfehlungsrabatt", applies_to: { products: ["prod_setup"] } });
    // Rechnungsbetrag = Listenpreis − Gutschein = setupFee
    expect(list * 100 - (stripeState.coupons[0].amount_off as number)).toBe(fee * 100);
  });

  it("Abschlussbonus (Ole, 16.11.2026): zusammen mit dem Empfehlungsrabatt ein Gutschein; nach der Frist Normalpreis", async () => {
    const contactId = await referred("bonus");
    const offer = await offerFor(contactId, { abschlussBonus: 300, abschlussBonusBis: today });
    expect(Number(offer.abschlussBonus)).toBe(300);
    expect(await accept(offer.token, "12m")).toEqual({ ok: true });
    expect(await createCheckoutForOffer(offer.id)).toEqual({ url: "https://checkout.stripe.test/x" });
    const session = stripeState.sessions[0] as { line_items: { price_data: { unit_amount: number } }[]; metadata: Record<string, string>; expires_at: number };
    expect(session.line_items[0].price_data.unit_amount).toBe(990 * 100);
    expect(stripeState.coupons[0]).toMatchObject({ amount_off: 60000, name: "Empfehlungsrabatt und Abschlussbonus" });
    expect(session.metadata.pg_bonus).toBe("30000");
    // Bezahlseite läuft höchstens bis kurz nach der Frist bzw. mindestens 31 Minuten
    expect(session.expires_at * 1000).toBeLessThanOrEqual(Date.now() + 24 * 3600_000);

    // Frist vorbei: kein Bonus mehr
    await prisma.offer.update({ where: { id: offer.id }, data: { abschlussBonusBis: new Date(Date.now() - 60_000), stripeCheckoutSessionId: null } });
    stripeState.sessions = [];
    stripeState.coupons = [];
    await createCheckoutForOffer(offer.id);
    expect(stripeState.coupons[0]).toMatchObject({ amount_off: 30000, name: "Empfehlungsrabatt" });
    expect((stripeState.sessions[0] as { metadata: Record<string, string> }).metadata.pg_bonus).toBeUndefined();
  });

  it("Abschlussbonus mit „später zahlen“: rechtzeitig angenommen, Zahlung nach der Frist mit Bonus und Gutschein ohne Frist", async () => {
    const contactId = await referred("bonus-spaeter");
    const offer = await offerFor(contactId, { abschlussBonus: 300, abschlussBonusBis: today, allowPayLater: true });
    expect(await accept(offer.token, "12m")).toEqual({ ok: true });
    // Frist vorbei, Annahme lag davor
    const bis = new Date(Date.now() - 60_000);
    await prisma.offer.update({ where: { id: offer.id }, data: { abschlussBonusBis: bis, acceptedAt: new Date(bis.getTime() - 3600_000) } });
    expect(await createCheckoutForOffer(offer.id)).toEqual({ url: "https://checkout.stripe.test/x" });
    expect(stripeState.coupons[0]).toMatchObject({ amount_off: 60000, name: "Empfehlungsrabatt und Abschlussbonus" });
    expect(stripeState.coupons[0].redeem_by).toBeUndefined();
    expect((stripeState.sessions[0] as { metadata: Record<string, string> }).metadata.pg_bonus).toBe("30000");
  });

  it("nie unter 0: Rabatt größer als die Einrichtung → 0 €, Checkout ohne Zahlung (nur Zahlungsart)", async () => {
    const contactId = await referred("gross");
    const offer = await offerFor(contactId, { setupDiscount: 1500 });
    expect(await accept(offer.token, "12m")).toEqual({ ok: true });
    const saved = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(Number(saved.setupFee)).toBe(0);
    await createCheckoutForOffer(offer.id);
    expect(stripeState.sessions[0].mode).toBe("setup");
    expect(stripeState.coupons).toHaveLength(0);
  });

  it("Übersteuerung: 0 = kein Rabatt; günstigere Sonderkondition gilt allein, teurere wird nicht addiert", async () => {
    const a = await offerFor(await referred("aus"), { setupDiscount: 0 });
    expect(Number(a.setupFee)).toBe(990);
    expect(a.setupDiscount).toBeNull();

    const cheaper = await offerFor(await referred("sonder"), { setupOverride: 500 });
    expect(Number(cheaper.setupFee)).toBe(500);
    expect(cheaper.setupDiscount).toBeNull();

    const pricier = await offerFor(await referred("teurer"), { setupOverride: 900 });
    expect(Number(pricier.setupFee)).toBe(690);
    expect(Number(pricier.setupDiscount)).toBe(300);
  });

  it("Missbrauch: kein automatischer Rabatt bei schon bekanntem Kontakt, früherem Angebot, Kunde, Selbstempfehlung, blockiert, älter als 12 Monate", async () => {
    const make = async (data: Record<string, unknown>, contactData: Record<string, unknown> = {}) => {
      const contact = await prisma.salesContact.create({ data: { name: `Missbrauch ${uid()}`, email: `m-${uid()}@kollegen-agentur.test`, ...contactData } });
      contacts.push(contact.id);
      await prisma.colleagueReferral.create({ data: { referrerId, contactId: contact.id, name: "X", email: contact.email, consentAt: new Date(), consentText: "ok", ...data } });
      return contact.id;
    };
    const existing = await make({ existingContact: true });
    expect(await referralSetupDiscount(existing)).toMatchObject({ eligible: false, reason: expect.stringMatching(/schon im Vertrieb/) });
    expect((await offerFor(existing)).setupDiscount).toBeNull();

    // Angebot vor der Empfehlung
    const contact = await prisma.salesContact.create({ data: { name: `Vorher ${uid()}`, email: `v-${uid()}@kollegen-agentur.test` } });
    contacts.push(contact.id);
    await offerFor(contact.id);
    await new Promise((r) => setTimeout(r, 5));
    await prisma.colleagueReferral.create({ data: { referrerId, contactId: contact.id, name: "X", consentAt: new Date(), consentText: "ok" } });
    expect(await referralSetupDiscount(contact.id)).toMatchObject({ eligible: false, reason: expect.stringMatching(/Angebot/) });

    const kunde = await makeCustomer();
    customers.push(kunde.id);
    const isCustomer = await make({}, { customerId: kunde.id });
    expect(await referralSetupDiscount(isCustomer)).toMatchObject({ eligible: false, reason: "Kontakt ist schon Kunde" });

    // eigene Kundenakte des Empfehlers (andere Domain, sonst gälte sie für alle folgenden Kontakte)
    const self = await make({}, { customerId: referrerId, email: `self-${uid()}@eigene-agentur.test` });
    expect(await referralSetupDiscount(self)).toMatchObject({ eligible: false, reason: "Selbstempfehlung" });

    const blocked = await make({ status: "blocked", blockedReason: "bereits Kunde" });
    expect(await referralSetupDiscount(blocked)).toBeNull();
    expect((await offerFor(blocked)).setupDiscount).toBeNull();

    const old = await make({ createdAt: new Date(Date.now() - 400 * DAY) });
    expect(await referralSetupDiscount(old)).toMatchObject({ eligible: false, reason: expect.stringMatching(/12 Monate/) });
    // Admin kann trotzdem bewusst übersteuern
    expect(Number((await offerFor(old, { setupDiscount: 300 })).setupFee)).toBe(690);

    // Ohne Empfehlung kein Empfehlungsrabatt von Hand
    const plain = await prisma.salesContact.create({ data: { name: `Ohne ${uid()}`, email: `o-${uid()}@kollegen-agentur.test` } });
    contacts.push(plain.id);
    await expect(offerFor(plain.id, { setupDiscount: 300 })).rejects.toThrow(/nur für empfohlene Kontakte/);
  });

  it("ohne Einwilligung zum Namen: Zeile nur „Empfehlungsrabatt“", async () => {
    const contact = await prisma.salesContact.create({ data: { name: `Anonym ${uid()}`, email: `a-${uid()}@kollegen-agentur.test` } });
    contacts.push(contact.id);
    await prisma.colleagueReferral.create({ data: { referrerId, contactId: contact.id, name: "X", consentAt: new Date(), consentText: "Einwilligung ohne Namen" } });
    const offer = await offerFor(contact.id);
    expect(offer.setupDiscountLabel).toBe("Empfehlungsrabatt");
  });

  it("Angebotsdokument: Listenpreis durchgestrichen, eigene Zeile mit Betrag; Angebotsmail mit Zeile", async () => {
    const contactId = await referred("dokument");
    const offer = await offerFor(contactId);
    const html = renderToStaticMarkup(createElement(OfferDocument, { offer: toOfferDoc(offer) }));
    expect(html).toMatch(/<s[^>]*data-offer-setup-list[^>]*>990\s€<\/s>/);
    expect(html).toContain("Empfehlungsrabatt (empfohlen von Erna Empfehler)");
    expect(html).toMatch(/data-offer-setup-discount[^>]*>− 300\s€/);
    // Laufzeitwahl zeigt die Preise nach Rabatt
    expect(html).toMatch(/12 Monate \(Setup 690\s€\)/);
    expect(html).toMatch(/ohne Laufzeit \(<!-- -->?2\.190\s€\)|ohne Laufzeit \(2\.190\s€\)/);

    const line = offerDiscountLine({ label: offer.setupDiscountLabel!, discount: 300, list: 990, fee: 690, anyTerm: true });
    expect(line.text).toBe("Empfehlungsrabatt (empfohlen von Erna Empfehler): − 300 € auf die Einrichtung. Einrichtung 690 € statt 990 € netto. Gilt bei jeder Laufzeit.".replace(/ €/g, " €"));
    expect(line.html).toContain("<s>990 €</s>");
    expect(line.text).not.toMatch(/ [–—] /);
  });

  it("offene Angebote nachziehen: Trockenlauf zeigt die Liste, Übernehmen ändert genau einmal", async () => {
    const contactId = await referred("nachziehen");
    // Altes Angebot ohne Rabatt (wie vor dem Deploy): direkt angelegt
    const old = await prisma.offer.create({
      data: { number: `RB-${uid()}`, token: `rb-${uid()}-${uid()}-${uid()}`, contactName: "Kai", term: "3m", products: [{ name: "TKV-Katze", dailyBudget: 30 }], setupFee: 1990, monthlyFee: 1000, softwareFee: 349, validUntil: new Date(Date.now() + 10 * DAY), salesContactId: contactId, status: "sent", customerChoosesTerm: true, customerChoosesStart: true, termsUrl: "https://app.test/agb", dpaUrl: "https://app.test/avv" },
    });
    const dry = await backfillReferralDiscounts({ apply: false });
    const row = dry.find((r) => r.offerId === old.id);
    expect(row).toMatchObject({ oldSetup: 1990, newSetup: 1690, discount: 300, skip: null });
    expect(Number((await prisma.offer.findUniqueOrThrow({ where: { id: old.id } })).setupFee)).toBe(1990);

    await backfillReferralDiscounts({ apply: true, actor: { role: "system" } });
    const saved = await prisma.offer.findUniqueOrThrow({ where: { id: old.id } });
    expect(Number(saved.setupFee)).toBe(1690);
    expect(Number(saved.setupListFee)).toBe(1990);
    expect(saved.referralId).not.toBeNull();
    // zweiter Lauf: nichts mehr offen für dieses Angebot
    expect((await backfillReferralDiscounts({ apply: false })).some((r) => r.offerId === old.id)).toBe(false);
    // Kunde wählt danach eine andere Laufzeit: Rabatt bleibt
    expect(await accept(saved.token, "none")).toEqual({ ok: true });
    expect(Number((await prisma.offer.findUniqueOrThrow({ where: { id: old.id } })).setupFee)).toBe(2190);
  });
});
