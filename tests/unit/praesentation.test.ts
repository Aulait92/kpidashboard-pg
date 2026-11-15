// Beratungsstrecke und Angebote (Ole, 15.11.2026)
import { describe, expect, it } from "vitest";
import { bausteinSchalten, beitragEffektiv, cleanAngebote, summeEmpfohlen, tarifWaehlen } from "@/lib/angebote";
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
    expect(a.items[0]).toMatchObject({ sparte: "Hausrat", beitragMonat: 8.2, leistungen: ["A", "B"], empfohlen: true, ausschluesse: [], bausteine: [], gewaehlt: true, merkmale: [] });
    expect(summeEmpfohlen({ quelle: [], items: [...a.items, { ...a.items[0], beitragMonat: 7.4 }, { ...a.items[0], empfohlen: false, gewaehlt: false, beitragMonat: 99 }] })).toBe(15.6);
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

  it("vier Sparten: alle Kacheln und Empfehlungen, Leistungen und Selbstbeteiligung je Sparte, Beitrag aufgeschlüsselt", () => {
    const ang = cleanAngebote({ items: [
      { sparte: "Privathaftpflicht", tarif: "Top", beitragMonat: 6.8, selbstbeteiligung: "keine", leistungen: ["50 Mio."], empfohlen: true },
      { sparte: "Rechtsschutz", beitragMonat: 32.4, selbstbeteiligung: "150 € je Fall", leistungen: ["Mietrecht"], empfohlen: true },
      { sparte: "Unfall", beitragMonat: 18.6, leistungen: ["Invalidität"], empfohlen: true },
      { sparte: "Tierkranken", beitragMonat: 21.5, selbstbeteiligung: "20 %", leistungen: ["OP"], empfohlen: true },
    ] });
    const fs = folien({ ...d, formular: [] }, ang, markeFuer({ name: "X" }));
    expect(fs.find((f) => f.id === "risiken")!.html.match(/class="kachel"/g)).toHaveLength(4);
    expect(fs.find((f) => f.id === "empfehlung")!.html.match(/class="angebot empf"/g)).toHaveLength(4);
    const l = fs.find((f) => f.id === "leistungen")!.html;
    expect(l).toContain("Selbstbeteiligung 150 € je Fall");
    expect(l).not.toContain("Selbstbeteiligung keine");
    const b = fs.find((f) => f.id === "beitrag")!.html;
    expect(b).toContain("79,30");
    expect(b).toContain("Rechtsschutz 150 € je Fall, Tierkranken 20 %");
    expect(b).toMatch(/Unfall <b>18,60/);
  });

  it("Bausteine: Preis mit aktiven Bausteinen, Schalter auf den Folien, abgewählt unter „nicht“", () => {
    const ang = cleanAngebote({ items: [
      { sparte: "Tierkranken", tarif: "Vollschutz", beitragMonat: 14.2, leistungen: ["OP"], empfohlen: true,
        bausteine: [{ name: "Zahnbehandlung", beitrag: "4,10" }, { name: "Vorsorge", beitrag: 3.2 }, { name: "Höhere SB", beitrag: "−2,80", aktiv: false }, { name: "", beitrag: 1 }] },
      { sparte: "Tierkranken", tarif: "OP-Schutz", beitragMonat: 9.9, leistungen: ["OP"] },
    ] });
    const t = ang.items[0];
    expect(t.bausteine).toEqual([
      { name: "Zahnbehandlung", beitrag: 4.1, aktiv: true },
      { name: "Vorsorge", beitrag: 3.2, aktiv: true },
      { name: "Höhere SB", beitrag: -2.8, aktiv: false },
    ]);
    expect(beitragEffektiv(t)).toBe(21.5);
    expect(summeEmpfohlen(ang)).toBe(21.5);
    const m = markeFuer({ name: "X" });
    let fs = folien({ ...d, lead: { ...d.lead, produkt: "Tierkranken" } }, ang, m);
    expect(fs.find((f) => f.id === "beitrag")!.html).toContain("21,50");
    expect(fs.find((f) => f.id === "beitrag")!.html).toContain('data-baustein="0:0"');
    expect(fs.find((f) => f.id.startsWith("vergleich-"))!.html).toContain('class="bs an" data-baustein="0:1"');
    const neu = bausteinSchalten(bausteinSchalten(ang, 0, 0, false)!, 0, 2, true)!;
    expect(bausteinSchalten(ang, 0, 9, true)).toBeNull();
    expect(beitragEffektiv(neu.items[0])).toBe(14.6);
    fs = folien({ ...d, lead: { ...d.lead, produkt: "Tierkranken" } }, neu, m);
    expect(fs.find((f) => f.id === "beitrag")!.html).toContain("14,60");
    expect(fs.find((f) => f.id === "leistungen")!.html).toContain("ohne Zahnbehandlung");
  });

  it("Tarif im Termin wählen: Tabelle wie im Rechner, Empfehlung bleibt, Beitrag folgt der Wahl", () => {
    const m3 = (summe: string, geliehen: string, neben: string) => [
      { name: "Versicherungssumme", wert: summe },
      { name: "Schäden an geliehenen Gegenständen", wert: geliehen },
      { name: "Nebenberufliche Nutzung", wert: neben },
      { name: "Mietsachschäden", wert: "ja" },
    ];
    const ang = cleanAngebote({ items: [
      { sparte: "Tierhalterhaftpflicht", tarif: "Smart", beitragMonat: 6.15, merkmale: m3("50 Mio. €", "50.000 €", "nein") },
      { sparte: "Tierhalterhaftpflicht", tarif: "Komfort", beitragMonat: 8.15, empfohlen: true, merkmale: m3("75 Mio. €", "75.000 €", "ja") },
      { sparte: "Tierhalterhaftpflicht", tarif: "Premium", beitragMonat: 12.15, merkmale: m3("100 Mio. €", "ja", "ja") },
    ] });
    expect(ang.items.map((i) => i.gewaehlt)).toEqual([false, true, false]);
    const m = markeFuer({ name: "Allianz Agentur Lohmann" });
    const dt = { ...d, lead: { ...d.lead, produkt: "Tierhalterhaftpflicht" } };
    let fs = folien(dt, ang, m);
    const v = fs.find((f) => f.id.startsWith("vergleich-"))!.html;
    expect(v).toContain('class="vgl"');
    expect(v).toContain("In allen Tarifen:</b> <span>✓ Mietsachschäden</span>");
    expect(v).toContain('data-tarif="1">✓ Ausgewählt');
    expect(v).toContain('class="nein-z"');
    expect(v.replace(/<style>[\s\S]*?<\/style>/, "")).not.toMatch(/[\u2013\u2014]/);
    expect(fs.find((f) => f.id === "beitrag")!.html).toContain("8,15");
    const neu = tarifWaehlen(ang, 0)!;
    expect(neu.items.map((i) => i.gewaehlt)).toEqual([true, false, false]);
    expect(summeEmpfohlen(neu)).toBe(6.15);
    fs = folien(dt, neu, m);
    expect(fs.find((f) => f.id === "beitrag")!.html).toContain("6,15");
    expect(fs.find((f) => f.id.startsWith("vergleich-"))!.html).toMatch(/class="gew"><span class="badge">|class="badge">Passt zu Ihnen<\/span><div class="tarif">Komfort/);
    expect(fs.find((f) => f.id === "empfehlung")!.html).toContain("Komfort");
    expect(tarifWaehlen(neu, 0)!.items.every((i) => !i.gewaehlt)).toBe(true);
    expect(tarifWaehlen(ang, 7)).toBeNull();
  });
});
