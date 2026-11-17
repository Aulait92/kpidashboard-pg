// Erstanschreiben v8 (Ole, 17.11.2026, P2): konkretes Interesse mit Emoji, neutraler Nutzen-Halbsatz, Frage dynamisch und
// nicht fett; Vorlage nur vorbereitet (nicht eingereicht), Freitext sofort mit dem neuen Text.
import { describe, expect, it } from "vitest";
import { anfrageZu, ERSTANSCHREIBEN_V8, erstanschreibenText, erstanschreibenV8Params, fuerWen, vermittlerSubjekt } from "@/lib/whatsapp/erstanschreiben";
import { CORE_PURPOSES, metaTemplateProblems, plannedTemplates, purposesFor, templateNameFor } from "@/lib/whatsapp/template-plan";
import { OUTREACH_PURPOSES, renderTemplate, templateVersionFor, VORBEREITETE_FASSUNG } from "@/lib/whatsapp/templates";

const HERR = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" };
const FAMILIE = [
  { label: "Lebenssituation", value: "Familie mit Kindern" },
  { label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" },
];

describe("Erstanschreiben v8: Freitext", () => {
  it("Privatschutz mit Familie: Interesse, Emoji, Nutzen mit Familie, erste Frage ohne Sternchen", () => {
    const t = erstanschreibenText({ an: "sie", kontakt: { lastName: "Becker", fullName: "Anna Becker", salutation: "Frau" }, name: "Ole", vermittler: HERR.dat, vermittlerNom: HERR.nom, source: "Privatschutz", formular: FAMILIE });
    expect(t).toBe(
      "Hallo Frau Becker, danke für Ihre Anfrage zu Haftpflicht und Hausrat 🏠! Ich bin der digitale KI-Assistent von Herrn Kannapinn und kläre kurz ein paar Angaben, damit er Ihnen für Ihre Familie den passenden Schutz zeigen kann.\n\nSind Haftpflicht und Hausrat schon irgendwo versichert, oder wäre beides neu?",
    );
    expect(t).not.toMatch(/\*|zwei Dinge|zum Thema Privatschutz|[–—]/);
  });

  it("ohne Familie „persönlich“, Tier „für deine Katze“, Du mit Vorname, Frau als „sie“", () => {
    expect(fuerWen("Privatschutz", "sie", [{ label: "Lebenssituation", value: "Single" }])).toBe("persönlich");
    expect(fuerWen("TKV-Katze", "du")).toBe("für deine Katze");
    expect(fuerWen("Hundekrankenversicherung", "sie")).toBe("für Ihren Hund");
    expect(vermittlerSubjekt("Frau Meier")).toBe("sie");
    expect(vermittlerSubjekt("Ole")).toBe("Ole");
    const du = erstanschreibenText({ an: "du", kontakt: { firstName: "Anna" }, name: "Ole", vermittler: "Ole", vermittlerNom: "Ole", source: "TKV-Katze" });
    expect(du).toBe("Hallo Anna, danke für deine Anfrage zur Katzenversicherung 🐱! Ich bin der digitale KI-Assistent von Ole und kläre kurz ein paar Angaben, damit Ole dir für deine Katze den passenden Schutz zeigen kann.\n\nWie alt ist deine Katze?");
  });

  it("Interesse aus dem Formular, sonst Produkt bzw. Thema", () => {
    expect(anfrageZu("Privatschutz", [{ label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat, Unfall" }])).toBe("zu Haftpflicht, Hausrat und Unfall 🏠");
    expect(anfrageZu("Privatschutz", [{ label: "Versicherungsinteresse", value: "Hausrat" }])).toBe("zu Hausrat 🏠");
    expect(anfrageZu("Privatschutz", [])).toBe("zum Thema Privatschutz 🏠");
    expect(anfrageZu("PKV-Tarifoptimierung")).toBe("zur privaten Krankenversicherung");
    expect(anfrageZu("Zahnzusatz")).toBe("zur Zahnzusatzversicherung");
    expect(anfrageZu(null)).toBe("zum Thema Versicherung");
  });
});

describe("Erstanschreiben v8: Vorlage nur vorbereitet", () => {
  it("nicht eingereicht, eingereicht bleibt v7", () => {
    for (const p of OUTREACH_PURPOSES) {
      expect(templateVersionFor(p)).toBe("v7");
      expect(VORBEREITETE_FASSUNG[p]?.version).toBe("v8");
    }
    for (const p of OUTREACH_PURPOSES) expect(templateNameFor(p, undefined, "sie")).not.toMatch(/_v8/);
    expect(plannedTemplates(purposesFor({ bestand: true, empfehlung: true })).filter((t) => (OUTREACH_PURPOSES as readonly string[]).includes(t.purpose)).length).toBeGreaterThan(0);
    expect(CORE_PURPOSES).toContain("outreach_privatschutz");
  });

  it("Meta-tauglich: kein Platzhalter am Ende, nichts nebeneinander, Beispiele passen, keine Fett-Sternchen", () => {
    for (const p of OUTREACH_PURPOSES) {
      const f = VORBEREITETE_FASSUNG[p]!;
      for (const an of ["du", "sie"] as const) {
        const text = `Hallo {{1}}, ${f[an]}`;
        expect(metaTemplateProblems(text, f.beispiele[an]), `${p} ${an}`).toEqual([]);
        expect(text).not.toContain("*");
      }
      const ohne = `Hallo, ${f.sie.replace(/\{\{(\d+)\}\}/g, (_, n: string) => `{{${Number(n) - 1}}}`)}`;
      expect(metaTemplateProblems(ohne, f.beispiele.sie.slice(1)), `${p} ohne Namen`).toEqual([]);
      expect(f.sie).not.toMatch(/\b(du|dich|dir|dein)\b/);
      expect(f.du).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre)\b/);
    }
  });

  it("Vorlage mit Parametern ergibt denselben Text wie der Freitext", () => {
    const params = ["Frau Becker", ...erstanschreibenV8Params({ source: "Privatschutz", an: "sie", formular: FAMILIE, person: HERR, kurz: "Ole" })];
    const vorlage = renderTemplate(`Hallo {{1}}, ${ERSTANSCHREIBEN_V8.sie}`, params);
    const frei = erstanschreibenText({ an: "sie", kontakt: { lastName: "Becker", fullName: "Anna Becker", salutation: "Frau" }, name: "Ole", vermittler: HERR.dat, vermittlerNom: HERR.nom, source: "Privatschutz", formular: FAMILIE });
    expect(vorlage).toBe(frei);
  });
});
