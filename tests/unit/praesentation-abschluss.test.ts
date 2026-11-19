// Beratungspräsentation, Abschluss-Dramaturgie als Splittest (Ole, 19.11.2026): Variante je Lead, Fassung B mit
// Zusammenfassung und „Ja, so machen wir es“, Einwand-Folien, Sprechhinweise, Messung „Abschlussquote je Präsentation“.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cleanAngebote } from "@/lib/angebote";
import { einwandFolien, folien, markeFuer, paketName, praesentationHtml, SPRECHHINWEIS } from "@/lib/praesentation";
import { istVariante, mitAbschlussLeiste, PRAESENTATION_EXPERIMENT, varianteAusExperiment } from "@/lib/praesentation-variante";
import { EXPERIMENTE, laeuft } from "@/lib/experimente";
import { auswerten, zaehltAlsGezeigt, type Ereignis } from "@/lib/praesentation-messung";
import { demoAngebote, demoEinwaende, demoFolien } from "@/lib/demo-beratung";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";

const d: VorbereitungDaten = {
  lead: { name: "Julia Schneider", telefon: null, email: null, adresse: null, produkt: "Privatschutz" },
  termin: { startsAt: new Date("2026-11-18T09:00:00Z"), mode: "video", berater: "Thomas Lohmann", meetUrl: null },
  zusammenfassung: null,
  formular: [],
  angaben: { versichern: "Familie" },
  vorbereitetAm: null,
};
const m = markeFuer({ name: "Agentur Lohmann" });
const ang = cleanAngebote({
  items: [
    { sparte: "Privathaftpflicht", tarif: "Haftpflicht Smart", beitragMonat: 5.9, leistungen: ["50 Mio."] },
    { sparte: "Privathaftpflicht", tarif: "Haftpflicht Komfort", beitragMonat: 7.4, leistungen: ["75 Mio."], empfohlen: true },
    { sparte: "Hausrat", tarif: "Hausrat Komfort", beitragMonat: 8.2, leistungen: ["Neuwert"], empfohlen: true },
  ],
});
const text = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
const folie = (fs: { id: string; html: string }[], id: string) => fs.find((f) => f.id === id)!.html;

describe("Splittest-Variante", () => {
  it("Experiment „praesentation“: a = B (Standard), b = C, Ziel Zusage, läuft ab dem Deploy (Ole, 19.11.2026)", () => {
    expect(varianteAusExperiment("a")).toBe("B");
    expect(varianteAusExperiment("b")).toBe("C");
    expect(istVariante("C")).toBe(true);
    expect(istVariante("D")).toBe(false);
    const def = EXPERIMENTE[PRAESENTATION_EXPERIMENT];
    expect(def.ziel).toBe("zusage");
    expect("aktiv" in def).toBe(false);
    // ohne gespeicherten Stand läuft er; eine Zeile mit aktiv = false hält ihn an
    expect(laeuft(def, null)).toBe(true);
    expect(laeuft(def, { aktiv: false })).toBe(false);
    expect(laeuft({ ...def, aktiv: false }, null)).toBe(false);
    expect(laeuft({ ...def, aktiv: false }, { aktiv: true })).toBe(true);
    expect(laeuft(EXPERIMENTE.komplettcheck_text, null)).toBe(true);
    expect(laeuft(EXPERIMENTE.komplettcheck_text, { aktiv: false })).toBe(false);
    expect(mitAbschlussLeiste("B", ["Hausrat Komfort"])).toBe(true);
    expect(mitAbschlussLeiste("C", ["Hausrat Komfort"])).toBe(true);
    expect(mitAbschlussLeiste("A", ["Hausrat Komfort"])).toBe(false);
    expect(mitAbschlussLeiste("B", [])).toBe(false);
  });
});

describe("Fassung A bleibt, Fassung B mit Abschluss", () => {
  it("A: bisherige Reihenfolge, kein Abschluss-Knopf", () => {
    const fs = folien(d, ang, m);
    expect(fs.map((f) => f.id)).toContain("risiken");
    expect(fs.map((f) => f.html).join("")).not.toContain("data-zusage");
    expect(folie(fs, "entscheidung")).toContain("Oder lieber");
  });

  it("B: ohne „Worauf es ankommt“, Beitrag pro Tag groß, Entscheidung mit Zusammenfassung und einem Schritt", () => {
    const fs = folien(d, ang, m, "sie", { variante: "B" });
    const ids = fs.map((f) => f.id);
    expect(ids).not.toContain("risiken");
    expect(ids.slice(-3)).toEqual(["entscheidung", "weiter", "danke"]);
    expect(folie(fs, "titel")).toContain("Ihre Entscheidung");
    expect(folie(fs, "beitrag")).toContain("data-pro-tag");
    const e = folie(fs, "entscheidung");
    expect(e).toContain("Haftpflicht Komfort");
    expect(e).toContain("Hausrat Komfort");
    expect(e).toContain("7,40");
    expect(e).toContain("Schutz ab 1. Dezember");
    expect(e).toContain("oder ab 1. Januar");
    expect(e).toContain("14 Tage Widerrufsrecht");
    expect(e).toContain("Beratungsdokumentation per E-Mail");
    expect(e).not.toContain("Kündigung");
    expect(e.match(/data-zusage/g)).toHaveLength(1);
    expect(e).toContain(">Ja, so machen wir es</button>");
    // Kein Druck, keine Versprechen, keine Gedankenstriche
    const alles = text(fs.map((f) => f.html).join(" "));
    expect(alles).not.toMatch(/Garantie|garantiert|nur heute|letzte Chance/i);
    expect(hatGedankenstrich(alles.replace(/\s—\s/g, " "))).toBe(false);
  });

  it("B: nach der Zusage „Zugesagt“; Kündigungshilfe nur mit bisherigem Vertrag; im PDF kein Knopf", () => {
    const z = folien(d, ang, m, "sie", { variante: "B", zugesagtAm: new Date() });
    expect(folie(z, "entscheidung")).toContain('class="zusage an"');
    expect(folie(z, "entscheidung")).toContain("✓ Zugesagt");
    const mitBisher = folien(d, { ...ang, schutz: [{ key: "haftpflicht", label: "Privathaftpflicht", status: "woanders", info: null, versicherer: null }] }, m, "sie", { variante: "B" });
    expect(folie(mitBisher, "entscheidung")).toContain("Bei der Kündigung Ihres bisherigen Vertrags helfen wir");
    expect(praesentationHtml(z, m, "T")).toContain(".zusage{display:none}");
  });

  it("B in der Du-Fassung", () => {
    const du = folien(d, ang, m, "du", { variante: "B" });
    expect(folie(du, "entscheidung")).toContain("Deine Entscheidung");
    expect(du.map((f) => f.html).join(" ")).not.toMatch(/\bSie haben\b|\bIhnen\b|\bIhres\b/);
  });

  it("Sprechhinweise nur als Feld, nie im HTML der Folie", () => {
    for (const v of ["A", "B"] as const) {
      const fs = folien(d, ang, m, "sie", { variante: v });
      expect(fs.find((f) => f.id === "beitrag")!.hinweis).toBe(SPRECHHINWEIS.beitrag);
      expect(fs.find((f) => f.id.startsWith("vergleich-"))!.hinweis).toBe(SPRECHHINWEIS.vergleich);
      for (const f of fs) if (f.hinweis) expect(f.html).not.toContain(f.hinweis);
    }
    expect(hatGedankenstrich(Object.values(SPRECHHINWEIS).join(" "))).toBe(false);
  });
});

describe("Tarifname in der Zusammenfassung", () => {
  it("ohne doppelte Sparte", () => {
    expect(paketName({ sparte: "Privathaftpflicht", tarif: "Haftpflicht Komfort" })).toBe("Haftpflicht Komfort");
    expect(paketName({ sparte: "Hausrat", tarif: "Hausrat Komfort" })).toBe("Hausrat Komfort");
    expect(paketName({ sparte: "Hausrat", tarif: "Komfort" })).toBe("Hausrat Komfort");
    expect(paketName({ sparte: "Unfall", tarif: null })).toBe("Unfall");
  });
});

describe("Einwand-Folien", () => {
  it("vier Sprungziele mit Frage, Preis aus den Angeboten, ohne Versprechen", () => {
    const es = einwandFolien(d, ang, m);
    expect(es.map((f) => f.id)).toEqual(["einwand-preis", "einwand-nachdenken", "einwand-vorhanden", "einwand-partner"]);
    expect(es.every((f) => f.hinweis && f.html.includes('class="frage"'))).toBe(true);
    // 7,40 + 8,20 = 15,60 € im Monat → rund 0,52 € am Tag; kleinste Stufen 5,90 + 8,20 = 14,10 €
    expect(folie(es, "einwand-preis")).toContain("0,52");
    expect(folie(es, "einwand-preis")).toContain("14,10");
    const alles = text(es.map((f) => f.html).join(" "));
    expect(alles).not.toMatch(/Garantie|garantiert|sofort abschließen/i);
    expect(hatGedankenstrich(alles)).toBe(false);
    const du = einwandFolien(d, ang, m, "du");
    // ohne Fußzeile (dort steht neutral „Ihre Beratung“ bzw. die Gesellschaft)
    expect(du.map((f) => f.html.replace(/<div class="foot">[\s\S]*$/, "")).join(" ")).not.toMatch(/\bSie\b|\bIhnen\b|\bIhr\b/);
  });

  it("ohne günstigere Stufe kein Satz zur kleinsten Stufe", () => {
    const eine = cleanAngebote({ items: [{ sparte: "Hausrat", tarif: "Komfort", beitragMonat: 8.2, empfohlen: true }] });
    expect(folie(einwandFolien(d, eine, m), "einwand-preis")).not.toContain("kleinste Stufe");
  });
});

describe("Demo zeigt Fassung B", () => {
  it("Entscheidung mit Abschluss-Knopf, Einwände vorhanden", () => {
    const fs = demoFolien(demoAngebote());
    expect(fs.map((f) => f.id)).not.toContain("risiken");
    expect(folie(fs, "entscheidung")).toContain("data-zusage");
    expect(demoEinwaende(demoAngebote())).toHaveLength(4);
  });
});

describe("Messung: Abschlussquote je Präsentation", () => {
  const ev = (appointmentId: string, quelle: string, art: string, folie: string, variante = "B", customerId = "k1"): Ereignis => ({ appointmentId, customerId, quelle, art, folie, variante });

  it("zählt Präsentationen ab der dritten Folie, Abschluss per Zusage oder abgeschlossenem Kontakt", () => {
    expect(zaehltAlsGezeigt("titel")).toBe(false);
    expect(zaehltAlsGezeigt("situation")).toBe(false);
    expect(zaehltAlsGezeigt("einwand-preis")).toBe(false);
    expect(zaehltAlsGezeigt("empfehlung")).toBe(true);
    const r = auswerten(
      [
        // t1: B, im Termin gezeigt, Zusage im Termin
        ev("t1", "termin", "folie", "titel"),
        ev("t1", "termin", "folie", "empfehlung"),
        ev("t1", "termin", "zusage", ""),
        // t2: B, gezeigt, Kunde öffnet Link bis zur Entscheidung und sagt dort zu
        ev("t2", "termin", "folie", "beitrag"),
        ev("t2", "kundenlink", "folie", "entscheidung"),
        ev("t2", "kundenlink", "zusage", ""),
        // t3: B, gezeigt, kein Abschluss
        ev("t3", "termin", "folie", "empfehlung"),
        // t4: B, nur Titel (zählt nicht)
        ev("t4", "termin", "folie", "titel"),
        // t5: A, gezeigt, Kontakt abgeschlossen
        ev("t5", "termin", "folie", "beitrag", "A"),
        // anderer Vermittler
        ev("t6", "termin", "folie", "beitrag", "A", "k2"),
      ],
      new Set(["t5"]),
    );
    expect(r.k1.B).toMatchObject({ praesentationen: 3, abschluesse: 2, zusagenTermin: 1, zusagenKundenlink: 1, kundenlinkGeoeffnet: 1, kundenlinkEntscheidung: 1 });
    expect(r.k1.B.abschlussquote).toBeCloseTo(0.667, 3);
    expect(r.k1.A).toMatchObject({ praesentationen: 1, abschluesse: 1, abschlussquote: 1 });
    expect(r.k2.A).toMatchObject({ praesentationen: 1, abschluesse: 0, abschlussquote: 0 });
    expect(r.k2.B.abschlussquote).toBeNull();
  });

  it("speichert keine Personendaten (nur Termin, Quelle, Art, Folie, Variante)", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const modell = schema.slice(schema.indexOf("model PraesentationEreignis {"));
    const felder = modell.slice(0, modell.indexOf("\n}")).split("\n").slice(1).map((z) => z.trim().split(/\s+/)[0]).filter((x) => /^[a-z]/.test(x));
    expect(felder.sort()).toEqual(["appointment", "appointmentId", "art", "createdAt", "customer", "customerId", "folie", "id", "quelle", "variante"]);
  });
});
