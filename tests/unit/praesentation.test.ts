// Beratungsstrecke und Angebote (Ole, 15.11.2026)
import { describe, expect, it } from "vitest";
import { cleanAngebote, summeEmpfohlen } from "@/lib/angebote";
import { folien, markeFuer, praesentationHtml } from "@/lib/praesentation";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";

const d: VorbereitungDaten = {
  lead: { name: "Julia Schneider", telefon: null, email: null, adresse: null, produkt: "Privatschutz" },
  termin: { startsAt: new Date("2026-11-18T09:00:00Z"), mode: "video", berater: "Thomas Lohmann", meetUrl: null },
  zusammenfassung: null,
  formular: [{ label: "Versicherungsinteresse", value: "Haftpflichtversicherung" }],
  angaben: { versichern: "Familie" },
  vorbereitetAm: null,
};

describe("Angebote", () => {
  it("liest Beträge und Listen defensiv", () => {
    const a = cleanAngebote({ items: [{ sparte: "Hausrat", beitragMonat: "8,20 €", leistungen: ["A", "", "B"], empfohlen: true }, { sparte: "" }, "x"] });
    expect(a.items).toHaveLength(1);
    expect(a.items[0]).toMatchObject({ sparte: "Hausrat", beitragMonat: 8.2, leistungen: ["A", "B"], empfohlen: true, ausschluesse: [] });
    expect(summeEmpfohlen({ quelle: [], items: [...a.items, { ...a.items[0], beitragMonat: 7.4 }, { ...a.items[0], empfohlen: false, beitragMonat: 99 }] })).toBe(15.6);
    expect(cleanAngebote({ items: [{ sparte: "X", beitragMonat: "1.234,50" }] }).items[0].beitragMonat).toBe(1234.5);
  });
});

describe("Präsentation", () => {
  it("Marke nach Gesellschaft", () => {
    expect(markeFuer({ name: "Allianz Agentur Lohmann" }).gesellschaft).toBe("Allianz");
    expect(markeFuer({ name: "AXA Generalvertretung Kraus" }).farbe).toBe("#00008f");
    expect(markeFuer({ name: "SIGNAL IDUNA Büro Meier" }).gesellschaft).toBe("SIGNAL IDUNA");
    expect(markeFuer({ name: "Müller Versicherungsmakler" }).gesellschaft).toBeNull();
  });

  it("Folien mit Vergleich je Sparte, Empfehlung, Beitrag; ohne Angebote Platzhalter", () => {
    const ang = cleanAngebote({ items: [
      { sparte: "Privathaftpflicht", tarif: "Smart", beitragMonat: 5.9, leistungen: ["50 Mio."] },
      { sparte: "Privathaftpflicht", tarif: "Komfort", beitragMonat: 7.4, leistungen: ["75 Mio."], empfohlen: true },
    ] });
    const m = markeFuer({ name: "Allianz Agentur Lohmann" });
    const fs = folien(d, ang, m);
    expect(fs.map((f) => f.id)).toEqual(expect.arrayContaining(["titel", "situation", "risiken", "beispiel", "empfehlung", "leistungen", "beitrag", "entscheidung", "weiter", "danke"]));
    expect(fs.some((f) => f.id.startsWith("vergleich-"))).toBe(true);
    expect(fs.find((f) => f.id === "beitrag")!.html).toContain("7,40");
    expect(fs.every((f) => f.notizen.length > 0)).toBe(true);
    const leer = folien(d, null, m);
    expect(leer.find((f) => f.id === "empfehlung")!.html).toContain("im Gespräch");
    const html = praesentationHtml(fs, m, "Test");
    expect(html).toContain("#003781");
    expect(html.replace(/<style>[\s\S]*?<\/style>/, "")).not.toMatch(/[–—]/);
    expect(fs.flatMap((f) => f.notizen).join(" ")).not.toMatch(/[–—]|Garantie/);
  });

  it("escaped Kundendaten", () => {
    const fs = folien({ ...d, lead: { ...d.lead, name: "<img src=x onerror=1>" } }, null, markeFuer({ name: "X" }));
    expect(fs[0].html).not.toContain("<img src=x");
  });

  it("Preis erst im Vergleich bzw. Beitrag, Prüffragen, Beginn als Vorschlag, Du-Fassung", () => {
    const ang = cleanAngebote({ items: [{ sparte: "Hausrat", tarif: "Komfort", beitragMonat: 8.2, leistungen: ["Neuwert"], empfohlen: true }] });
    const m = markeFuer({ name: "X" });
    const fs = folien(d, ang, m);
    expect(fs.find((f) => f.id === "empfehlung")!.html).not.toContain("8,20");
    expect(fs.find((f) => f.id === "beitrag")!.html).toContain("8,20");
    expect(fs.find((f) => f.id === "situation")!.html).toContain("Haben wir etwas vergessen?");
    expect(fs.find((f) => f.id === "entscheidung")!.html).toContain("Schutz ab 1. Dezember");
    expect(fs.find((f) => f.id === "entscheidung")!.html).toContain("14 Tage Widerrufsrecht");
    const du = folien(d, ang, m, "du");
    expect(du[0].html).toContain("Dein Schutz, Julia");
    expect(du.map((f) => f.html).join(" ")).not.toMatch(/\bSie haben\b|\bIhnen\b/);
  });
});
