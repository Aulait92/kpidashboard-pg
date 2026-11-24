// Paket „Pay-per-Lead + Software“ (Ole, 19.11.2026): Software 349 € netto im Monat, keine Einrichtung, ohne
// Mindestlaufzeit (monatlich kündbar), Leads separat per Stück (Pay-per-Lead), keine Betreuung, keine Kampagnen, kein
// Werbebudget, keine Garantien. Geprüft: Preis, Laufzeitwahl, Paketname, Nachrichten wie Betreuung + Software (nie als
// reiner Pay-per-Lead-Kunde gesperrt), Angebotstext, Annahme, Einrichtungsschritte, Willkommens-Mail.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const sent: { text: string; html: string }[] = [];
vi.mock("@/lib/mail-guard", () => ({
  mailClient: () => ({ emails: { send: async (m: { text: string; html: string }) => (sent.push(m), { error: null }) } }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/app/angebot/[token]/actions", () => ({ acceptOfferAction: async () => ({}) }));

import { computeOfferPrice, PACKAGE_LABEL, PRICE_LIST, resolveOfferChoice, setupForChoice, termOptionsFor, mitKampagnen, mitSoftware, normalizePackage } from "@/lib/offer-pricing";
import { istNurPayPerLead, mitCrm, NUR_PPL_WHERE, packageLabel } from "@/lib/customer-package";
import { contractSummaryLines, type ContractSummaryInput } from "@/lib/vertrag-laufzeit";
import { OfferDocument, type OfferDoc } from "@/components/offer-document";
import { AcceptForm, type OfferChoiceProps } from "@/app/angebot/[token]/accept-form";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { onboardingChecklist, type OnboardingFull } from "@/lib/onboarding";
import { setupSteps } from "@/lib/selbst-einrichtung";
import { sendOnboardingWelcomeEmail } from "@/lib/email";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

describe("Preis Pay-per-Lead + Software", () => {
  it("349 € netto im Monat, keine Einrichtung, kein Werbebudget, keine Vorauszahlung", () => {
    const p = computeOfferPrice({ package: "ppl_software", term: "12m", products: [{ name: "TKV-Katze", dailyBudget: 50 }], setupOverride: 500, setupDiscount: 200, annual: true });
    expect(p).toMatchObject({ setupFee: 0, listSetup: 0, setupDiscount: 0, monthlyFee: 349, softwareFee: 349, monthlyTotal: 349, monthlyBudget: 0, annual: false, annualTotal: null, individual: false });
    expect(PRICE_LIST.softwareFee).toBe(349);
  });
  it("Verkäufer und Module wie im Software-Paket: 3 inklusive, weitere 49 €, Module dazubuchbar", () => {
    const p = computeOfferPrice({ package: "ppl_software", term: "none", products: [], seats: 5, bestandModule: true, empfehlungModule: true });
    expect(p).toMatchObject({ seatsIncluded: 3, extraSeats: 2, seatsFee: 98, bestandFee: 149, empfehlungFee: 59, monthlyTotal: 349 + 98 + 149 + 59 });
  });
  it("Sonderkondition Monatspreis bleibt möglich, Software-Anteil = Monatspreis", () => {
    expect(computeOfferPrice({ package: "ppl_software", term: "none", products: [], monthlyOverride: 299 })).toMatchObject({ monthlyFee: 299, softwareFee: 299 });
  });
  it("Paketname und Helfer", () => {
    expect(PACKAGE_LABEL.ppl_software).toBe("Pay-per-Lead + Software");
    expect(normalizePackage("ppl_software")).toBe("ppl_software");
    expect(normalizePackage("quatsch")).toBe("software");
    expect([mitSoftware("ppl_software"), mitKampagnen("ppl_software"), mitSoftware("service"), mitKampagnen("software")]).toEqual([true, false, false, true]);
  });
});

describe("Laufzeitwahl", () => {
  // Ole, 20.11.2026: 3 Monate gestrichen (kein Vorteil für den Kunden), nur monatlich kündbar
  it("nur ohne Laufzeit, ohne Einrichtung", () => {
    expect(termOptionsFor(new Date(), "none", "ppl_software")).toEqual(["none"]);
    expect(setupForChoice("none", 1, null, "ppl_software")).toBe(0);
    expect(setupForChoice("3m", 1)).toBe(PRICE_LIST.setup3m);
  });
  it("Server prüft: 3 und 12 Monate abgelehnt, ohne Laufzeit ohne Setup", () => {
    const snap = { term: "none", productCount: 1, setupFee: 0, startIso: null, annualPrepay: false, annualFreeMonths: null, choosesTerm: true, choosesStart: false, termOptions: termOptionsFor(new Date(), "none", "ppl_software"), package: "ppl_software" };
    expect(resolveOfferChoice(snap, { term: "12m" }, "2026-11-19").ok).toBe(false);
    expect(resolveOfferChoice(snap, { term: "3m" }, "2026-11-19").ok).toBe(false);
    expect(resolveOfferChoice(snap, { term: "none" }, "2026-11-19")).toMatchObject({ ok: true, term: "none", setupFee: 0 });
  });
});

describe("Paketname und Nachrichten (nie als reiner Pay-per-Lead-Kunde gesperrt)", () => {
  /** Mini-Auswertung von NUR_PPL_WHERE für einen Kunden (gleiche Bedingungen wie in Prisma). */
  const passtNurPpl = (c: { plan: string; retainerMonthly: number | null; onboarding: { id: string } | null }) => {
    // Zwei Zweige (24.11.2026): Paket „Nur Leads“ immer, sonst reine Pay-per-Lead-Kunden ohne Onboarding und Gebühr
    const [nurLeads, rein] = (NUR_PPL_WHERE as { OR: [{ plan: string }, { plan: { notIn: string[] }; onboarding: { is: null } }] }).OR;
    if (c.plan === nurLeads.plan) return true;
    return !rein.plan.notIn.includes(c.plan) && c.onboarding === null && (c.retainerMonthly == null || c.retainerMonthly <= 0);
  };
  it("packageLabel liefert „Pay-per-Lead + Software“, mit CRM", () => {
    expect(packageLabel({ plan: "ppl_software", retainerMonthly: 349, onboarding: { id: "o" } })).toBe("Pay-per-Lead + Software");
    expect(mitCrm({ plan: "ppl_software", retainerMonthly: 349, onboarding: { id: "o" } })).toBe(true);
    // Reiner Pay-per-Lead-Kunde bleibt, wie er ist
    expect(packageLabel({ plan: "software", retainerMonthly: null, onboarding: null })).toBe("Pay-per-Lead");
  });
  it("istNurPayPerLead (Mail-Strecke) und NUR_PPL_WHERE (Erinnerungen, Telefonat, Nachfassen, Monatsbericht, Neuigkeiten, Policen-Flow, Empfehlungs-Hinweis) sperren das Paket nie", () => {
    // Auch ohne Onboarding und ohne Betreuungsgebühr (z. B. von Hand angelegt): das Paket zählt nie als reines Pay-per-Lead
    for (const c of [
      { plan: "ppl_software", retainerMonthly: 349, onboarding: { id: "o" } },
      { plan: "ppl_software", retainerMonthly: null, onboarding: null },
    ]) {
      expect(istNurPayPerLead(c)).toBe(false);
      expect(passtNurPpl(c)).toBe(false);
    }
    expect(passtNurPpl({ plan: "software", retainerMonthly: null, onboarding: null })).toBe(true);
    expect(istNurPayPerLead({ plan: "software", retainerMonthly: null, onboarding: null })).toBe(true);
    // „Nur Leads“ (24.11.2026): ohne CRM, also wie reine Pay-per-Lead-Kunden keine CRM-Erinnerungen
    expect(passtNurPpl({ plan: "ppl", retainerMonthly: 0, onboarding: { id: "o" } })).toBe(true);
    expect(istNurPayPerLead({ plan: "ppl", retainerMonthly: 0, onboarding: { id: "o" } })).toBe(true);
  });
});

describe("Auftragsbestätigung und Annahme", () => {
  const base: ContractSummaryInput = { term: "none", startIso: "2026-12-01", setup: 0, monthlyTotal: 349, intro: null, annual: false, freeMonths: 0, paket: "ppl_software" };
  it("Paket, 349 €, monatlich kündbar, Leads separat, ohne Gedankenstriche", () => {
    const t = contractSummaryLines(base).join(" ");
    expect(t).toMatch(/Paket: Pay-per-Lead \+ Software/);
    expect(t).toMatch(/ohne Einrichtungsgebühr/);
    expect(t).toMatch(/Monatlich: 349\s€ netto ab 01\.12\.2026/);
    expect(t).toMatch(/Ohne Mindestlaufzeit/);
    expect(t).toMatch(/per Stück \(Pay-per-Lead\)/);
    expect(t).not.toMatch(/Werbebudget|Garantie|Betreuung \+/);
    expect(hatGedankenstrich(t)).toBe(false);
  });
  it("3 Monate", () => {
    expect(contractSummaryLines({ ...base, term: "3m" }).join(" ")).toMatch(/Mindestlaufzeit 3 Monate bis 28\.02\.2027/);
  });
  it("Annahme-Formular: keine Setup-Zeile, jetzt 0 € fällig", () => {
    const choice: OfferChoiceProps = {
      choosesTerm: true,
      choosesStart: true,
      initialTerm: "none",
      options: [
        { term: "none", label: "Ohne Laufzeit", setup: 0 },
      ],
      monthlyTotal: 349,
      annualOffered: false,
      freeMonths: 0,
      start: { min: "2026-11-26", max: "2027-02-17", preset: "2026-12-01" },
      ohneEinrichtung: true,
    };
    const t = text(renderToStaticMarkup(createElement(AcceptForm, { token: "tok", termsUrl: "https://a/agb", dpaUrl: "https://a/avv", defaultName: "Paula Pay", pricing: base, choice })));
    expect(t).toMatch(/Jetzt fällig: 0\s€ , keine Einrichtungsgebühr/);
    expect(t).not.toMatch(/Setup/);
    expect(t).not.toMatch(/Einrichtung dauert/);
    expect(t).toMatch(/Pay-per-Lead \+ Software/);
  });
});

describe("Angebotsdokument (Seite und PDF)", () => {
  const doc = (o: Partial<OfferDoc> = {}): OfferDoc => ({
    number: "PG-2026-0700",
    version: 1,
    status: "sent",
    contactName: "Paula Pay",
    company: "Agentur Pay",
    street: null,
    zip: null,
    city: null,
    package: "ppl_software",
    vermittlerTyp: "vertreter",
    term: "none",
    products: [],
    setupFee: 0,
    monthlyFee: 349,
    softwareFee: 349,
    introMonthlyFee: null,
    introMonths: null,
    specialTerms: null,
    startDate: new Date("2026-12-01T12:00:00Z"),
    validUntil: new Date("2026-12-03T12:00:00Z"),
    createdAt: new Date("2026-11-19T16:00:00Z"),
    acceptedAt: null,
    acceptedName: null,
    termsUrl: null,
    dpaUrl: null,
    seats: 3,
    seatsIncluded: 3,
    seatMonthly: 49,
    bestandMonthly: null,
    annualPrepay: false,
    annualFreeMonths: null,
    customerChoosesTerm: true,
    customerChoosesStart: true,
    ...o,
  });
  // Ohne AGB (die AGB beschreiben alle Pakete)
  const angebotstext = (o: Partial<OfferDoc> = {}) => text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc(o) }))).split("Allgemeine Geschäftsbedingungen")[0];

  it("zeigt Paket, 349 €, keine Einrichtung, monatlich kündbar, Leads separat", () => {
    const t = angebotstext();
    expect(t).toMatch(/Pay-per-Lead \+ Software/);
    expect(t).toMatch(/349\s€/);
    expect(t).toMatch(/Keine Einrichtungsgebühr/);
    expect(t).toMatch(/Monatlich kündbar/);
    expect(t).toMatch(/Keine Mindestlaufzeit, monatlich kündbar/);
    expect(t).toMatch(/nicht Teil der Monatsgebühr/);
  });
  it("nichts von Werbebudget, Betreuung als Leistung, Garantie oder Kampagnen; keine Gedankenstriche", () => {
    const t = angebotstext();
    expect(t).not.toMatch(/Werbebudget|Garantie|Break-even|Meta zahlen|Betreuung \+ Software|Leadgenerierung|Setupgebühr/);
    expect(hatGedankenstrich(t)).toBe(false);
  });
  it("3 Monate Laufzeit", () => {
    expect(angebotstext({ term: "3m" })).toMatch(/3 Monate ab Start, danach monatlich kündbar/);
  });
});

describe("Einrichtung und Willkommens-Mail", () => {
  const ob = (pkg: string) =>
    ({
      package: pkg,
      stepSkips: null,
      welcomeSentAt: null,
      questionnaireAt: null,
      metaAccessAt: null,
      consentAt: null,
      consentConfirmedAt: null,
      campaignReadyAt: null,
      websiteCheckedAt: null,
      testLeadAt: null,
      liveAt: null,
      websiteInfo: null,
      customer: {
        users: [],
        calendarConnection: null,
        agentConfig: null,
        whatsAppAccount: null,
        messageTemplates: [],
        reviewSettings: null,
        erstinformation: null,
        mailFeaturesOff: false,
        mailAblauf: null,
        existingCustomersEnabled: false,
        empfehlungEnabled: false,
        seatsBilled: 0,
        _count: { existingCustomers: 0 },
      },
    }) as unknown as OnboardingFull;

  it("Checkliste ohne Meta, Einwilligung, Kampagne, Testlead; WhatsApp und Kalender bleiben", () => {
    const keys = onboardingChecklist(ob("ppl_software"), null).map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(["questionnaire", "calendar", "whatsapp", "erstinfo", "templates", "live"]));
    for (const k of ["metaAccess", "consent", "campaign", "testLead", "website"]) expect(keys).not.toContain(k);
    // Betreuung + Software unverändert
    expect(onboardingChecklist(ob("software"), null).map((i) => i.key)).toEqual(expect.arrayContaining(["metaAccess", "consent", "campaign", "testLead"]));
  });
  it("Einrichtungsschritte (Erinnerungen, Startseite) ohne Meta und Testlead", () => {
    const steps = setupSteps({ package: "ppl_software" }, onboardingChecklist(ob("ppl_software"), null), { appDone: false, provisionDone: false }).map((s) => s.key);
    expect(steps).not.toContain("metaAccess");
    expect(steps).not.toContain("testLead");
    expect(steps).toContain("calendar");
  });
  it("Willkommens-Mail: ohne Meta-Freigabe und Kampagne, Leads separat", async () => {
    process.env.RESEND_API_KEY = "test";
    sent.length = 0;
    await sendOnboardingWelcomeEmail({ to: "p@x.de", greeting: "Hallo Frau Pay,", packageType: "ppl_software", startDate: new Date("2026-12-01T12:00:00Z"), products: [], setPasswordUrl: null, loginUrl: "https://a/login", setupUrl: "https://a/buyer/einrichtung", whatsappSelfConnect: true });
    const t = sent[0].text;
    expect(t).not.toMatch(/Meta|Kampagne|Werbemittel/);
    expect(t).toMatch(/WhatsApp verbinden/);
    expect(t).toMatch(/per Stück \(Pay-per-Lead\)/);
    expect(hatGedankenstrich(t)).toBe(false);
  });
});
