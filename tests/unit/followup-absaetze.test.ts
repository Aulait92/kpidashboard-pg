// Später-Follow-ups: kurze Absätze (höchstens etwa 3 Zeilen), Link in eigener Zeile (Ole, 14.11.2026)
import { describe, expect, it } from "vitest";
import { mitBuchungslink, paragraphize } from "@/lib/vertrieb/followup";

describe("paragraphize", () => {
  it("trennt Anrede, teilt lange Absätze an Satzgrenzen, Link in eigene Zeile", () => {
    const t =
      "Guten Tag Herr Beger, Sie hatten mir im August geschrieben, dass das Thema ab dem neuen Jahr für Sie interessant wird. Deshalb melde ich mich wie versprochen noch einmal. Wir sorgen über Meta-Werbung für planbare Kundenanfragen in Ihrer Region. Ein WhatsApp-Assistent meldet sich sofort bei jeder Anfrage. Hätten Sie Zeit für 15 Minuten? Hier geht es zur Terminauswahl: https://calendly.com/x/y";
    const out = paragraphize(t);
    const paras = out.split("\n\n");
    expect(paras[0]).toBe("Guten Tag Herr Beger,");
    for (const p of paras) for (const line of p.split("\n")) expect(line.length).toBeLessThanOrEqual(230);
    expect(out).toContain("\nhttps://calendly.com/x/y");
    expect(out.replace(/\s+/g, " ")).toContain("Deshalb melde ich mich wie versprochen noch einmal.");
  });

  it("lässt kurze, schon gegliederte Texte unverändert", () => {
    const t = "Guten Tag,\n\nkurz nachgehakt: Passt es Ihnen diese Woche?";
    expect(paragraphize(t)).toBe(t);
  });
});

// KI ließ den Buchungslink weg (Sentry KPIDASHBOARD-PG-D): ergänzen statt auf die Vorlage zurückzufallen
describe("mitBuchungslink", () => {
  const url = "https://calendly.com/ole-kannapinn/meta-leads-call-ole-kannapinn";
  it("vorhandener Link bleibt unverändert", () => {
    const t = `Guten Tag,\n\nHier geht es zur Terminauswahl:\n${url}`;
    expect(mitBuchungslink(t, url)).toBe(t);
  });
  it("Link ohne https:// oder mit Schrägstrich am Ende wird zum exakten Link", () => {
    expect(mitBuchungslink("Termin: calendly.com/ole-kannapinn/meta-leads-call-ole-kannapinn/ gern.", url)).toBe(`Termin: ${url} gern.`);
    expect(mitBuchungslink("Termin: www.calendly.com/ole-kannapinn/meta-leads-call-ole-kannapinn", url)).toBe(`Termin: ${url}`);
  });
  it("fehlender Link kommt in eine eigene Zeile am Ende; ohne Buchungslink nichts", () => {
    expect(mitBuchungslink("Guten Tag,\n\nPasst ein kurzes Gespräch?", url)).toBe(`Guten Tag,\n\nPasst ein kurzes Gespräch?\n\n${url}`);
    expect(mitBuchungslink("Passt es?", null)).toBe("Passt es?");
    expect(mitBuchungslink("", url)).toBe("");
  });
});
