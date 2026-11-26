// Produktionsfehler 24.11.2026 (Ole): Ein Privatschutz-Lead mit Interesse „Rechtsschutz“ (Formularfeld „Welche
// Versicherung interessiert Sie am meisten?“) wurde vom Assistenten nach Haftpflicht und Hausrat gefragt (u. a.
// Wohnfläche). Ursache: Der Assistent erkannte das Interesse-Feld nur über das enge Muster /versicherungsinteresse/i
// und übersah die neuere Beschriftung, also galt jeder Privatschutz-Lead als „Haftpflicht und Hausrat“.
// Fix: gemeinsame Erkennung (lib/interesse-formular.ts), die Assistent und Angebots-Sparten teilen. Rein, ohne LLM.
import { describe, expect, it } from "vitest";
import { INTERESSE_LABEL_RE, interesseAusFormular } from "@/lib/interesse-formular";
import { frageplan, ersteFrageRegel, nurHausrat, outreachProdukt, privatschutzThema, erstanschreibenV10Params } from "@/lib/whatsapp/erstanschreiben";
import { spartenDesLeads } from "@/lib/preise/rechner-angaben";
import { buildSystemPrompt } from "@/lib/whatsapp/bot";
import { TEMPLATE_BODY, TEMPLATE_BODY_B, renderTemplate } from "@/lib/whatsapp/templates";

const RS_FORM = [
  { label: "Welche Versicherung interessiert Sie am meisten?", value: "rechtsschutz" },
  { label: "Postleitzahl", value: "97209" },
];
// So war die v13-Vorlage tatsächlich gesendet (feste Meta-Frage): nennt Haftpflicht und Hausrat
const GESENDET = "Hallo Herr Haid, ist bei Haftpflicht und Hausrat schon etwas versichert? Danke für Ihre Anfrage!";

describe("Interesse aus dem Leadformular erkennen (alle Beschriftungen)", () => {
  it("INTERESSE_LABEL_RE erkennt die Fassungen, interesseAusFormular liefert den Wert", () => {
    for (const label of [
      "Versicherungsinteresse",
      "Welche Versicherungen interessieren Sie?",
      "Welche Versicherung interessiert Sie am meisten?",
      "An welchen Versicherungen bist Du interessiert?",
    ]) {
      expect(INTERESSE_LABEL_RE.test(label), label).toBe(true);
    }
    expect(interesseAusFormular(RS_FORM)).toBe("rechtsschutz");
    expect(interesseAusFormular([{ label: "Postleitzahl", value: "12209" }])).toBeNull();
    // Leeres Feld zählt nicht
    expect(interesseAusFormular([{ label: "Versicherungsinteresse", value: "  " }])).toBeNull();
  });
});

describe("Rechtsschutz-Lead wird nicht als Haftpflicht/Hausrat behandelt", () => {
  it("Angebots-Sparten sind Rechtsschutz (nicht Hausrat → keine Wohnflächen-Frage)", () => {
    expect(spartenDesLeads("Privatschutz", { formular: RS_FORM, angaben: {} } as never)).toEqual(["rechtsschutz"]);
  });

  it("Frageplan: Interesse gilt als „rechtsschutz“, nicht als „Haftpflicht, Hausrat“", () => {
    const plan = frageplan("Privatschutz", RS_FORM, { gesendet: GESENDET });
    const interesseFrage = plan.fragen.find((f) => f.key === "frage1");
    expect(interesseFrage?.bekannt).toMatch(/rechtsschutz/i);
    expect(interesseFrage?.bekannt).not.toMatch(/Produkt: Haftpflicht, Hausrat/);
    // Prompt-Regel nennt das echte Interesse als beantwortet
    const regel = ersteFrageRegel("Privatschutz", "Herr Lohmann", { gesendet: GESENDET, an: "sie", formular: RS_FORM });
    expect(regel).toMatch(/schon beantwortet.*rechtsschutz/i);
  });

  it("Nutzen-Satz im Terminvorschlag nennt Rechtsschutz statt Haftpflicht und Hausrat", () => {
    const s = buildSystemPrompt({ systemPrompt: "", knowledge: "", personality: "" }, "Privatschutz", {
      qualified: false,
      summary: null,
      contact: { name: "Thorsten Haid", phone: "4917844", email: "t@example.com" },
      upcoming: null,
      formAnswers: RS_FORM,
      advisorName: "Herr Lohmann",
      person: { nom: "Herr Lohmann", dat: "Herrn Lohmann" },
      aiDisclosed: true,
      ansprache: "sie",
    });
    expect(s).toContain("was Rechtsschutz für Sie kostet");
    expect(s).not.toContain("was Haftpflicht und Hausrat für");
  });

  it("nurHausrat: Rechtsschutz nein, reiner Hausrat (neue Beschriftung) ja", () => {
    expect(nurHausrat("Privatschutz", RS_FORM)).toBe(false);
    expect(nurHausrat("Privatschutz", [{ label: "Welche Versicherung interessiert Sie am meisten?", value: "Hausrat" }])).toBe(true);
    // Produkt bleibt Privatschutz (nicht Tier)
    expect(outreachProdukt("Privatschutz")?.purpose).toBe("outreach_privatschutz");
  });
});

describe("Eröffnungsvorlage v14: {{2}} = gewählte Sparten statt fest Haftpflicht/Hausrat", () => {
  it("privatschutzThema: gewählte Sparten in Worten, sonst neutraler Rückfall", () => {
    expect(privatschutzThema("Privatschutz", RS_FORM, "sie")).toBe("Rechtsschutz");
    expect(privatschutzThema("Privatschutz", [{ label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" }], "sie")).toBe("Haftpflicht und Hausrat");
    expect(privatschutzThema("Privatschutz", [{ label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat, Rechtsschutz" }], "sie")).toBe("Haftpflicht, Hausrat und Rechtsschutz");
    // Meta-Formular ohne Umlaut (Ole, 26.11.2026, Lohmann-Lead „haftpflicht, hausrat, wohngebaeude“)
    expect(privatschutzThema("Privatschutz", [{ label: "Welche Versicherung interessiert Sie am meisten?", value: "haftpflicht, hausrat, wohngebaeude" }], "sie")).toBe("Haftpflicht, Hausrat und Wohngebäude");
    // mehr als drei bzw. unbekannt: neutral (nie leer, nie falsche Sparte), je Ansprache
    expect(privatschutzThema("Privatschutz", [{ label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat, Rechtsschutz, Unfall" }], "sie")).toBe("Ihren gewünschten Versicherungen");
    expect(privatschutzThema("Privatschutz", [{ label: "Postleitzahl", value: "12209" }], "du")).toBe("deinen gewünschten Versicherungen");
  });

  it("erstanschreibenV10Params liefert das Thema; gerenderte a/b nennen die echte Sparte, nicht Haftpflicht/Hausrat", () => {
    const thema = erstanschreibenV10Params({ source: "Privatschutz", an: "sie", formular: RS_FORM, purpose: "outreach_privatschutz" });
    expect(thema).toEqual(["Rechtsschutz"]);
    // a „Dank zuerst", b „Frage zuerst" – beide mit der echten Sparte
    const a = renderTemplate(`Hallo {{1}}, ${TEMPLATE_BODY.outreach_privatschutz.sie}`, ["Herr Haid", ...thema]);
    const b = renderTemplate(`Hallo {{1}}, ${TEMPLATE_BODY_B.outreach_privatschutz!.sie}`, ["Herr Haid", ...thema]);
    expect(a).toBe("Hallo Herr Haid, danke für Ihre Anfrage zu Rechtsschutz! *Ist davon schon etwas versichert?*");
    expect(b).toBe("Hallo Herr Haid, *Ist bei Rechtsschutz schon etwas versichert?* Danke für Ihre Anfrage!");
    expect(a).not.toMatch(/Haftpflicht|Hausrat/);
    expect(b).not.toMatch(/Haftpflicht|Hausrat/);
  });
});
