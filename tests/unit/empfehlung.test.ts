import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXTS,
  bookingTerms,
  classifyHeuristic,
  isUnhappyTask,
  moduleState,
  normalizeGoogleUrl,
  renderText,
  shareText,
  showNewBadge,
  trialAvailable,
  UNHAPPY_TASK,
  validateText,
} from "@/lib/empfehlung/shared";
import { referralBlocker, sendingWindow } from "@/lib/empfehlung/requests";
import { PRICE_LIST, computeOfferPrice, offerAddOns } from "@/lib/offer-pricing";
import { EMPFEHLUNG_PURPOSES, purposesFor, templateBodyFor } from "@/lib/whatsapp/template-plan";
import { SUGGESTED_TEMPLATE_TEXT } from "@/lib/whatsapp/templates";

const base = { empfehlungEnabled: true, empfehlungMonthly: null, empfehlungTrialEndsAt: null, empfehlungFree: false, empfehlungCancelAt: null, empfehlungSince: null };
const NOW = new Date("2026-11-17T10:00:00Z");

describe("Empfehlungen & Bewertungen – Regeln", () => {
  it("Preis und Testphase stehen in der Preisliste", () => {
    expect(PRICE_LIST.empfehlungModuleMonthly).toBe(59);
    expect(PRICE_LIST.empfehlungTrialDays).toBe(30);
  });

  it("Nachfrage: erst direkter Draht, dann Google-Link – in Standardtext und Vorlage", () => {
    const t = renderText(DEFAULT_TEXTS.review, { vorname: "Julia", link: "LINK", vertreter: "Max Muster" });
    expect(t.startsWith("Hallo Julia")).toBe(true);
    expect(t.indexOf("antworten Sie mir einfach direkt hier")).toBeLessThan(t.indexOf("LINK"));
    expect(t).toContain("Max Muster");
    const tpl = templateBodyFor("review_request", "Max Muster");
    expect(tpl.indexOf("direkt hier")).toBeLessThan(tpl.indexOf("{{2}}"));
    // Keine Vorab-Frage nach Zufriedenheit, die über den Link entscheidet
    expect(SUGGESTED_TEMPLATE_TEXT.review_request).not.toMatch(/1 bis 5|Sterne/);
  });

  it("Dank bei Lob ohne zweiten Link; Dank an Empfehlende ohne Prämie", () => {
    expect(DEFAULT_TEXTS.thanks).not.toContain("{Link}");
    expect(DEFAULT_TEXTS.referralThanks).not.toMatch(/prämie|gutschein|geschenk|€/i);
  });

  it("eigene Texte: Link-Platzhalter Pflicht, keine Prämien", () => {
    expect(validateText("review", "Hallo {Vorname}")).toMatch(/\{Link\}/);
    expect(validateText("review", "Hallo {Vorname}, hier: {Link}")).toBeNull();
    expect(validateText("referral", "Empfehlen Sie mich: {empfehlungslink}")).toBeNull();
    expect(validateText("referral", "Für jede Empfehlung gibt es einen Gutschein: {Link}")).toMatch(/Prämien/);
    expect(validateText("thanks", "")).toBeNull();
  });

  it("{empfehlungslink} wird wie {Link} ersetzt", () => {
    expect(renderText("Hier: {empfehlungslink}", { vertreter: "X", link: "https://a/b" })).toBe("Hier: https://a/b");
  });

  it("Antworten ohne KI: Kritik wird erkannt, im Zweifel nicht positiv", () => {
    expect(classifyHeuristic("Leider bin ich enttäuscht, keiner hat sich gemeldet")).toBe("negative");
    expect(classifyHeuristic("Ich möchte kündigen")).toBe("negative");
    expect(classifyHeuristic("Alles super, danke!")).toBe("positive");
    expect(classifyHeuristic("Wann kommt die Police?")).toBe("neutral");
    expect(classifyHeuristic("Danke, aber wann kommt die Police?")).toBe("neutral");
  });

  it("Empfehlungsanfrage: nicht bei Kritik oder offener Aufgabe „unzufrieden“", () => {
    const lead = { status: "Abschluss", followUpNote: null, erasedAt: null };
    expect(referralBlocker({ status: "answered", sentiment: "positive" }, lead)).toBeNull();
    expect(referralBlocker({ status: "sent", sentiment: null }, lead)).toBeNull();
    expect(referralBlocker({ status: "answered", sentiment: "negative" }, lead)).toEqual({ skip: "Kritik geäußert" });
    expect(referralBlocker({ status: "sent", sentiment: null }, { ...lead, followUpNote: `${UNHAPPY_TASK}: „x“` })).toMatchObject({ wait: expect.any(String) });
    expect(referralBlocker({ status: "off", sentiment: null }, lead)).toMatchObject({ skip: expect.any(String) });
    expect(isUnhappyTask(`${UNHAPPY_TASK}: x`)).toBe(true);
  });

  it("Modulstand und Testphase", () => {
    expect(moduleState({ ...base, empfehlungEnabled: false })).toBe("inactive");
    expect(moduleState({ ...base, empfehlungTrialEndsAt: new Date(NOW.getTime() + 1000) }, NOW)).toBe("trial");
    expect(moduleState({ ...base, empfehlungMonthly: 59 }, NOW)).toBe("active");
    expect(moduleState({ ...base, empfehlungFree: true }, NOW)).toBe("free");
    expect(moduleState({ ...base, empfehlungCancelAt: NOW }, NOW)).toBe("cancelling");
    expect(trialAvailable(base)).toBe(true);
    expect(trialAvailable({ ...base, empfehlungSince: NOW })).toBe(false);
  });

  it("Buchungsbedingungen nennen Testphase, Preis danach und Erinnerung", () => {
    const t = bookingTerms({ trial: true, annual: false, now: NOW });
    expect(t.lines.join(" ")).toMatch(/30 Tage kostenlos/);
    expect(t.lines.join(" ")).toMatch(/59\s€ netto/);
    expect(t.lines.join(" ")).toMatch(/erinnern/);
    expect(bookingTerms({ trial: false, annual: true }).lines.join(" ")).toMatch(/Abrechnungsjahres/);
  });

  it("Google-Link nur https", () => {
    expect(normalizeGoogleUrl("https://g.page/r/abc/review")).toBe("https://g.page/r/abc/review");
    expect(normalizeGoogleUrl("http://g.page/r/abc")).toBeNull();
    expect(normalizeGoogleUrl("javascript:alert(1)")).toBeNull();
  });

  it("Versand nur Mo–Sa 9–19 Uhr (Berlin)", () => {
    expect(sendingWindow(new Date("2026-11-17T10:00:00Z"))).toBe(true);
    expect(sendingWindow(new Date("2026-11-15T10:00:00Z"))).toBe(false); // Sonntag
    expect(sendingWindow(new Date("2026-11-17T19:30:00Z"))).toBe(false);
  });

  it("Angebot: Modul buchbar, im Gesamtpreis enthalten", () => {
    const p = computeOfferPrice({ term: "12m", products: [{ name: "TKV", dailyBudget: 50 }], empfehlungModule: true });
    expect(p.empfehlungFee).toBe(59);
    expect(p.monthlyTotal).toBe(p.monthlyFee! + 59);
    expect(computeOfferPrice({ package: "service", term: "12m", products: [{ name: "TKV", dailyBudget: 50 }], empfehlungModule: true }).empfehlungFee).toBe(0);
    const a = offerAddOns({ monthlyFee: 1000, seats: null, seatsIncluded: null, seatMonthly: null, bestandMonthly: null, empfehlungMonthly: 59, annualPrepay: false, annualFreeMonths: null });
    expect(a.monthlyTotal).toBe(1059);
    expect(a.empfehlungActive).toBe(true);
  });

  it("WhatsApp-Vorlagen des Moduls nur mit Modul", () => {
    for (const p of EMPFEHLUNG_PURPOSES) {
      expect(purposesFor({ bestand: false })).not.toContain(p);
      expect(purposesFor({ bestand: false, empfehlung: true })).toContain(p);
    }
  });

  it("Teilen-Text enthält Link, „Neu“ nur 30 Tage", () => {
    expect(shareText("Max", "https://x/y/kontakt")).toContain("https://x/y/kontakt");
    expect(showNewBadge(new Date("2026-11-20T10:00:00Z"))).toBe(true);
    expect(showNewBadge(new Date("2027-01-20T10:00:00Z"))).toBe(false);
  });
});
