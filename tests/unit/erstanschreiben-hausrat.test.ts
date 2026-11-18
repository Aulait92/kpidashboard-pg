// Reine Hausrat-Leads (Ole, 18.11.2026): In der Erstnachricht „zu Ihrer Hausratversicherung“ (Du: „zu deiner
// Hausratversicherung“) statt „zum Privatschutz“, als Freitext, als eigene Vorlage outreach_hausrat und in der Erstmail.
import { describe, expect, it } from "vitest";
import { erstanschreibenText, erstanschreibenZweck, frageplan, nurHausrat } from "@/lib/whatsapp/erstanschreiben";
import { buildTemplateRequest, CORE_PURPOSES, metaTemplateProblems, plannedTemplates } from "@/lib/whatsapp/template-plan";
import { isOutreachPurpose, templateTextFor, templateVersionFor } from "@/lib/whatsapp/templates";
import { anfrageThema } from "@/lib/mail-strecke/texte";

const MUELLER = { fullName: "Thomas Müller", salutation: "Herr" };
const NUR_HAUSRAT = [{ label: "Versicherungsinteresse", value: "Hausrat" }];
const BEIDES = [{ label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" }];

describe("Erstanschreiben: nur Hausrat angefragt", () => {
  it("erkennt reine Hausrat-Leads aus dem Formular bzw. dem Produkt", () => {
    expect(nurHausrat("Privatschutz", NUR_HAUSRAT)).toBe(true);
    expect(nurHausrat("Hausratversicherung", [])).toBe(true);
    expect(nurHausrat("Privatschutz", BEIDES)).toBe(false);
    expect(nurHausrat("Privatschutz", [])).toBe(false);
    expect(nurHausrat("Haftpflicht", [])).toBe(false);
    expect(nurHausrat("Katzenversicherung (TKV)", NUR_HAUSRAT)).toBe(false);
    expect(erstanschreibenZweck("Privatschutz", NUR_HAUSRAT)).toBe("outreach_hausrat");
    expect(erstanschreibenZweck("Privatschutz", BEIDES)).toBe("outreach_privatschutz");
    expect(erstanschreibenZweck(null, [])).toBe("outreach");
  });

  it("Freitext Sie und Du; Frageplan bleibt beim Privatschutz", () => {
    expect(erstanschreibenText({ an: "sie", kontakt: MUELLER, name: "Ole", vermittler: "Herrn Kannapinn", source: "Privatschutz", herkunft: "anfrage", formular: NUR_HAUSRAT })).toBe(
      "Hallo Herr Müller, danke für Ihre Anfrage zu Ihrer Hausratversicherung an Herrn Kannapinn! *Sind Sie bei Hausrat schon versichert, oder wäre es neu?*\n\n_KI-Assistent · Erstinformation folgt als PDF_",
    );
    expect(erstanschreibenText({ an: "du", kontakt: { fullName: "Thomas" }, name: "Ole", source: "Privatschutz", herkunft: "anfrage", formular: NUR_HAUSRAT })).toContain(
      "danke für deine Anfrage zu deiner Hausratversicherung an Ole!",
    );
    expect(erstanschreibenText({ an: "sie", kontakt: MUELLER, name: "Ole", source: "Privatschutz", herkunft: "anfrage", formular: BEIDES })).toContain("zum Privatschutz an Ole!");
    expect(frageplan("Privatschutz", NUR_HAUSRAT).produkt?.purpose).toBe("outreach_privatschutz");
  });

  it("eigene Vorlage v9 zur Einreichung, mit PDF-Kopf, ohne Meta-Probleme", () => {
    expect(CORE_PURPOSES).toContain("outreach_hausrat");
    expect(isOutreachPurpose("outreach_hausrat")).toBe(true);
    expect(templateVersionFor("outreach_hausrat")).toBe("v9");
    expect(templateTextFor("outreach_hausrat", "sie")).toBe("Hallo {{1}}, danke für Ihre Anfrage zu Ihrer Hausratversicherung an {{2}}! *{{3}}?*");
    expect(templateTextFor("outreach_hausrat", "du")).toBe("Hallo {{1}}, danke für deine Anfrage zu deiner Hausratversicherung an {{2}}! *{{3}}?*");
    const geplant = plannedTemplates(["outreach_hausrat"]);
    expect(geplant.map((g) => g.form)).toEqual(["du", "sie", "sie_ohne_name"]);
    for (const g of geplant) {
      const req = buildTemplateRequest(g.purpose, { firm: "Agentur Kannapinn", advisor: "Ole Kannapinn" }, undefined, g.form, { variant: g.variant, documentExample: "https://x.de/erstinformation/abc/pdf", kopf: g.kopf });
      expect(req.name).toMatch(/^pg_outreach_hausrat_v9/);
      const body = (req.components as { type: string; text?: string; example?: { body_text: string[][] } }[]).find((c) => c.type === "BODY")!;
      expect(body.text).toContain("Hausratversicherung");
      expect(metaTemplateProblems(body.text!, body.example?.body_text[0] ?? [])).toEqual([]);
    }
  });

  it("Erstmail: dasselbe Thema", () => {
    expect(anfrageThema("Privatschutz", "sie", NUR_HAUSRAT)).toBe(" zu Ihrer Hausratversicherung");
    expect(anfrageThema("Privatschutz", "du", NUR_HAUSRAT)).toBe(" zu deiner Hausratversicherung");
    expect(anfrageThema("Privatschutz", "sie", BEIDES)).toBe(" zum Privatschutz");
  });
});
