import { describe, expect, it } from "vitest";
import { beitragAus, cleanAngebote, sparteSchalten, type AngeboteDaten } from "@/lib/angebote-daten";
import { demoAngebote, demoFolien } from "@/lib/demo-beratung";
import { folieNachKlick } from "@/components/folien-deck";

/** Ausgangslage dieser Tests: nur Haftpflicht gewählt, Hausrat, Rechtsschutz und Unfall als Zusatz (die Live-Demo startet seit 19.11.2026 mit drei Sparten). */
const nurHaftpflicht = (): ReturnType<typeof demoAngebote> => {
  const d = demoAngebote();
  return { ...d, items: d.items.map((i) => (i.sparte === "Hausrat" || i.sparte === "Rechtsschutz" ? { ...i, zusatz: true, gewaehlt: false } : i)) };
};

// Cross-Selling im Termin (Ole, 18.11.2026): per „Mit anschauen“ dazugenommene Produkte stehen direkt hinter
// „Ihr Schutz im Überblick“ (nicht davor), in der Reihenfolge des Hinzufügens; der Beitrag bleibt dahinter und rechnet
// sie mit; das Deck springt auf die neue Folie mit „{Produkt} hinzugefügt“.

const am = new Date("2026-11-17T10:00:00Z");
const idx = (d: AngeboteDaten, sparte: string) => d.items.findIndex((i) => i.sparte === sparte);
const ids = (d: AngeboteDaten) => demoFolien(d, am).map((f) => f.id);
const dazu = (d: AngeboteDaten, sparte: string) => sparteSchalten(d, idx(d, sparte))!;
/** Klick im Deck auf „Mit anschauen“ (aktuelle Folie: Überblick) */
const klick = (vorher: AngeboteDaten, sparte: string) => {
  const alt = demoFolien(vorher, am);
  const nachher = dazu(vorher, sparte);
  const neu = demoFolien(nachher, am);
  return { nachher, neu, z: folieNachKlick(alt, "ueberblick", neu, true, alt.findIndex((f) => f.id === "ueberblick")) };
};

describe("Präsentation: hinzugefügte Produkte hinter der aktuellen Folie", () => {
  it("0 Produkte: Überblick direkt vor dem Beitrag, keine Reihenfolge gespeichert", () => {
    const d = nurHaftpflicht();
    const x = ids(d);
    expect(x.filter((id) => id.startsWith("vergleich-"))).toEqual(["vergleich-haftpflicht-0"]);
    expect(x.indexOf("ueberblick")).toBe(x.indexOf("beitrag") - 1);
    expect(x.slice(-3)).toEqual(["entscheidung", "weiter", "danke"]);
    expect(d.zusatzFolge).toBeUndefined();
  });

  it("1 Produkt: Folie direkt nach dem Überblick, Sprung dorthin mit Hinweis, Beitrag dahinter rechnet mit", () => {
    const { nachher, neu, z } = klick(nurHaftpflicht(), "Unfall");
    const x = neu.map((f) => f.id);
    expect(x.indexOf("vergleich-unfall-3")).toBe(x.indexOf("ueberblick") + 1);
    expect(x.indexOf("beitrag")).toBe(x.indexOf("vergleich-unfall-3") + 1);
    expect(z).toEqual({ i: x.indexOf("vergleich-unfall-3"), hinweis: "Unfall hinzugefügt" });
    expect(nachher.zusatzFolge).toEqual(["Unfall"]);
    // Haftpflicht Komfort 8,40 + Unfall Komfort 13,40 = 21,80, 2 Verträge: 5 %
    expect(beitragAus(nachher)).toMatchObject({ einzelSumme: 21.8, rabatt: { prozent: 5 } });
    expect(neu.find((f) => f.id === "beitrag")!.html).toContain(beitragAus(nachher).endbeitrag!.toFixed(2).replace(".", ","));
  });

  it("2 Produkte: das zweite hinter dem ersten (Reihenfolge des Hinzufügens, nicht des Angebots), Beitrag am Ende", () => {
    // Unfall steht im Angebot hinter Hausrat; zuerst Unfall, dann Hausrat
    const eins = klick(nurHaftpflicht(), "Unfall");
    const zwei = klick(eins.nachher, "Hausrat");
    const x = zwei.neu.map((f) => f.id);
    const u = x.indexOf("ueberblick");
    expect(x.slice(u, u + 4)).toEqual(["ueberblick", "vergleich-unfall-3", "vergleich-hausrat-1", "beitrag"]);
    expect(zwei.z).toEqual({ i: u + 2, hinweis: "Hausrat hinzugefügt" });
    expect(zwei.nachher.zusatzFolge).toEqual(["Unfall", "Hausrat"]);
    expect(x.slice(-4)).toEqual(["beitrag", "entscheidung", "weiter", "danke"]);
    expect(beitragAus(zwei.nachher).rabatt?.prozent).toBe(10);
    // gespeichert (offersJson) und neu gelesen: gleiche Reihenfolge
    const gelesen = cleanAngebote(JSON.parse(JSON.stringify(zwei.nachher)));
    expect(gelesen.zusatzFolge).toEqual(["Unfall", "Hausrat"]);
    expect(ids(gelesen)).toEqual(x);
  });

  it("Herausnehmen und wieder dazu: Platz frei, dann hinten; kein Sprung beim Herausnehmen", () => {
    let d = dazu(dazu(nurHaftpflicht(), "Unfall"), "Hausrat");
    const alt = demoFolien(d, am);
    d = dazu(d, "Unfall"); // wieder heraus
    expect(d.zusatzFolge).toEqual(["Hausrat"]);
    const neu = demoFolien(d, am);
    expect(neu.some((f) => f.id === "vergleich-unfall-3")).toBe(false);
    const u = alt.findIndex((f) => f.id === "ueberblick");
    expect(folieNachKlick(alt, "ueberblick", neu, false, u)).toEqual({ i: neu.findIndex((f) => f.id === "ueberblick"), hinweis: null });
    d = dazu(d, "Unfall");
    expect(d.zusatzFolge).toEqual(["Hausrat", "Unfall"]);
    const x = ids(d);
    expect(x.indexOf("vergleich-unfall-3")).toBe(x.indexOf("vergleich-hausrat-1") + 1);
  });

  it("Produkt mit nur einem Tarif bekommt ebenfalls eine Folie mit Preis", () => {
    const d0 = nurHaftpflicht();
    const d: AngeboteDaten = { ...d0, items: d0.items.filter((i) => i.tarif !== "Unfall Smart") };
    const n = dazu(d, "Unfall");
    const f = demoFolien(n, am).find((x) => x.id.startsWith("vergleich-unfall"))!;
    expect(f.produkt).toBe("Unfall");
    expect(f.html).toContain("13,40");
  });

  it("Bereinigen: unbekannte oder doppelte Sparten fallen aus der Reihenfolge", () => {
    const d = cleanAngebote({ ...nurHaftpflicht(), zusatzFolge: ["Unfall", "Unfall", "Privathaftpflicht", "Gibt es nicht", 3, "Hausrat"] });
    expect(d.zusatzFolge).toEqual(["Unfall", "Hausrat"]);
  });

  it("Tarif wählen bzw. Baustein schalten ohne neue Folie: Deck bleibt auf der aktuellen Folie", () => {
    const fs = demoFolien(nurHaftpflicht(), am);
    expect(folieNachKlick(fs, "vergleich-haftpflicht-0", fs, true, 4)).toEqual({ i: fs.findIndex((f) => f.id === "vergleich-haftpflicht-0"), hinweis: null });
  });
});
