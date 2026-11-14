// Kollegen empfehlen (Ole, 14.11.2026): Rabatt auf die Einrichtung für Empfohlene,
// Prämie „Bestandskunden-Modul gratis“ für Empfehler, Texte aus den Einstellungen.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  benefitSentence,
  defaultShareText,
  referralIncentiveSentence,
  referralOfferLines,
  rewardAmount,
  rewardSentence,
  setupDiscountAmount,
  setupDiscountDecision,
  setupDiscountLabel,
  type ReferralSettingsLike,
} from "@/lib/kollegen-shared";
import { applySetupDiscount, computeOfferPrice, offerSetupDiscount, resolveOfferChoice, setupForChoice } from "@/lib/offer-pricing";

const nb = (s: string) => s.replace(/ /g, " ");
const ole: ReferralSettingsLike = { ...DEFAULT_SETTINGS, benefitKind: "setup_discount", benefitAmount: 300, rewardKind: "bestand", rewardMonths: 3 };
const products = [{ name: "TKV-Katze", dailyBudget: 30 }];

describe("Texte aus den Einstellungen", () => {
  it("Oles Einstellung: zwei Kurztexte und der Satz", () => {
    expect(referralOfferLines(ole)).toEqual({ kollege: "300 € weniger Einrichtung", sie: "3 Monate Bestandskunden-Modul gratis" });
    expect(nb(referralIncentiveSentence(ole))).toBe("Ihr Kollege spart 300 € bei der Einrichtung. Sie bekommen 3 Monate das Bestandskunden-Modul gratis.");
    expect(nb(benefitSentence(ole)!)).toBe("Als Empfehlung sparen Sie 300 € bei der Einrichtung.");
    expect(nb(benefitSentence(ole, "Erna Empfehler")!)).toBe("Als Empfehlung von Erna Empfehler sparen Sie 300 € bei der Einrichtung.");
    expect(nb(defaultShareText("Erna", "https://x.test/empfehlen/abc", ole))).toContain("Über diesen Link gibt es 300 € Rabatt auf die Einrichtung.");
  });

  it("andere Prämienarten: 1 Monat gratis bzw. fester Betrag", () => {
    expect(referralOfferLines({ ...ole, rewardKind: "month" }).sie).toBe("1 Monat gratis");
    expect(nb(referralOfferLines({ ...ole, rewardKind: "fixed", rewardFixed: 150 }).sie)).toBe("150 € Gutschrift");
    expect(referralOfferLines({ ...ole, rewardMonths: 1 }).sie).toBe("1 Monat Bestandskunden-Modul gratis");
    expect(referralOfferLines({ ...ole, benefitKind: "none" }).kollege).toBeNull();
    expect(referralOfferLines({ ...ole, benefitKind: "custom", benefitText: "Ein Gratis-Workshop" }).kollege).toBe("Ein Gratis-Workshop");
  });

  it("Code-Standard: Prämie Bestandskunden-Modul 3 Monate, Hinweise aus", () => {
    expect(DEFAULT_SETTINGS.rewardKind).toBe("bestand");
    expect(DEFAULT_SETTINGS.rewardMonths).toBe(3);
    expect(DEFAULT_SETTINGS.nudgesEnabled).toBe(false);
    // Betragsoption ohne Betrag → Standard 300 €
    expect(setupDiscountAmount({ ...DEFAULT_SETTINGS, benefitKind: "setup_discount" })).toBe(300);
    expect(setupDiscountAmount({ ...DEFAULT_SETTINGS, benefitKind: "custom", benefitText: "500€ Rabatt auf die Einrichtung" })).toBeNull();
  });

  it("Prämienbetrag „bestand“ = Monate × Modulpreis; Satz nennt die Monate", () => {
    expect(rewardAmount(ole, 1400, 149)).toBe(447);
    expect(rewardAmount(ole, 1400, null)).toBeNull();
    expect(rewardSentence(ole, null)).toContain("3 Monate das Bestandskunden-Modul gratis");
  });

  it("keine Gedankenstriche in den erzeugten Texten", () => {
    const texts = [referralIncentiveSentence(ole), benefitSentence(ole, "X")!, rewardSentence(ole, 1000), referralOfferLines(ole).kollege!, referralOfferLines(ole).sie, setupDiscountLabel("Erna Empfehler")];
    for (const t of texts) expect(t).not.toMatch(/[–—]| - /);
  });
});

describe("Rabatt auf die Einrichtung (Preisrechnung)", () => {
  it("alle 3 Laufzeiten: 2.490 → 2.190, 1.990 → 1.690, 990 → 690", () => {
    expect(computeOfferPrice({ term: "none", products, setupDiscount: 300 })).toMatchObject({ setupFee: 2190, listSetup: 2490, setupDiscount: 300 });
    expect(computeOfferPrice({ term: "3m", products, setupDiscount: 300 })).toMatchObject({ setupFee: 1690, setupDiscount: 300 });
    expect(computeOfferPrice({ term: "12m", products, setupDiscount: 300 })).toMatchObject({ setupFee: 690, setupDiscount: 300 });
    expect(setupForChoice("12m", 2, 300)).toBe(990 + 990 - 300);
  });

  it("nie unter 0; günstigere Sonderkondition gilt allein (kein Addieren)", () => {
    expect(applySetupDiscount(990, null, 1500)).toEqual({ fee: 0, discount: 990 });
    expect(applySetupDiscount(990, 500, 300)).toEqual({ fee: 500, discount: 0 });
    expect(applySetupDiscount(990, 800, 300)).toEqual({ fee: 690, discount: 300 });
    expect(applySetupDiscount(990, 690, 300)).toEqual({ fee: 690, discount: 0 });
    expect(applySetupDiscount(990, null, 0)).toEqual({ fee: 990, discount: 0 });
  });

  it("Kundenwahl der Laufzeit rechnet den Rabatt neu", () => {
    const snap = { term: "12m", productCount: 1, setupFee: 690, startIso: null, annualPrepay: false, annualFreeMonths: null, choosesTerm: true, choosesStart: false, setupDiscount: 300, setupListFee: 990 };
    expect(resolveOfferChoice(snap, { term: "none" }, "2026-11-14")).toMatchObject({ ok: true, setupFee: 2190, setupListFee: 2490 });
    expect(resolveOfferChoice(snap, { term: "3m" }, "2026-11-14")).toMatchObject({ ok: true, setupFee: 1690, setupListFee: 1990 });
    expect(resolveOfferChoice({ ...snap, choosesTerm: false }, {}, "2026-11-14")).toMatchObject({ ok: true, setupFee: 690, setupListFee: 990 });
  });

  it("Rabattzeile eines gespeicherten Angebots", () => {
    expect(offerSetupDiscount({ setupFee: 690, setupListFee: 990, setupDiscount: 300 })).toEqual({ list: 990, discount: 300 });
    expect(offerSetupDiscount({ setupFee: 990, setupListFee: null, setupDiscount: null })).toBeNull();
  });
});

describe("Missbrauch: wann gibt es den Rabatt automatisch?", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  const base = { amount: 300, referral: { status: "open", existingContact: false, createdAt: new Date("2026-11-01T12:00:00Z") }, contactIsCustomer: false, selfReferral: false, offerBefore: false, now };
  it.each([
    ["ok", {}, true],
    ["Option aus", { amount: null }, false],
    ["blockiert", { referral: { ...base.referral, status: "blocked" } }, false],
    ["Selbstempfehlung", { selfReferral: true }, false],
    ["schon Kunde", { contactIsCustomer: true }, false],
    ["Kontakt war schon da", { referral: { ...base.referral, existingContact: true } }, false],
    ["Angebot vorher", { offerBefore: true }, false],
    ["älter als 12 Monate", { referral: { ...base.referral, createdAt: new Date("2025-11-01T12:00:00Z") } }, false],
  ])("%s", (_name, patch, ok) => {
    expect(setupDiscountDecision({ ...base, ...patch } as typeof base).ok).toBe(ok);
  });

  it("Zeile mit bzw. ohne Namen", () => {
    expect(setupDiscountLabel("Erna Empfehler")).toBe("Empfehlungsrabatt (empfohlen von Erna Empfehler)");
    expect(setupDiscountLabel(null)).toBe("Empfehlungsrabatt");
  });
});
