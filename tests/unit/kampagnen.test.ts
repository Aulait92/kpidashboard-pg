import { describe, expect, it } from "vitest";
import { runAgent, type LlmCall } from "@/lib/kampagnen/llm";
import { adSetTargeting, assertNotActive, explainMetaError, leadFormPayload } from "@/lib/kampagnen/builder";
import { productPatterns, staticChecks } from "@/lib/kampagnen/agents";
import { campaignName, validateAngles, validateCopies, validateForm, validatePlan, worstStatus, type CampaignContext, type CampaignPlan, type LeadFormDraft } from "@/lib/kampagnen/types";

// Kampagnen-Agenten: Prüfung der Agenten-Ausgaben, Wiederholung bei ungültigem
// JSON, Sicherheitsstopp gegen ACTIVE, Formular- und Targeting-Payload.

const usage = { tokensIn: 100, tokensOut: 50, costCents: 1 };
const ctx: CampaignContext = {
  customerId: "c1",
  customerName: "Agentur Muster",
  advisorName: "Max Muster",
  vermittlerTyp: "vertreter",
  insurer: "Allianz",
  product: "Katzenversicherung (TKV)",
  wish: null,
  anrede: "Sie",
  city: "Musterstadt",
  zip: "12345",
  region: null,
  website: "https://agentur-muster.test",
  privacyUrl: "https://agentur-muster.test/datenschutz",
  pageId: "111",
  adAccountId: "222",
  dailyBudgetEur: 30,
  cplEur: 6,
  special: null,
  assistantKnowledge: null,
  patterns: "",
};
const form: LeadFormDraft = {
  formName: "PG | Agentur Muster | Katze | Formular",
  introTitle: "Katze absichern",
  introParagraphs: ["Ich melde mich persönlich."],
  questions: [
    { key: "katze_alter", label: "Wie alt ist Ihre Katze?", options: ["unter 2 Jahre", "2–7 Jahre", "älter"] },
    { key: "haltung", label: "Wohnungskatze oder Freigänger?", options: ["Wohnung", "Freigänger"] },
  ],
  thankYouTitle: "Danke!",
  thankYouBody: "Ich melde mich in Kürze per WhatsApp.",
  consentText: "Ich bin einverstanden, dass Max Muster mich per Telefon, E-Mail und WhatsApp zu meiner Anfrage kontaktiert. Widerruf jederzeit möglich.",
};

describe("Kampagnen-Agenten: Ausgaben prüfen", () => {
  it("Plan: Grenzen für Alter, Umkreis, Anzahl Anzeigen und Budget", () => {
    const ok = validatePlan({ dailyBudgetEur: 30, adsPerAdSet: 4, zielgruppe: "Katzenhalter", begruendung: "weil", adSets: [{ name: "A", ageMin: 25, ageMax: 65, radiusKm: 30, advantageAudience: true, note: "" }] });
    expect(ok.ok).toBe(true);
    const bad = validatePlan({ dailyBudgetEur: 1, adsPerAdSet: 9, zielgruppe: "", begruendung: "", adSets: [{ ageMin: 10, ageMax: 99, radiusKm: 5 }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.length).toBeGreaterThanOrEqual(5);
  });

  it("Winkel: 3–5, Schlüssel eindeutig", () => {
    const a = (key: string) => ({ key, title: "T", hook: "H", insight: "I" });
    expect(validateAngles({ angles: [a("a"), a("b"), a("c")] }).ok).toBe(true);
    expect(validateAngles({ angles: [a("a"), a("a"), a("c")] }).ok).toBe(false);
    expect(validateAngles({ angles: [a("a")] }).ok).toBe(false);
  });

  it("Texte: Zeichengrenzen, bekannter Winkel und gültiger Button", () => {
    const ad = { angleKey: "a", primaryText: "x".repeat(60), headline: "Kurz", description: "Kurz", imageHeadline: "Bild", imageSubline: "Sub", cta: "GET_QUOTE" };
    expect(validateCopies({ ads: [ad, { ...ad, angleKey: "b" }, { ...ad, angleKey: "c" }] }, ["a", "b", "c"]).ok).toBe(true);
    const r = validateCopies({ ads: [{ ...ad, headline: "y".repeat(41) }, { ...ad, angleKey: "zz" }, { ...ad, cta: "BUY_NOW" }] }, ["a", "b", "c"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/headline.*zu lang/);
  });

  it("Formular: Kontaktfelder nicht als eigene Frage, 2–4 Fragen", () => {
    expect(validateForm(form).ok).toBe(true);
    const r = validateForm({ ...form, questions: [{ key: "email", label: "Mail?", options: [] }] });
    expect(r.ok).toBe(false);
  });

  it("schlechtester Status gewinnt", () => {
    expect(worstStatus("gruen", [])).toBe("gruen");
    expect(worstStatus("gruen", [{ severity: "gelb", area: "text", index: 0, issue: "", fix: "" }])).toBe("gelb");
    expect(worstStatus("gelb", [{ severity: "rot", area: "text", index: 0, issue: "", fix: "" }])).toBe("rot");
  });

  it("Benennungsschema", () => {
    expect(campaignName("Agentur Muster", "Katze", new Date("2026-11-13T10:00:00Z"))).toBe("PG | Agentur Muster | Katze | 2026-11-13");
  });
});

describe("Kampagnen-Agenten: Wiederholung bei ungültiger Antwort", () => {
  it("ungültiges JSON → zweiter Versuch mit Hinweis", async () => {
    const prompts: string[] = [];
    const answers = ["kein json", JSON.stringify({ angles: [1, 2, 3].map((i) => ({ key: `k${i}`, title: "T", hook: "H", insight: "I" })) })];
    const llm: LlmCall = async (req) => {
      prompts.push(req.user);
      return { text: answers[prompts.length - 1], usage };
    };
    const r = await runAgent(llm, { agent: "Test", system: "s", user: "u", schema: {} }, validateAngles);
    expect(r.value).toHaveLength(3);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/ungültig/);
    expect(r.usage.tokensIn).toBe(200);
  });

  it("zweimal ungültig → Fehler", async () => {
    const llm: LlmCall = async () => ({ text: JSON.stringify({ angles: [] }), usage });
    await expect(runAgent(llm, { agent: "Test", system: "s", user: "u", schema: {} }, validateAngles)).rejects.toThrow(/2 Versuchen/);
  });
});

describe("Kampagnen-Agenten: Bauer", () => {
  it("Sicherheitsstopp: nie ACTIVE", () => {
    expect(() => assertNotActive({ status: "ACTIVE" })).toThrow(/Sicherheitsstopp/);
    expect(() => assertNotActive({ configured_status: "ACTIVE" })).toThrow();
    expect(() => assertNotActive({ status: "PAUSED" })).not.toThrow();
    expect(() => assertNotActive({ name: "x" })).not.toThrow();
  });

  it("Formular-Payload: Datenschutz, Einwilligung, Kontaktfelder mit den Schlüsseln der Lead-Verarbeitung", () => {
    const p = leadFormPayload(form, ctx) as { questions: { type: string; key: string }[]; privacy_policy: { url: string }; custom_disclaimer: { checkboxes: { is_required: boolean }[] }; locale: string };
    expect(p.privacy_policy.url).toBe(ctx.privacyUrl);
    expect(p.locale).toBe("DE_DE");
    expect(p.questions.map((q) => q.key)).toEqual(["katze_alter", "haltung", "full_name", "phone_number", "email"]);
    expect(p.custom_disclaimer.checkboxes[0].is_required).toBe(true);
    expect(() => leadFormPayload(form, { ...ctx, privacyUrl: null })).toThrow(/Datenschutz/);
    // Dankeseite: Buchungskalender des Kunden geht vor der Website (Ole, 13.11.2026)
    const booking = leadFormPayload(form, { ...ctx, bookingUrl: "https://app.example.de/book/agentur-muster" }) as {
      thank_you_page: { button_type: string; button_text: string; website_url: string };
      follow_up_action_url: string;
    };
    expect(booking.thank_you_page).toMatchObject({ button_type: "VIEW_WEBSITE", button_text: "Jetzt Termin buchen", website_url: "https://app.example.de/book/agentur-muster" });
    expect(booking.follow_up_action_url).toBe("https://app.example.de/book/agentur-muster");
  });

  it("Targeting: Stadt mit Umkreis, Advantage+ mit weiter Altersgrenze, sonst Deutschland", () => {
    const t = adSetTargeting({ name: "A", ageMin: 30, ageMax: 55, radiusKm: 120, advantageAudience: true, note: "" }, "123") as {
      geo_locations: { cities: { key: string; radius: number }[] };
      age_min: number;
      age_max: number;
      targeting_automation: { advantage_audience: number };
    };
    expect(t.geo_locations.cities[0]).toMatchObject({ key: "123", radius: 80 });
    expect(t.age_max).toBe(65);
    expect(t.age_min).toBe(25);
    expect(t.targeting_automation.advantage_audience).toBe(1);
    const de = adSetTargeting({ name: "A", ageMin: 30, ageMax: 55, radiusKm: 30, advantageAudience: false, note: "" }, null) as { geo_locations: { countries: string[] }; age_max: number };
    expect(de.geo_locations.countries).toEqual(["DE"]);
    expect(de.age_max).toBe(55);
  });

  it("verständliche Meldung bei fehlendem ads_management", () => {
    expect(explainMetaError("(#200) Ad account owner has NOT grant ads_management or ads_read permission", ctx)).toMatch(/Partnerzugriff auf das Werbekonto/);
  });
});

describe("Kampagnen-Agenten: feste Prüfungen", () => {
  const plan: CampaignPlan = { campaignName: "x", objective: "OUTCOME_LEADS", dailyBudgetEur: 30, specialAdCategories: [], adSets: [], adsPerAdSet: 3, zielgruppe: "", begruendung: "" };
  const ad = { angleKey: "a", primaryText: "Ihre Katze verdient den besten Schutz.", headline: "H", description: "D", imageHeadline: "I", imageSubline: "S", cta: "GET_QUOTE" as const };
  it("Garantie-Versprechen ist rot, falsche Anrede gelb", () => {
    const f = staticChecks(ctx, { plan, copies: [{ ...ad, primaryText: "Garantiert günstigste Katzenversicherung!" }, { ...ad, primaryText: "Hol dir deinen Schutz" }], form, images: [{ angleKey: "a", imageUrl: "u" }, { angleKey: "a", imageUrl: "u" }] });
    expect(f.find((x) => x.index === 0)?.severity).toBe("rot");
    expect(f.find((x) => x.index === 1)?.severity).toBe("gelb");
  });
  it("bewährte Muster je Produkt", () => {
    expect(productPatterns("Katzenversicherung (TKV)")).toMatch(/GOT/);
    expect(productPatterns("Sterbegeldversicherung")).toMatch(/Bestattung/);
  });
});
