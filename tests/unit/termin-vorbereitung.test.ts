// Terminvorbereitung (Ole, 15.11.2026): Rechner-Reihenfolge, offene Punkte, Leitfaden, PDF-HTML im PG-Design
import { describe, expect, it } from "vitest";
import { abschnitte, leitfaden, offenePunkte, spartenAus, spartenVon, tierWunsch, unterlagenFuer, vorbereitungHtml, type VorbereitungDaten } from "@/lib/termin-vorbereitung";

const base: VorbereitungDaten = {
  lead: { name: "Julia Schneider", telefon: "+49 151 1", email: null, adresse: "Achenseeweg 11a, 12209 Berlin", produkt: "Privatschutz" },
  termin: { startsAt: new Date("2026-11-18T09:00:00Z"), mode: "phone", berater: "Susanne Meier", meetUrl: null },
  zusammenfassung: null,
  formular: [{ label: "Versicherungsinteresse", value: "Haftpflichtversicherung, Hausratversicherung, Tierkrankenversicherung /Tierhalterhaftpflicht" }],
  angaben: { interesse: "Haftpflicht, Hausrat, Tierhalterhaftpflicht", geburt: "22.08.1992", tier: "Hund 1: Labrador" },
  vorbereitetAm: null,
};

describe("Terminvorbereitung", () => {
  it("erkennt Sparten; Tierhalterhaftpflicht verdrängt die Privathaftpflicht nicht", () => {
    expect(spartenAus("Haftpflichtversicherung, Tierkrankenversicherung /Tierhalterhaftpflicht")).toEqual(["haftpflicht", "tier"]);
    expect(spartenAus("Tierhalterhaftpflicht")).toEqual(["tier"]);
    expect(tierWunsch("Tierhalterhaftpflicht für den Hund")).toEqual({ kranken: false, halter: true });
    expect(tierWunsch(null)).toEqual({ kranken: true, halter: true });
  });

  it("Abschnitte je gefragter Sparte, offene Punkte, Unterlagen nur passend", () => {
    const ab = abschnitte(base);
    expect(ab.map((s) => s.titel)).toEqual(["Für alle Sparten", "Allianz-Rechner Privathaftpflicht", "Allianz-Rechner Hausrat", "Allianz-Rechner Tierkranken / Tierhalterhaftpflicht"]);
    const tier = ab.find((s) => s.titel.includes("Tier"))!;
    expect(tier.felder.map((f) => f.label)).not.toContain("Gewünschter Schutz (OP oder voll)");
    const offen = offenePunkte(ab);
    expect(offen).toContain("Wer versichert werden soll");
    expect(offen).not.toContain("Geburtsdatum");
    const u = unterlagenFuer("Privatschutz", spartenVon(base));
    expect(u.join(" ")).toContain("bei Hausrat");
    expect(u.join(" ")).not.toContain("Wohngebäude");
  });

  it("TKV: Rechner-Felder aus dem Formular, Leitfaden mit OP oder Vollschutz", () => {
    const d = { ...base, lead: { ...base.lead, produkt: "TKV-Katze" }, formular: [{ label: "Tierart", value: "Katze" }, { label: "Haltung", value: "Wohnung" }], angaben: { tarifwunsch: "Vollschutz" } };
    const ab = abschnitte(d);
    expect(ab[0].titel).toBe("Allianz-Rechner Tierkrankenversicherung");
    expect(ab[0].felder.find((f) => f.label === "Tierart")?.wert).toBe("Katze");
    expect(offenePunkte(ab)).toContain("Geburtsdatum des Halters");
    expect(leitfaden("TKV-Katze").map((s) => s.punkte.join(" ")).join(" ")).toContain("OP-Schutz und Vollschutz");
  });

  it("PDF-HTML im PG-Design, ohne Gedankenstriche, Werte escaped", () => {
    const html = vorbereitungHtml({ ...base, lead: { ...base.lead, name: "<b>X</b>" } });
    expect(html).toContain('performance<span>growth</span>');
    expect(html).toContain("#2563eb");
    expect(html).toContain("Gesprächsleitfaden");
    expect(html).toContain("&lt;b&gt;X&lt;/b&gt;");
    const text = html.replace(/<style>[\s\S]*?<\/style>/, "");
    expect(text).not.toMatch(/[–—]/);
  });
});
