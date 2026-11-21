// Feste Formular-Vorgaben je Produkt (Ole, 21.11.2026): Kfz und Privatschutz bekommen vorausgefüllte Meta-Standardfelder
// und feste Fragen, die die App am Wortlaut erkennt. Andere Produkte bleiben unverändert.
import { describe, expect, it } from "vitest";
import { leadFormPayload } from "@/lib/kampagnen/builder";
import { formAgent } from "@/lib/kampagnen/agents";
import { festeFragen, formularArt, formularMitVorgaben, standardFelder } from "@/lib/kampagnen/formular-vorgaben";
import { resolveProduct } from "@/lib/kampagnen/ops";
import type { LlmCall } from "@/lib/kampagnen/llm";
import type { CampaignContext, LeadFormDraft } from "@/lib/kampagnen/types";
import { KFZ_FORMULAR } from "@/lib/whatsapp/produkt-fragen";
import { istFamilie } from "@/lib/whatsapp/gespraech";
import { bekannteAntworten, outreachProdukt } from "@/lib/whatsapp/erstanschreiben";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const usage = { tokensIn: 10, tokensOut: 5, costCents: 1 };
const ctx = (product: string, extra: Partial<CampaignContext> = {}): CampaignContext => ({
  customerId: "c1",
  customerName: "Agentur Muster",
  advisorName: "Max Muster",
  vermittlerTyp: "vertreter",
  insurer: "Allianz",
  product,
  wish: null,
  anrede: "Sie",
  leadAddress: "sie",
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
  bookingUrl: "https://app.example.de/book/muster",
  consentText: "Ich willige ein, dass Max Muster mich zu dieser Anfrage per Telefon, E-Mail und WhatsApp kontaktiert. Widerruf jederzeit.",
  ...extra,
});

// Antwort des Formular-Agenten (KI): eigene Fragen, darunter PLZ und Personenkreis, die die Vorgaben ersetzen
const kiForm = {
  formName: "PG | Agentur Muster | Produkt | Formular",
  introTitle: "Gut abgesichert",
  introParagraphs: ["Ich melde mich persönlich per WhatsApp."],
  questions: [
    { key: "plz", label: "Ihre Postleitzahl?", options: [] },
    { key: "wer", label: "Wer soll versichert werden?", options: ["Ich", "Familie"] },
    { key: "interesse", label: "Versicherungsinteresse", options: ["Haftpflicht", "Hausrat", "Beides"] },
  ],
  thankYouTitle: "Fast geschafft: Jetzt Termin wählen",
  thankYouBody: "Wählen Sie selbst eine passende Zeit.",
  consentText: "Von der KI formulierte Einwilligung, die ersetzt wird.",
};
const llm: LlmCall = async () => ({ text: JSON.stringify(kiForm), usage });

type Payload = { questions: { type: string; key: string; label?: string; options?: { key: string; value: string }[] }[]; custom_disclaimer: { body: { text: string } }; thank_you_page: { button_text: string } };

describe("Formular-Vorgaben: Produkt erkennen", () => {
  it("Kfz, Privatschutz, sonst nichts", () => {
    expect(formularArt("Kfz-Versicherung")).toBe("kfz");
    expect(formularArt("Autoversicherung")).toBe("kfz");
    expect(formularArt("Privatschutz")).toBe("privatschutz");
    expect(formularArt("Haftpflicht + Hausrat")).toBe("privatschutz");
    expect(formularArt("Hundehalter-Haftpflicht")).toBeNull();
    expect(formularArt("TKV-Katze")).toBeNull();
    expect(formularArt("Sterbegeld")).toBeNull();
  });
});

describe("Formular-Vorgaben: Payload", () => {
  it("Kfz: feste Fragen (Sie), Straße, PLZ, Ort, Geburtsdatum; Einwilligung und Buchungslink bleiben", async () => {
    const c = ctx("Kfz-Versicherung");
    const { value } = await formAgent(llm, c);
    const p = leadFormPayload(value, c) as Payload;
    expect(p.questions.map((q) => q.key)).toEqual(["anlass", "schutz", "full_name", "phone_number", "email", "street_address", "zip_code", "city", "date_of_birth"]);
    expect(p.questions.slice(5).map((q) => q.type)).toEqual(["STREET_ADDRESS", "ZIP", "CITY", "DOB"]);
    expect(p.questions[0]).toMatchObject({ type: "CUSTOM", label: "Worum geht es?" });
    expect(p.questions[0].options?.map((o) => o.value)).toEqual(["Versicherung wechseln (jetziges Auto)", "Neues Auto versichern"]);
    expect(p.questions[1].label).toBe("Welchen Schutz wünschen Sie?");
    expect(p.questions[1].options?.map((o) => o.value)).toEqual(["Haftpflicht", "Teilkasko", "Vollkasko", "Weiß ich noch nicht"]);
    // App erkennt die Fragen (lib/whatsapp/produkt-fragen.ts)
    expect(KFZ_FORMULAR.anlass.test(p.questions[0].label!)).toBe(true);
    expect(KFZ_FORMULAR.schutz.test(p.questions[1].label!)).toBe(true);
    expect(p.custom_disclaimer.body.text).toBe(c.consentText);
    expect(p.thank_you_page.button_text).toBe("Jetzt Termin buchen");
    expect(value.introTitle).toBe(kiForm.introTitle);
  });

  it("Kfz: Du-Fassung bei Kunden, die ihre Leads duzen", async () => {
    const { value } = await formAgent(llm, ctx("Kfz-Versicherung", { leadAddress: "du" }));
    expect(value.questions[1].label).toBe("Welchen Schutz wünschst du dir?");
    expect(KFZ_FORMULAR.schutz.test(value.questions[1].label)).toBe(true);
  });

  it("Privatschutz: feste Frage zuerst, doppelte KI-Fragen raus, Straße, PLZ, Ort", async () => {
    const c = ctx("Privatschutz");
    const { value } = await formAgent(llm, c);
    expect(value.questions.map((q) => q.key)).toEqual(["versicherte_personen", "versicherungsinteresse"]);
    expect(value.questions[0]).toEqual({ key: "versicherte_personen", label: "Für wen soll der Schutz gelten?", options: ["Nur für mich", "Mit Partner", "Mit Familie"] });
    const p = leadFormPayload(value, c) as Payload;
    expect(p.questions.slice(-3).map((q) => q.type)).toEqual(["STREET_ADDRESS", "ZIP", "CITY"]);
    expect(p.questions.some((q) => q.type === "DOB")).toBe(false);
  });

  it("andere Produkte unverändert (nur Name, Telefon, E-Mail)", async () => {
    const c = ctx("Sterbegeld");
    const { value } = await formAgent(llm, c);
    expect(value.questions.map((q) => q.key)).toEqual(["plz", "wer", "interesse"]);
    const p = leadFormPayload(value, c) as Payload;
    expect(p.questions.slice(-3).map((q) => q.key)).toEqual(["full_name", "phone_number", "email"]);
    expect(standardFelder("Sterbegeld")).toEqual([]);
  });

  it("idempotent (auch beim Anlegen älterer Läufe) und ohne Gedankenstriche", () => {
    const c = ctx("Privatschutz");
    const once = formularMitVorgaben(kiForm as LeadFormDraft, c);
    expect(formularMitVorgaben(once, c)).toEqual(once);
    for (const q of [...festeFragen("Kfz-Versicherung", false), ...festeFragen("Kfz-Versicherung", true), ...festeFragen("Privatschutz", false)]) {
      expect(hatGedankenstrich([q.label, ...q.options].join(" "))).toBe(false);
    }
  });
});

describe("Formular-Vorgaben: App erkennt den Personenkreis", () => {
  const formular = (value: string) => [{ label: "Für wen soll der Schutz gelten?", value }];
  it("„Mit Familie“ ist Familie, „Mit Partner“ und „Nur für mich“ nicht", () => {
    expect(istFamilie(formular("Mit Familie"))).toBe(true);
    expect(istFamilie(formular("mit familie"))).toBe(true);
    expect(istFamilie(formular("Mit Partner"))).toBe(false);
    expect(istFamilie(formular("Nur für mich"))).toBe(false);
  });
  it("Erstanschreiben Privatschutz fragt den Personenkreis nicht erneut", () => {
    const p = outreachProdukt("Privatschutz");
    expect(bekannteAntworten(p, formular("Mit Partner")).frage2).toContain("Mit Partner");
  });
});

describe("Ops-Start: Produkt tolerant auflösen", () => {
  const zeilen = [
    { product: "Kfz-Versicherung", dailyBudget: 20 },
    { product: "Privatschutz", dailyBudget: 15 },
  ];
  it("genauer Name, Groß-Klein, Art und Katalog-Alias", () => {
    expect(resolveProduct("Kfz-Versicherung", zeilen)).toEqual({ ok: true, product: "Kfz-Versicherung", matched: true });
    expect(resolveProduct("kfz versicherung", zeilen)).toEqual({ ok: true, product: "Kfz-Versicherung", matched: true });
    expect(resolveProduct("kfz", zeilen)).toEqual({ ok: true, product: "Kfz-Versicherung", matched: true });
    expect(resolveProduct("privatschutz", zeilen)).toEqual({ ok: true, product: "Privatschutz", matched: true });
    expect(resolveProduct("ps", zeilen, ["Privatschutz"])).toEqual({ ok: true, product: "Privatschutz", matched: true });
  });
  it("unbekannt: unverändert weiter; mehrdeutig: Fehler", () => {
    expect(resolveProduct("Sterbegeld", zeilen)).toEqual({ ok: true, product: "Sterbegeld", matched: false });
    const r = resolveProduct("kfz", [...zeilen, { product: "Autoversicherung", dailyBudget: 10 }]);
    expect(r.ok).toBe(false);
  });
});

import { spartenDesLeads } from "@/lib/preise/rechner-angaben";
describe("Privatschutz: Versicherungsinteresse aus dem Formular (Ole, 21.11.2026)", () => {
  const src = (label: string, value: string) => ({ formular: [{ label, value }], angaben: null });
  it("neue und alte Formularfrage, Paket und Tippfehler", () => {
    expect(spartenDesLeads("Privatschutz", src("Welche Versicherung interessiert Sie am meisten?", "Wohngebäude") as never)).toEqual(["wohngebaeude"]);
    expect(spartenDesLeads("Privatschutz", src("Welche Versicherung interessiert Sie am meisten?", "Alles in einem Paket") as never)).toEqual(["haftpflicht", "hausrat", "rechtsschutz", "unfall"]);
    expect(spartenDesLeads("Privatschutz", src("An welchen Versicherungen bist Du interessiert? Sie sparen …", "Rechtschutzversicherung") as never)).toEqual(["rechtsschutz"]);
    expect(spartenDesLeads("Privatschutz", src("Welche Versicherung interessiert Sie am meisten?", "Tierhalterhaftpflicht Hund") as never)).toEqual(["tierhalter-hund"]);
  });
});
