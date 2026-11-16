// Vertrieb-Suche umlaut-tolerant (Ole, 16.11.2026: „Dröge“ fand „Christina Droege“ nicht).
import { describe, expect, it } from "vitest";
import { kontaktSucheWhere, normalisiereUmlaute, passtZurSuche, umlautVarianten } from "@/lib/vertrieb/suche";

/** Nachbau der Datenbank-Bedingung „contains, case-insensitive“ für einen Datensatz. */
function matches(where: unknown, row: Record<string, unknown>): boolean {
  if (!where || typeof where !== "object") return true;
  const w = where as Record<string, unknown>;
  return Object.entries(w).every(([k, v]) => {
    if (k === "OR") return (v as unknown[]).some((x) => matches(x, row));
    if (k === "AND") return (v as unknown[]).every((x) => matches(x, row));
    const cond = v as { contains?: string; has?: string };
    const val = row[k];
    if (cond.has !== undefined) return Array.isArray(val) && val.includes(cond.has);
    if (cond.contains !== undefined) return typeof val === "string" && val.toLowerCase().includes(cond.contains.toLowerCase());
    return false;
  });
}

const droege = { name: "Christina Droege", firstName: "Christina", lastName: "Droege", email: "christina.droege@signal-iduna.net", city: "Detmold", altEmails: [] as string[], leaderNames: null };
const mueller = { name: "Generalagentur Müller & Söhne", firstName: "Jörg", lastName: "Müller", email: "info@mueller-agentur.de", city: "Düsseldorf", altEmails: ["j.mueller@gmx.de"], leaderNames: "Jörg Müller, Klaus Weiß" };

describe("Umlaute normalisieren", () => {
  it("ö = oe, ü = ue, ä = ae, ß = ss, klein geschrieben", () => {
    expect(normalisiereUmlaute("Dröge")).toBe("droege");
    expect(normalisiereUmlaute("MÜLLER")).toBe("mueller");
    expect(normalisiereUmlaute("Jäger Straße")).toBe("jaeger strasse");
    expect(normalisiereUmlaute("Droege")).toBe("droege");
  });

  it("Varianten in beide Richtungen", () => {
    expect(umlautVarianten("Dröge")).toEqual(expect.arrayContaining(["dröge", "droege"]));
    expect(umlautVarianten("Droege")).toEqual(expect.arrayContaining(["droege", "dröge"]));
    expect(umlautVarianten("Weiss")).toEqual(expect.arrayContaining(["weiss", "weiß"]));
    expect(umlautVarianten("Straße")).toEqual(expect.arrayContaining(["straße", "strasse"]));
    expect(umlautVarianten("Schmidt")).toEqual(["schmidt"]);
  });

  it("gemischte Schreibweise in einem Wort: alle Kombinationen", () => {
    const v = umlautVarianten("Schoen-Mueller");
    expect(v).toEqual(expect.arrayContaining(["schoen-mueller", "schön-müller", "schön-mueller", "schoen-müller"]));
  });

  it("viele Umlaut-Stellen: begrenzt, aber beide Grundformen", () => {
    const v = umlautVarianten("Öö Üü Ää Öö Üü");
    expect(v.length).toBeLessThanOrEqual(5);
    expect(v).toEqual(expect.arrayContaining(["öö üü ää öö üü", "oeoe ueue aeae oeoe ueue"]));
  });

  it("passtZurSuche: beide Richtungen und Teilwörter", () => {
    expect(passtZurSuche("Christina Droege", "Dröge")).toBe(true);
    expect(passtZurSuche("Christina Dröge", "Droege")).toBe(true);
    expect(passtZurSuche("Christina Dröge", "droe")).toBe(true);
    expect(passtZurSuche("Klaus Weiß", "weiss")).toBe(true);
    expect(passtZurSuche("Klaus Weiss", "Weiß")).toBe(true);
    expect(passtZurSuche("Christina Droege", "Meier")).toBe(false);
  });
});

describe("Kontaktsuche (Filter)", () => {
  it("„Dröge“ findet „Christina Droege“ (Name und E-Mail)", () => {
    expect(matches(kontaktSucheWhere("Dröge"), droege)).toBe(true);
    expect(matches(kontaktSucheWhere("Christina Dröge"), droege)).toBe(true);
    expect(matches(kontaktSucheWhere("Dröge Detmold"), droege)).toBe(true);
    expect(matches(kontaktSucheWhere("Dröge"), { ...droege, name: "Generalagentur der SIGNAL IDUNA", firstName: null, lastName: null })).toBe(true);
  });

  it("„Droege“ findet „Dröge“", () => {
    const umlaut = { ...droege, name: "Christina Dröge", lastName: "Dröge", email: "cd@agentur.de" };
    expect(matches(kontaktSucheWhere("Droege"), umlaut)).toBe(true);
    expect(matches(kontaktSucheWhere("droege"), umlaut)).toBe(true);
  });

  it("E-Mail (auch weitere Adressen), Firma, Ort", () => {
    expect(matches(kontaktSucheWhere("christina.droege@signal-iduna.net"), droege)).toBe(true);
    expect(matches(kontaktSucheWhere("signal-iduna"), droege)).toBe(true);
    expect(matches(kontaktSucheWhere("J.Mueller@gmx.de"), mueller)).toBe(true);
    expect(matches(kontaktSucheWhere("Mueller & Soehne"), mueller)).toBe(true);
    expect(matches(kontaktSucheWhere("Duesseldorf"), mueller)).toBe(true);
    expect(matches(kontaktSucheWhere("Weiss"), mueller)).toBe(true);
  });

  it("findet nichts Falsches", () => {
    expect(matches(kontaktSucheWhere("Dröge"), mueller)).toBe(false);
    expect(matches(kontaktSucheWhere("Christina Müller"), droege)).toBe(false);
  });

  it("leerer Begriff: kein Filter", () => {
    expect(kontaktSucheWhere("  ")).toEqual({});
  });
});
