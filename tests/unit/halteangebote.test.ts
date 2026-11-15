// Halteangebote (Ole, 15.11.2026): Rabatt-Regeln (Kundendauer, 12 Monate), Bindung nach dem Nachlass, Vorschlag der
// Sparte mit der besten Abschlussquote, Einstellungen, Texte und Statistik.
import { describe, expect, it } from "vitest";
import { EMPFEHLUNG_MODULE_AVAILABLE } from "@/lib/empfehlung/shared";
import { HALTE_KINDS } from "@/lib/anti-churn";
import {
  addMonthsIso,
  commitEndIso,
  discountEligibility,
  HALTE_DEFAULTS,
  halteOfferView,
  halteStats,
  isDiscountOffer,
  laterIso,
  normalizeHalteSettings,
  suggestSparte,
} from "@/lib/halteangebote";
import { cancelDateText, type CancelDate } from "@/lib/vertrag-laufzeit";

const s = HALTE_DEFAULTS;

describe("Rabatt-Regeln", () => {
  it("erst ab 3 Monaten Kundendauer", () => {
    expect(discountEligibility({ startIso: "2026-08-16", todayIso: "2026-11-15", lastDiscountIso: null, s })).toMatchObject({ ok: false, why: "kundendauer" });
    expect(discountEligibility({ startIso: "2026-08-15", todayIso: "2026-11-15", lastDiscountIso: null, s })).toEqual({ ok: true });
    expect(discountEligibility({ startIso: null, todayIso: "2026-11-15", lastDiscountIso: null, s })).toMatchObject({ ok: false, why: "kein_start" });
    expect(discountEligibility({ startIso: "2026-12-01", todayIso: "2026-11-15", lastDiscountIso: null, s })).toMatchObject({ ok: false, why: "kein_start" });
  });

  it("höchstens einmal in 12 Monaten", () => {
    const base = { startIso: "2025-01-01", todayIso: "2026-11-15", s };
    expect(discountEligibility({ ...base, lastDiscountIso: "2025-11-16" })).toMatchObject({ ok: false, why: "zuletzt" });
    expect(discountEligibility({ ...base, lastDiscountIso: "2025-11-15" })).toEqual({ ok: true });
    expect(discountEligibility({ ...base, lastDiscountIso: "2026-06-01" }).ok).toBe(false);
  });

  it("nicht bei jährlicher Vorauszahlung; Grenzen aus den Einstellungen", () => {
    expect(discountEligibility({ startIso: "2025-01-01", todayIso: "2026-11-15", lastDiscountIso: null, annual: true, s })).toMatchObject({ ok: false, why: "jahreszahlung" });
    const loose = { ...s, minTenureMonths: 0, cooldownMonths: 0 };
    expect(discountEligibility({ startIso: "2026-11-15", todayIso: "2026-11-15", lastDiscountIso: "2026-11-15", s: loose })).toEqual({ ok: true });
  });

  it("Monate addieren wie Fristen (Monatsletzter)", () => {
    expect(addMonthsIso("2026-08-15", 3)).toBe("2026-11-15");
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-03-01");
    expect(addMonthsIso("2026-05-10", 0)).toBe("2026-05-10");
  });

  it("was als Rabatt zählt", () => {
    expect(isDiscountOffer("rabatt", s, true)).toBe(true);
    expect(isDiscountOffer("pause_gratis", s, true)).toBe(true);
    expect(isDiscountOffer("neustart", s, true)).toBe(true);
    expect(isDiscountOffer("neustart", s, false)).toBe(false);
    expect(isDiscountOffer("neustart", { ...s, neustartFreeMonths: 0 }, true)).toBe(false);
    expect(isDiscountOffer("neuausrichtung", s, true)).toBe(true);
    expect(isDiscountOffer("neuausrichtung", { ...s, gutschriftOn: false }, true)).toBe(false);
    for (const k of ["produktwechsel", "einrichtung", "nur_bestand"] as const) expect(isDiscountOffer(k, s, true)).toBe(false);
  });
});

describe("Bindung nach dem Nachlass", () => {
  it("laufender Abrechnungsmonat + 2 Monate Nachlass + 3 Monate", () => {
    // Start 01.08.: laufender Monat bis 30.11., Nachlass Dezember und Januar, danach Februar bis April
    expect(commitEndIso({ startIso: "2026-08-01", todayIso: "2026-11-15", months: 2, commitMonths: 3 })).toBe("2027-04-30");
    // Start 20.10.: laufender Monat 20.10. bis 19.11.
    expect(commitEndIso({ startIso: "2026-10-20", todayIso: "2026-11-15", months: 2, commitMonths: 3 })).toBe("2027-04-19");
    // Am letzten Tag eines Abrechnungsmonats zählt dieser noch als laufend
    expect(commitEndIso({ startIso: "2026-08-01", todayIso: "2026-11-30", months: 2, commitMonths: 3 })).toBe("2027-04-30");
  });

  it("ohne Start: Kalendermonate", () => {
    expect(commitEndIso({ startIso: null, todayIso: "2026-11-15", months: 2, commitMonths: 3 })).toBe("2027-04-30");
    expect(commitEndIso({ startIso: null, todayIso: "2026-11-15", months: 1, commitMonths: 0 })).toBe("2026-12-31");
  });

  it("Kündigungstermin ist der spätere Tag", () => {
    expect(laterIso("2026-11-30", "2027-04-30")).toBe("2027-04-30");
    expect(laterIso("2027-05-31", "2027-04-30")).toBe("2027-05-31");
    expect(laterIso("2026-11-30", null)).toBe("2026-11-30");
    const c: CancelDate = { effectiveIso: "2027-04-30", reason: "halteangebot", minTermEndIso: null, deadlineIso: null, missedDeadline: false };
    expect(cancelDateText(c, "2026-08-01")).toBe("Ihr Vertrag endet am 30.04.2027, zum Ende der Mindestlaufzeit, die Sie mit dem Nachlass vereinbart haben.");
  });
});

describe("Spartenwechsel: beste Abschlussquote über alle Kunden", () => {
  const rows = [
    { key: "Katze", label: "Katze", leads: 400, closes: 40 }, // 10 %
    { key: "Hund", label: "Hund", leads: 200, closes: 30 }, // 15 %
    { key: "PKV", label: "PKV", leads: 20, closes: 8 }, // 40 %, zu wenig Daten
    { key: "Zahn", label: "Zahn", leads: 100, closes: 12 }, // 12 %
  ];
  it("höchste Quote mit Mindest-Stichprobe, nicht die eigene Sparte", () => {
    expect(suggestSparte(rows, ["Katze"], 30)).toEqual({ key: "Hund", label: "Hund", rate: 0.15, leads: 200 });
    expect(suggestSparte(rows, ["Katze"], 10)?.key).toBe("PKV");
    expect(suggestSparte(rows, ["Hund"], 30)).toBeNull(); // nichts ist besser als die eigene
    expect(suggestSparte(rows, ["Zahn"], 30)?.key).toBe("Hund");
  });
  it("ohne eigene Sparte bzw. ohne Daten", () => {
    expect(suggestSparte(rows, [], 30)?.key).toBe("Hund");
    expect(suggestSparte([], ["Katze"], 30)).toBeNull();
    expect(suggestSparte([{ key: "X", label: "X", leads: 50, closes: 0 }], [], 30)).toBeNull();
  });
});

describe("Einstellungen, Texte, Statistik", () => {
  it("normalisiert gespeicherte Werte mit Standard und Grenzen", () => {
    expect(normalizeHalteSettings(null)).toEqual(HALTE_DEFAULTS);
    const n = normalizeHalteSettings({ rabattPercent: 250, rabattMonths: "3", rabattOn: false, nurBestandPrice: "89,5", pauseMaxMonths: -1, foo: 1 });
    expect(n).toMatchObject({ rabattPercent: 100, rabattMonths: 3, rabattOn: false, nurBestandPrice: 89.5, pauseMaxMonths: 1 });
    expect(n).not.toHaveProperty("foo");
  });

  it("Texte je Angebot: Sie-Form, ohne Gedankenstriche und ohne „Garantie“", () => {
    const ctx = { s, discountOk: true, commitIso: "2027-04-30", suggestion: { key: "Hund", label: "Hund", rate: 0.15, leads: 200 }, todayIso: "2026-11-15", einrichtungSlots: true, referralHint: "Empfehlen Sie uns weiter." };
    for (const k of HALTE_KINDS) {
      const v = halteOfferView(k, ctx);
      expect(`${v.title} ${v.text} ${v.cta} ${v.confirm ?? ""}`).not.toMatch(/[–—]|garantie|\bdu\b|\bdein/i);
    }
    expect(halteOfferView("rabatt", ctx).text).toContain("mindestens bis zum 30.04.2027");
    expect(halteOfferView("rabatt", ctx).confirm).toContain("30.04.2027");
    expect(halteOfferView("neustart", ctx).text).toContain("einen Monat kostenlos");
    expect(halteOfferView("neustart", { ...ctx, discountOk: false }).text).not.toContain("kostenlos");
    expect(halteOfferView("neuausrichtung", { ...ctx, discountOk: false }).text).not.toContain("Gutschrift");
    expect(halteOfferView("produktwechsel", ctx).text).toContain("Hund");
    expect(halteOfferView("produktwechsel", { ...ctx, suggestion: null }).text).toContain("besserer Abschlussquote");
    expect(halteOfferView("pause_gratis", ctx)).toMatchObject({ form: "pause", pauseFrom: "2026-11-15", pauseMaxUntil: "2027-02-15" });
    expect(halteOfferView("einrichtung", { ...ctx, einrichtungSlots: false }).form).toBe("simple");
    expect(halteOfferView("nur_bestand", ctx).title.replace(/\s/g, " ")).toBe("Paket „Nur Bestand“ für 149 € netto im Monat");
    // Empfehlungen-Modul nur erwähnen, solange es buchbar ist (Ole, 15.11.2026: vorerst aus)
    expect(halteOfferView("nur_bestand", ctx).text.replace(/\s/g, " ").includes("für 59 € netto im Monat dazu")).toBe(EMPFEHLUNG_MODULE_AVAILABLE);
    expect(HALTE_DEFAULTS.nurBestandPrice).toBe(149);
    expect(halteOfferView("nur_bestand", ctx).hint?.href).toBe("/buyer/empfehlen");
  });

  it("Statistik: angenommen je Grund, geretteter Monatsbetrag, später gekündigt", () => {
    const at = new Date("2026-11-15T10:00:00Z");
    const st = halteStats([
      { reason: "zu_teuer", kind: "rabatt", mrrSaved: 1000, cancelledLaterAt: null, createdAt: at },
      { reason: "zu_teuer", kind: "rabatt", mrrSaved: 1400, cancelledLaterAt: at, createdAt: at },
      { reason: "aufhoeren", kind: "nur_bestand", mrrSaved: 99, cancelledLaterAt: null, createdAt: at },
    ]);
    expect(st).toMatchObject({ accepted: 3, savedMrr: 2499, cancelledLater: 1, stillSavedMrr: 1099 });
    expect(st.byReason[0]).toEqual({ key: "zu_teuer", accepted: 2, savedMrr: 2400, cancelledLater: 1, stillSavedMrr: 1000 });
    expect(st.byKind.find((g) => g.key === "nur_bestand")).toMatchObject({ accepted: 1, savedMrr: 99 });
  });
});
