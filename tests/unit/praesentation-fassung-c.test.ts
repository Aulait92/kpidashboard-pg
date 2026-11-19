// Beratungspräsentation, Herausforderer Fassung C (19.11.2026, Splittest „praesentation“ gegen B): Einstieg mit dem
// Anliegen, Beitrag an der Entscheidung, Wahl zwischen zwei Paketen, bisheriger Vertrag in Euro, „Unverbindlich“.
import { describe, expect, it } from "vitest";
import { cleanAngebote } from "@/lib/angebote";
import { paketWaehlen, sparteSchalten, tarifWaehlen } from "@/lib/angebote-daten";
import { abweichungVonEmpfehlung, entscheidungsPakete, folien, markeFuer, praesentationHtml, SPRECHHINWEIS_C } from "@/lib/praesentation";
import { auswerten, type Ereignis } from "@/lib/praesentation-messung";
import { demoAngebote, demoFassung, demoFolien, demoKlick } from "@/lib/demo-beratung";
import { paketAusAttribut } from "@/components/folien-deck";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";

/** Ausgangslage dieser Tests: nur Haftpflicht gewählt, Hausrat, Rechtsschutz und Unfall als Zusatz (die Live-Demo startet seit 19.11.2026 mit drei Sparten). */
const nurHaftpflicht = (): ReturnType<typeof demoAngebote> => {
  const d = demoAngebote();
  return { ...d, items: d.items.map((i) => (i.sparte === "Hausrat" || i.sparte === "Rechtsschutz" ? { ...i, zusatz: true, gewaehlt: false } : i)) };
};

const d: VorbereitungDaten = {
  lead: { name: "Julia Schneider", telefon: null, email: null, adresse: null, produkt: "Privatschutz" },
  termin: { startsAt: new Date("2026-11-18T09:00:00Z"), mode: "video", berater: "Thomas Lohmann", meetUrl: null },
  zusammenfassung: null,
  formular: [],
  angaben: { versichern: "Familie", interesse: "Haftpflicht und Hausrat" },
  vorbereitetAm: null,
};
const m = markeFuer({ name: "Agentur Lohmann" });
const ang = cleanAngebote({
  items: [
    { sparte: "Privathaftpflicht", tarif: "Haftpflicht Smart", beitragMonat: 5.9, leistungen: ["50 Mio."], merkmale: [{ name: "Schlüsselverlust", wert: "nein" }] },
    { sparte: "Privathaftpflicht", tarif: "Haftpflicht Komfort", beitragMonat: 7.4, leistungen: ["75 Mio."], empfohlen: true, merkmale: [{ name: "Schlüsselverlust", wert: "ja" }] },
    { sparte: "Hausrat", tarif: "Hausrat Komfort", beitragMonat: 8.2, leistungen: ["Neuwert"], empfohlen: true },
  ],
});
const text = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
// Beträge mit geschütztem Leerzeichen vor „€“ (Intl) wie normale Leerzeichen vergleichen
const folie = (fs: { id: string; html: string }[], id: string) => fs.find((f) => f.id === id)!.html.replace(/\u00a0/g, " ");
const C = { variante: "C" as const };

describe("Fassung C: Reihenfolge und Einstieg", () => {
  it("zwei Folien weniger bis zur Entscheidung als B (Begrüßung und Beitrag gehen auf)", () => {
    const b = folien(d, ang, m, "sie", { variante: "B" }).map((f) => f.id);
    const c = folien(d, ang, m, "sie", C).map((f) => f.id);
    expect(c).toEqual(["situation", "beispiel", "empfehlung", "vergleich-haftpflicht-0", "entscheidung", "weiter", "danke"]);
    expect(b.indexOf("entscheidung") - c.indexOf("entscheidung")).toBe(2);
    expect(c).not.toContain("titel");
    expect(c).not.toContain("beitrag");
  });

  it("Einstieg mit dem Anliegen des Kunden, Prüffrage, Ablauf in einer Zeile, eigener Sprechhinweis", () => {
    const fs = folien(d, ang, m, "sie", C);
    const s = folie(fs, "situation");
    expect(s).toContain("Darum geht es Ihnen, Julia Schneider");
    expect(s).toContain("Wichtig ist: Haftpflicht und Hausrat");
    expect(s).toContain("Stimmt das so?");
    expect(s).toContain("Ihre Entscheidung");
    expect(fs[0].hinweis).toBe(SPRECHHINWEIS_C.situation);
    const du = folien(d, ang, m, "du", C);
    expect(folie(du, "situation")).toContain("Darum geht es dir, Julia");
  });
});

describe("Fassung C: Entscheidung mit zwei Paketen", () => {
  it("Empfehlung und eine Stufe kleiner, echte Preise, was fehlt, ein Schritt zur Zusage", () => {
    const fs = folien(d, ang, m, "sie", C);
    const e = folie(fs, "entscheidung");
    expect(e).toContain('data-pakete="2"');
    expect(e).toContain('data-paket="1,2" data-paket-art="empfehlung" aria-pressed="true"');
    expect(e).toContain('data-paket="0,2" data-paket-art="guenstiger" aria-pressed="false"');
    // 7,40 + 8,20 = 15,60 € bzw. 5,90 + 8,20 = 14,10 €, je mit Preis pro Tag
    expect(e).toContain("15,60");
    expect(e).toContain("14,10");
    expect(e).toContain("rund 0,52 € am Tag");
    expect(e).toContain("Unterschied: ohne Schlüsselverlust");
    expect(e).toContain("Schutz ab 1. Dezember");
    expect(e).toContain("Welches Paket passt besser zu Ihnen?");
    expect(e).toContain("Unverbindlich. Den Antrag füllen wir gemeinsam aus.");
    expect(e.match(/data-zusage/g)).toHaveLength(1);
    expect(fs.find((f) => f.id === "entscheidung")!.hinweis).toBe(SPRECHHINWEIS_C.zweiPakete);
    const alles = text(fs.map((f) => f.html).join(" "));
    expect(alles).not.toMatch(/Garantie|garantiert|nur heute|letzte Chance|die meisten|beliebteste/i);
    expect(hatGedankenstrich(alles.replace(/\s—\s/g, " "))).toBe(false);
    expect(hatGedankenstrich(Object.values(SPRECHHINWEIS_C).join(" "))).toBe(false);
  });

  it("kleineres Paket gewählt: beide bleiben, das kleinere ist markiert; Beitrag folgt der Wahl", () => {
    const k = paketWaehlen(ang, [0, 2])!;
    const p = entscheidungsPakete(k);
    expect(p.map((x) => [x.art, x.gewaehlt, x.beitrag.endbeitrag])).toEqual([
      ["empfehlung", false, 15.6],
      ["guenstiger", true, 14.1],
    ]);
  });

  it("Auswahl von Hand neben der Empfehlung; keine Köder-Stufe (die nächste, nicht die billigste)", () => {
    const demo = nurHaftpflicht();
    // Haftpflicht Basis 4,20 / Smart 5,90 / Komfort 8,40 (empfohlen): kleiner ist Smart
    const p = entscheidungsPakete(demo);
    expect(p.map((x) => x.art)).toEqual(["empfehlung", "guenstiger"]);
    expect(demo.items[p[1].items[0]].tarif).toBe("Haftpflicht Smart");
    // zuerst was fehlt, dann andere Werte
    expect(p[1].fehlt).toEqual(["ohne Schlüsselverlust beruflich", "Versicherungssumme 20 Mio. €"]);
    const basis = entscheidungsPakete(tarifWaehlen(demo, 0)!);
    expect(basis.map((x) => [x.art, x.gewaehlt])).toEqual([
      ["auswahl", true],
      ["empfehlung", false],
    ]);
    expect(basis[0].fehlt).toEqual(["ohne Forderungsausfall", "ohne Gefälligkeitsschäden"]);
  });

  it("Kombi-Rabatt je Paket gerechnet, Hinweis nach § 7a VVG an der Entscheidung", () => {
    const demo = nurHaftpflicht();
    const hausrat = demo.items.findIndex((i) => i.sparte === "Hausrat");
    const zwei = sparteSchalten(demo, hausrat)!;
    const p = entscheidungsPakete(zwei);
    expect(p[0].beitrag.endbeitrag).toBe(20.52);
    expect(p[0].beitrag.rabatt?.prozent).toBe(5);
    // Smart-Linie zählt nicht zum Kombi-Rabatt: 5,90 + 7,60 + 3,40 (Fahrrad) = 16,90 €
    expect(p[1].beitrag.endbeitrag).toBe(16.9);
    expect(p[1].beitrag.rabatt).toBeNull();
    // Unterschied je Sparte reihum: Haftpflicht ohne Schlüsselverlust, Hausrat mit kleinerer Grenze
    expect(p[1].fehlt).toEqual(["ohne Schlüsselverlust beruflich", "Grobe Fahrlässigkeit bis 10.000 €"]);
    const e = folie(demoFolien(zwei, new Date("2026-11-18T09:00:00Z"), null, "C"), "entscheidung");
    expect(e).toContain("mit Kombi-Rabatt 5 %");
    expect(e).toContain("data-7a-vvg");
    expect(e).toContain("auch einzeln abschließbar");
  });

  it("ein Paket, wenn es nichts zu wählen gibt: ohne Schalter, Frage wie gewohnt", () => {
    const eine = cleanAngebote({ items: [{ sparte: "Hausrat", tarif: "Hausrat Komfort", beitragMonat: 8.2, empfohlen: true }] });
    const fs = folien(d, eine, m, "sie", C);
    const e = folie(fs, "entscheidung");
    expect(e).toContain('data-pakete="1"');
    expect(e).not.toContain("data-paket=");
    expect(e).toContain("Sollen wir das so machen?");
    expect(fs.find((f) => f.id === "entscheidung")!.hinweis).toBe(SPRECHHINWEIS_C.einPaket);
    // ohne Angebote: Platzhalter, kein Paket
    expect(folie(folien(d, null, m, "sie", C), "entscheidung")).toContain("Ihr Angebot stellen wir gemeinsam zusammen.");
  });

  it("bisheriger Vertrag in Euro nur, wenn erfasst", () => {
    const mit = {
      ...ang,
      bisher: [{ sparte: "Privathaftpflicht", gesellschaft: "Alt AG", tarif: null, beitragMonat: 6.5, info: [], merkmale: [], ablauf: null, kuendbarZum: null, fristMonate: null }],
    };
    const e = folie(folien(d, mit, m, "sie", C), "entscheidung");
    expect(e).toContain("data-bisher-euro");
    // (7,40 − 6,50) × 12 = 10,80 € mehr im Jahr
    expect(text(e)).toContain("Ihr bisheriger Vertrag Privathaftpflicht: 6,50 € im Monat. Ihre Auswahl:");
    expect(e).toContain("10,80 € mehr im Jahr als bisher");
    expect(folie(folien(d, ang, m, "sie", C), "entscheidung")).not.toContain("data-bisher-euro");
  });

  it("Du-Fassung, Zusage-Stand, PDF und Kundenlink ohne Knopf und Satz", () => {
    const du = folien(d, ang, m, "du", C);
    const ohneFuss = du.map((f) => f.html.replace(/<div class="foot">[\s\S]*$/, "")).join(" ");
    expect(ohneFuss).not.toMatch(/\bSie\b|\bIhnen\b|\bIhr\b|\bIhre\b/);
    expect(folie(du, "entscheidung")).toContain("Welches Paket passt besser zu dir?");
    const z = folien(d, ang, m, "sie", { variante: "C", zugesagtAm: new Date() });
    expect(folie(z, "entscheidung")).toContain("✓ Zugesagt");
    expect(praesentationHtml(z, m, "T")).toContain(".zusage-zeile{display:none}");
  });
});

describe("Abweichung von der Empfehlung (für die Beratungsdokumentation)", () => {
  it("null bei Empfehlung; sonst welche Tarife statt welcher, Unterschied wie auf der Karte, günstiger ja oder nein", () => {
    expect(abweichungVonEmpfehlung(ang)).toBeNull();
    expect(abweichungVonEmpfehlung(null)).toBeNull();
    expect(abweichungVonEmpfehlung(paketWaehlen(ang, [0, 2]))).toEqual({
      statt: [{ sparte: "Privathaftpflicht", gewaehlt: "Haftpflicht Smart", empfohlen: "Haftpflicht Komfort" }],
      unterschied: ["ohne Schlüsselverlust"],
      guenstiger: true,
    });
    const demo = nurHaftpflicht();
    const hausrat = demo.items.findIndex((i) => i.sparte === "Hausrat");
    // Hausrat dazu (Empfehlung), dann Haftpflicht Smart: günstiger, Kombi-Rabatt fällt weg und ist eingerechnet
    const d2 = tarifWaehlen(sparteSchalten(demo, hausrat)!, 1)!;
    expect(abweichungVonEmpfehlung(d2)!.guenstiger).toBe(true);
    // teurer als die Empfehlung (Premium statt Komfort): abweichend, nicht „günstiger“
    const teurer = cleanAngebote({
      items: [
        { sparte: "Hausrat", tarif: "Hausrat Komfort", beitragMonat: 8.2, empfohlen: true, gewaehlt: false },
        { sparte: "Hausrat", tarif: "Hausrat Premium", beitragMonat: 11.4, gewaehlt: true },
      ],
    });
    expect(abweichungVonEmpfehlung(teurer)).toMatchObject({ statt: [{ gewaehlt: "Hausrat Premium", empfohlen: "Hausrat Komfort" }], guenstiger: false });
  });
});

describe("Paket wählen (Termin und Demo)", () => {
  it("je Sparte eine Stufe, nur gewählte Sparten, sonst null", () => {
    expect(paketWaehlen(ang, [0, 2])!.items.map((i) => i.gewaehlt)).toEqual([true, false, true]);
    expect(paketWaehlen(ang, [0, 1])).toBeNull();
    expect(paketWaehlen(ang, [9])).toBeNull();
    expect(paketWaehlen(ang, [])).toBeNull();
    const demo = nurHaftpflicht();
    const unfall = demo.items.findIndex((i) => i.sparte === "Unfall");
    expect(paketWaehlen(demo, [unfall])).toBeNull();
    expect(demoKlick(ang, { tarif: null, sparte: false, item: -1, baustein: -1, aktiv: true, paket: [0, 2] })!.items[0].gewaehlt).toBe(true);
  });

  it("Attribut data-paket streng gelesen", () => {
    expect(paketAusAttribut("1,2")).toEqual([1, 2]);
    expect(paketAusAttribut("7")).toEqual([7]);
    expect(paketAusAttribut("1,x")).toBeNull();
    expect(paketAusAttribut("")).toBeNull();
    expect(paketAusAttribut(undefined)).toBeNull();
  });
});

describe("Demo und Messung", () => {
  it("Demo bleibt B, ?fassung=c zeigt C", () => {
    expect(demoFassung(undefined)).toBe("B");
    expect(demoFassung("b")).toBe("B");
    expect(demoFassung("C")).toBe("C");
    expect(demoFolien(nurHaftpflicht()).map((f) => f.id)).toContain("beitrag");
    expect(demoFolien(nurHaftpflicht(), new Date(), null, "C").map((f) => f.id)).not.toContain("beitrag");
  });

  it("Abschlussquote je Variante, C getrennt von B", () => {
    const ev = (appointmentId: string, art: string, folie: string, variante: string): Ereignis => ({ appointmentId, customerId: "k1", quelle: "termin", art, folie, variante });
    const r = auswerten(
      [ev("t1", "folie", "empfehlung", "C"), ev("t1", "zusage", "", "C"), ev("t2", "folie", "empfehlung", "C"), ev("t3", "folie", "empfehlung", "B")],
      new Set(),
    );
    expect(r.k1.C).toMatchObject({ praesentationen: 2, abschluesse: 1, abschlussquote: 0.5 });
    expect(r.k1.B).toMatchObject({ praesentationen: 1, abschluesse: 0 });
  });
});
