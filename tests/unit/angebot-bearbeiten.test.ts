// Angebotsentwurf bearbeiten (Ole, 20.11.2026): Vorbefüllen des Formulars aus dem Entwurf (lib/offer-form-werte.ts),
// Rundlauf ohne Werteverlust (createOffer → Formular → updateDraftOffer speichert dieselben Werte) und die Regel
// „nur Entwürfe“ (atomar beim Speichern).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  created: [] as Record<string, unknown>[],
  updated: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
  status: "draft" as string | null,
  updateCount: 1,
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    offer: {
      findMany: async () => [],
      aggregate: async () => ({ _max: { version: null } }),
      updateMany: async (p: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        db.updated.push(p);
        return { count: db.updateCount };
      },
      create: async (p: { data: Record<string, unknown> }) => {
        db.created.push(p.data);
        return { id: "off_1", ...p.data };
      },
      findUniqueOrThrow: async () => ({ id: "off_1", number: "PG-2026-0001", token: "t".repeat(32), ...db.updated.at(-1)?.data }),
    },
    salesContact: { update: async () => ({}) },
  };
  return {
    prisma: {
      offer: {
        findFirst: async () => null,
        findUnique: async () => (db.status == null ? null : { id: "off_1", status: db.status, dealId: null, salesContactId: "sc_1" }),
      },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});
vi.mock("@/lib/email", () => ({ getAppUrl: () => "https://app.test", sendCustomerMail: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn() }));
vi.mock("@/lib/onboarding", () => ({ startOnboarding: vi.fn() }));
vi.mock("@/lib/billing", () => ({ billingEnabled: () => false }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/kollegen", () => ({
  referralSetupDiscount: async () => ({ eligible: true, amount: 300, label: "Empfehlungsrabatt (empfohlen von Max Muster)", referralId: "ref_1" }),
}));

import { createOffer, NUR_ENTWURF_BEARBEITEN, updateDraftOffer } from "@/lib/offers";
import { entwurfZuFormWerte, formWerteZuInput, standardFormWerte, type OfferEntwurf, type OfferFormWerte } from "@/lib/offer-form-werte";
import { abschlussBonusStandardTag, addDaysIso, berlinTodayIso, PRICE_LIST } from "@/lib/offer-pricing";

const basis = standardFormWerte({ contactName: "Max Muster", company: "Muster GmbH", email: "max@muster.de", street: "Hauptstr. 1", zip: "80331", city: "München" }, null);
const opts = { referral: false, ueberweisungVerfuegbar: true };

/** Gespeicherte Daten wie eine Zeile aus der Datenbank (Entwurf). */
const zeile = (data: Record<string, unknown>): OfferEntwurf => ({ status: "draft", ...data }) as unknown as OfferEntwurf;

async function rundlauf(w: OfferFormWerte, o = opts) {
  const referral = o.referral ? { amount: 300 } : null;
  await createOffer({ salesContactId: "sc_1" }, formWerteZuInput(w, o), "u_1");
  const erst = db.created.at(-1)!;
  const werte = entwurfZuFormWerte(zeile(erst), referral);
  await updateDraftOffer("off_1", formWerteZuInput(werte, o));
  const neu = db.updated.at(-1)!.data;
  return { erst, neu, werte };
}

/** Konditionen ohne Gültigkeit und ohne das, was nur beim Anlegen entsteht (Nummer, Link, Version, Besitzer). */
function ohneGueltigkeit(d: Record<string, unknown>) {
  const rest = { ...d };
  for (const k of ["validUntil", "number", "token", "version", "createdById", "salesContactId"]) delete rest[k];
  return rest;
}

beforeEach(() => {
  db.created.length = 0;
  db.updated.length = 0;
  db.status = "draft";
  db.updateCount = 1;
});

describe("Entwurf → Formular → Speichern: keine Werte gehen verloren", () => {
  const faelle: [string, OfferFormWerte, typeof opts?][] = [
    [
      "Betreuung + Software mit allen Extras",
      {
        ...basis,
        products: [{ name: "TKV-Katze", daily: "40" }, { name: "TKV-Hund", daily: "20" }],
        term: "12m",
        seats: "5",
        annual: true,
        bestand: true,
        empfehlung: true,
        vermittler: "makler",
        customerChoice: false,
        allowPayLater: true,
        allowBankTransfer: true,
        bankTransferDays: "30",
        bonusBetrag: "250",
        bonusBis: addDaysIso(berlinTodayIso(), 3),
        billingDay: "15",
        billingFree: true,
        specialTerms: "Erster Monat mit **Extra-Betreuung**.\n\nZweiter Absatz.",
        validDays: "10",
      },
    ],
    [
      "Sonderpreise und Startpreis",
      { ...basis, term: "6m", setupOverride: "500", monthlyOverride: "800", introFee: "400", introMonths: "2", bonusAn: false },
    ],
    ["Sonderpreis gleich Listenpreis (Laufzeit fest)", { ...basis, setupOverride: String(PRICE_LIST.setup12m) }],
    ["Produktwahl bewusst abgewählt", { ...basis, customerProducts: false }],
    ["Nur Betreuung", { ...basis, pkg: "service", term: "3m" }],
    ["Zahlung nachträglich", { ...basis, arrears: true, startDate: "2027-01-01" }],
    [
      "Pay-per-Lead + Software mit erster Woche",
      { ...basis, pkg: "ppl_software", term: "none", seats: "4", wocheProdukt: "PKV-Tarifoptimierung", wocheLabel: "PKV Bayern", wochePreis: "17.5", wocheMenge: "30" },
    ],
    ["Testangebot", { ...basis, test: true, specialTerms: "wird ersetzt" }],
    ["Empfehlungsrabatt", { ...basis, discount: "300" }, { referral: true, ueberweisungVerfuegbar: false }],
    ["Empfehlungsrabatt bewusst 0", { ...basis, discount: "0" }, { referral: true, ueberweisungVerfuegbar: false }],
  ];

  for (const [name, w, o] of faelle) {
    it(name, async () => {
      const { erst, neu } = await rundlauf(w, o);
      expect(ohneGueltigkeit(neu)).toEqual(ohneGueltigkeit(erst));
      // Gültigkeit: verbleibende Tage, also (fast) dasselbe Datum
      expect(Math.abs((neu.validUntil as Date).getTime() - (erst.validUntil as Date).getTime())).toBeLessThan(86_400_000);
    });
  }
});

describe("Vorbefüllen", () => {
  it("übernimmt Empfänger, Preise und Bedingungen", async () => {
    const { werte } = await rundlauf({ ...basis, term: "6m", setupOverride: "500", monthlyOverride: "800", introFee: "400", introMonths: "2", validDays: "10" });
    expect(werte).toMatchObject({
      contactName: "Max Muster",
      company: "Muster GmbH",
      email: "max@muster.de",
      street: "Hauptstr. 1",
      zip: "80331",
      city: "München",
      term: "6m",
      setupOverride: "500",
      monthlyOverride: "800",
      introFee: "400",
      introMonths: "2",
      validDays: "10",
      products: [{ name: "TKV-Katze", daily: "30" }],
    });
  });

  it("Pay-per-Lead: erste Woche mit Produkt, Preis und Anzahl", async () => {
    const { werte } = await rundlauf({ ...basis, pkg: "ppl_software", term: "none", wocheProdukt: "PKV-Tarifoptimierung", wochePreis: "17.5", wocheMenge: "30" });
    expect(werte).toMatchObject({ pkg: "ppl_software", wocheProdukt: "PKV-Tarifoptimierung", wochePreis: "17.5", wocheMenge: "30", wocheBrutto: false });
  });

  it("Testangebot: feste Test-Vereinbarung kommt nicht ins Feld", async () => {
    const { werte } = await rundlauf({ ...basis, test: true });
    expect(werte.test).toBe(true);
    expect(werte.specialTerms).toBe("");
  });

  it("abgelaufene Bonusfrist: Vorschlag morgen statt Datum in der Vergangenheit", async () => {
    await createOffer({ salesContactId: "sc_1" }, formWerteZuInput(basis, opts), "u_1");
    const alt = zeile({ ...db.created.at(-1)!, abschlussBonusBis: new Date("2020-01-01T22:59:00Z") });
    expect(entwurfZuFormWerte(alt, null).bonusBis).toBe(abschlussBonusStandardTag());
  });
});

describe("Speichern nur für Entwürfe", () => {
  const eingabe = formWerteZuInput(basis, opts);

  it("aktualisiert an Ort und Stelle: nur solange status draft, ohne neue Nummer, Version oder Link", async () => {
    await updateDraftOffer("off_1", eingabe);
    const u = db.updated.at(-1)!;
    expect(u.where).toEqual({ id: "off_1", status: "draft" });
    expect(u.data).not.toHaveProperty("number");
    expect(u.data).not.toHaveProperty("token");
    expect(u.data).not.toHaveProperty("version");
    expect(u.data).not.toHaveProperty("status");
    expect(db.created).toHaveLength(0);
  });

  for (const status of ["sent", "accepted", "declined", "superseded"]) {
    it(`lehnt ab: ${status}`, async () => {
      db.status = status;
      await expect(updateDraftOffer("off_1", eingabe)).rejects.toThrow(NUR_ENTWURF_BEARBEITEN);
      expect(db.updated).toHaveLength(0);
    });
  }

  it("lehnt ab, wenn das Angebot zwischendurch verschickt wurde (atomar)", async () => {
    db.updateCount = 0;
    await expect(updateDraftOffer("off_1", eingabe)).rejects.toThrow(NUR_ENTWURF_BEARBEITEN);
  });

  it("gleiche Prüfung wie beim Anlegen", async () => {
    await expect(updateDraftOffer("off_1", { ...eingabe, email: "keine-mail" })).rejects.toThrow(/E-Mail/);
    expect(db.updated).toHaveLength(0);
  });

  it("unbekanntes Angebot", async () => {
    db.status = null;
    await expect(updateDraftOffer("off_x", eingabe)).rejects.toThrow("Angebot nicht gefunden.");
  });
});
