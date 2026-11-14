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
  OCCASIONS,
  OFFER_PRESETS,
  REWARD_SAFE_LIMIT,
  followUpNote,
  funnelHint,
  isFollowUpTask,
  isSelfReferral,
  offerWarning,
  resolveOffer,
  resolveReward,
  rewardSentence,
  rewardWarning,
  signatureLine,
  statusUpdateLine,
  statusUpdateText,
  validateOffer,
  validateReward,
  parseRefCode,
  refCodeOf,
  whatsappLink,
  whatsappRequestText,
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

describe("Empfehlungen – Angebot, Anlässe, Trichter, Dankeschön (14.11.2026)", () => {
  it("Angebot: Vorlagen ohne Prämien, Vertreter eingesetzt, „none“ = kein Angebot, Standard = Versicherungs-Check", () => {
    expect(resolveOffer({ offerKind: "none" }, "Max Muster")).toBeNull();
    expect(resolveOffer({ offerKind: null }, "Max Muster")?.headline).toBe(OFFER_PRESETS.ordner.headline);
    const o = resolveOffer({ offerKind: "kfz" }, "Max Muster")!;
    expect(o.headline).toBe(OFFER_PRESETS.kfz.headline);
    expect(o.text).toContain("Max Muster");
    expect(o.text).not.toContain("{Vertreter}");
    for (const p of Object.values(OFFER_PRESETS)) expect(`${p.headline} ${p.text}`).not.toMatch(/gutschein|prämie|€|euro|garant|unabhängig/i);
  });

  it("Eigenes Angebot: keine Prämien, Beträge oder Garantien; Hinweis bei „unabhängig“ nur für Vertreter", () => {
    expect(validateOffer("custom", "", "")).toMatch(/ausfüllen/);
    expect(validateOffer("custom", "Wohngebäude-Check", "Ich prüfe Ihren Vertrag, kostenlos.")).toBeNull();
    expect(validateOffer("custom", "Check mit 50 € Gutschein", "Text")).toMatch(/Prämien/);
    expect(validateOffer("custom", "Check", "Ich finde garantiert etwas.")).toMatch(/Garantien/);
    expect(validateOffer("quatsch", "a", "b")).toMatch(/wählen/);
    expect(resolveOffer({ offerKind: "custom", offerHeadline: "Check mit Gutschein", offerText: "x" }, "M")).toBeNull();
    expect(offerWarning("Unabhängiger Vergleich", "", "vertreter")).toMatch(/gebundener Vertreter/);
    expect(offerWarning("Unabhängiger Vergleich", "", "makler")).toBeNull();
  });

  it("Teilen-Text und Signatur nennen das Angebot", () => {
    const o = resolveOffer({ offerKind: "ordner" }, "Max Muster");
    expect(shareText("Max Muster", "LINK", o)).toContain("Kostenloser Versicherungs-Check");
    expect(shareText("Max Muster", "LINK", o)).toContain("LINK");
    expect(shareText("Max Muster", "LINK")).toContain("Kontakt aufnehmen");
    expect(signatureLine("LINK", o)).toContain("Versicherungs-Check");
    expect(signatureLine("LINK", null)).toContain("weiterempfehlen");
  });

  it("Lob: Dank mit Empfehlungslink, ohne Google-Link und ohne Anreiz", () => {
    const t = renderText(DEFAULT_TEXTS.praiseReferral, { vorname: "Julia", link: "LINK", vertreter: "Max Muster" });
    expect(t).toContain("LINK");
    expect(t).not.toMatch(/google|bewertung|gutschein|prämie/i);
    expect(validateText("praiseReferral", "Danke!")).toMatch(/Link/);
  });

  it("Anlässe haben Vorname, Link und Vertreter und versprechen nichts", () => {
    for (const o of Object.values(OCCASIONS)) {
      expect(o.text).toContain("{Vorname}");
      expect(o.text).toContain("{Link}");
      expect(o.text).toContain("{Vertreter}");
      expect(o.text).not.toMatch(/gutschein|prämie|€/i);
    }
  });

  it("Nachfassen-Aufgabe ist erkennbar und stört die Aufgabe „unzufrieden“ nicht", () => {
    expect(isFollowUpTask(followUpNote("Julia"))).toBe(true);
    expect(followUpNote("Julia")).toContain("Julia");
    expect(isUnhappyTask(followUpNote("Julia"))).toBe(false);
  });

  it("Rückmeldung an Empfehlende: mit Vornamen nur, wenn vorhanden; ohne Details", () => {
    expect(statusUpdateLine("gemeldet", "Tom")).toBe("Tom hat sich über Ihren Link bei mir gemeldet.");
    expect(statusUpdateLine("termin", null)).toMatch(/Termin vereinbart/);
    const t = statusUpdateText("termin", { vorname: "Julia", referred: "Tom", vertreter: "Max Muster" });
    expect(t.startsWith("Hallo Julia")).toBe(true);
    expect(t).toContain("Max Muster");
    const tpl = templateBodyFor("referral_update", "Max Muster");
    expect(tpl).toContain("{{2}}");
  });

  it("Trichter: erst ab Mindestmenge urteilen, erster auffälliger Übergang gewinnt", () => {
    expect(funnelHint({ linksSent: 2, linksOpened: 0, visitors: 0, leads: 0, closings: 0 }).stage).toBe("start");
    expect(funnelHint({ linksSent: 20, linksOpened: 4, visitors: 0, leads: 0, closings: 0 }).stage).toBe("oeffnen");
    expect(funnelHint({ linksSent: 20, linksOpened: 12, visitors: 3, leads: 0, closings: 0 }).stage).toBe("teilen");
    expect(funnelHint({ linksSent: 20, linksOpened: 12, visitors: 40, leads: 2, closings: 1 }).stage).toBe("eintragen");
    expect(funnelHint({ linksSent: 20, linksOpened: 12, visitors: 40, leads: 10, closings: 1 }).stage).toBe("abschluss");
    expect(funnelHint({ linksSent: 20, linksOpened: 12, visitors: 40, leads: 10, closings: 6 }).stage).toBe("ok");
  });

  it("Dankeschön: standardmäßig aus, nur mit Bestätigung, Hinweis über 15 €", () => {
    expect(resolveReward({ rewardKind: "none", rewardAmount: 15 })).toBeNull();
    expect(validateReward("none", null, "", false)).toBeNull();
    expect(validateReward("gutschein", 15, "", false)).toMatch(/bestätigen/);
    expect(validateReward("gutschein", 15, "", true)).toBeNull();
    expect(validateReward("gutschein", 0, "", true)).toMatch(/Wert/);
    expect(validateReward("spende", 20, "", true)).toMatch(/Spende/);
    expect(rewardWarning("gutschein", REWARD_SAFE_LIMIT)).toBeNull();
    expect(rewardWarning("gutschein", 50)).toMatch(/15 €/);
    expect(rewardWarning("none", 50)).toBeNull();
    const r = resolveReward({ rewardKind: "spende", rewardAmount: 20, rewardNote: "das Tierheim", rewardTrigger: "abschluss" })!;
    expect(rewardSentence(r, "Max Muster")).toBe("Wird aus Ihrer Empfehlung ein Kunde, spendet Max Muster als Dankeschön 20 € an das Tierheim.");
    const g = resolveReward({ rewardKind: "gutschein", rewardAmount: 15, rewardNote: "Wunschgutschein" })!;
    expect(g.trigger).toBe("termin");
    expect(rewardSentence(g, "Max Muster")).toContain("Wunschgutschein über 15 €");
  });

  it("Mit Dankeschön dürfen eigene Empfehlungstexte es nennen, die Google-Nachfrage nie", () => {
    expect(validateText("referral", "Hallo {Vorname}, als Dank gibt es einen Gutschein: {Link}")).toMatch(/Prämien/);
    expect(validateText("referral", "Hallo {Vorname}, als Dank gibt es einen Gutschein: {Link}", { rewardActive: true })).toBeNull();
    expect(validateText("review", "Hallo {Vorname}, für Ihre Bewertung gibt es einen Gutschein: {Link}", { rewardActive: true })).toMatch(/Prämien/);
  });

  it("Selbstempfehlung: gleiche Nummer in beliebiger Schreibweise", () => {
    expect(isSelfReferral("+49 170 1234567", "0170 1234567")).toBe(true);
    expect(isSelfReferral("+491701234567", "+491709999999")).toBe(false);
    expect(isSelfReferral(null, "01701234567")).toBe(false);
  });

  it("WhatsApp-Knopf: vorgeschriebene Anfrage mit Code, der sich wieder auslesen lässt", () => {
    const token = "Ab3_x-9ZqRsTuVwXyZ012345";
    const offer = resolveOffer({ offerKind: "kfz" }, "Max Muster");
    const t = whatsappRequestText({ vertreter: "Max Muster", recommender: "Julia", offer, token });
    expect(t).toBe("Hallo Max Muster, ich komme auf Empfehlung von Julia und interessiere mich für: Kostenloser Kfz-Check. (Ref Ab3_x-9Z)");
    expect(parseRefCode(t)).toBe(refCodeOf(token));
    expect(parseRefCode("Hallo, ich habe eine Frage")).toBeNull();
    expect(whatsappRequestText({ vertreter: "Max Muster", recommender: null, offer: null, token })).toContain("würde gern mit Ihnen sprechen");
    expect(whatsappLink("+49 151 2345678", t)).toMatch(/^https:\/\/wa\.me\/491512345678\?text=Hallo%20Max/);
    expect(whatsappLink("", t)).toBeNull();
  });
});
