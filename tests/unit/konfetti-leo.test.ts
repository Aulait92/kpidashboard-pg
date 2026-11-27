// Konfetti bei gewonnenem Deal und Texte des Maskottchens Leo (Ole, 27.11.2026).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _konfettiZuruecksetzen, bewegungReduziert, erzeugeTeilchen, ersteFeier, feiern, GLUECKWUNSCH, KONFETTI_FARBEN, konfetti } from "@/lib/konfetti";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { heuteLeer, leoWillkommen } from "@/lib/leo";

/** Minimales Browser-Gerüst: Fenster mit matchMedia, document mit Canvas, requestAnimationFrame. */
function browser({ reduziert = false } = {}) {
  const canvases: { removed: boolean }[] = [];
  const ctx2d = new Proxy({}, { get: () => () => {} });
  const doc = {
    createElement: () => {
      const c = { removed: false, width: 0, height: 0, style: {}, dataset: {} as Record<string, string>, setAttribute() {}, getContext: () => ctx2d, remove() { c.removed = true; } };
      canvases.push(c);
      return c;
    },
    body: { appendChild: () => {} },
  };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: reduziert && q.includes("reduce") }), innerWidth: 390, innerHeight: 800, devicePixelRatio: 2 });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  return canvases;
}

describe("Konfetti je Deal nur einmal", () => {
  beforeEach(() => _konfettiZuruecksetzen());
  afterEach(() => vi.unstubAllGlobals());

  it("feiert einen Deal genau einmal, andere Deals weiter", () => {
    expect(ersteFeier("lead-1")).toBe(true);
    expect(ersteFeier("lead-1")).toBe(false);
    expect(ersteFeier("lead-2")).toBe(true);
    expect(ersteFeier("")).toBe(false);
    expect(ersteFeier(null)).toBe(false);
  });

  it("feiern(): zweiter Aufruf für denselben Deal löst nichts aus (kein zweites Konfetti)", () => {
    const canvases = browser();
    expect(feiern("lead-1")).toEqual({ animiert: true });
    expect(canvases).toHaveLength(1);
    expect(feiern("lead-1")).toBeNull();
    expect(canvases).toHaveLength(1);
  });

  it("während eines laufenden Konfettis startet kein zweites", () => {
    const canvases = browser();
    expect(konfetti()).toBe(true);
    expect(konfetti()).toBe(false);
    expect(canvases).toHaveLength(1);
  });

  it("reduzierte Bewegung: keine Animation, gilt trotzdem als gefeiert (Toast kommt)", () => {
    const canvases = browser({ reduziert: true });
    expect(bewegungReduziert()).toBe(true);
    expect(feiern("lead-1")).toEqual({ animiert: false });
    expect(canvases).toHaveLength(0);
    expect(feiern("lead-1")).toBeNull();
  });

  it("ohne Browser (Server): nichts animieren", () => {
    expect(bewegungReduziert()).toBe(true);
    expect(konfetti()).toBe(false);
  });

  it("Teilchen in den drei Farben, Start unten", () => {
    const t = erzeugeTeilchen(9, 390, 800, () => 0.5);
    expect(new Set(t.map((p) => p.farbe))).toEqual(new Set(KONFETTI_FARBEN));
    expect(t.every((p) => p.y > 700 && p.vy < 0)).toBe(true);
    expect([...KONFETTI_FARBEN]).toEqual(["#2563eb", "#0b1220", "#22c55e"]);
  });
});

describe("Texte (Sie-Form, ohne Gedankenstriche, nur was stimmt)", () => {
  it("Glückwunsch", () => {
    expect(GLUECKWUNSCH).toBe("Glückwunsch zum Abschluss! 🎉");
  });

  it("Willkommen in der Einrichtung", () => {
    expect(leoWillkommen("Herr Becker")).toEqual({ titel: "Willkommen, Herr Becker!", text: "Ich bin Leo und helfe Ihnen bei der Einrichtung." });
    expect(leoWillkommen(null).titel).toBe("Willkommen!");
  });

  it("Heute leer: Push und Assistent nur, wenn es stimmt", () => {
    expect(heuteLeer({ push: true, assistentMinuten: 0 }).text).toBe("Neue Leads melde ich Ihnen sofort per Push. Ihr Assistent schreibt sie in wenigen Minuten an.");
    expect(heuteLeer({ push: true, assistentMinuten: 0 }).zuKontakten).toBe(false);
    expect(heuteLeer({ push: false, assistentMinuten: null })).toEqual({ titel: "Alles erledigt für heute.", text: "Neue Leads finden Sie sofort unter Kontakte.", zuKontakten: true });
    // Lange Wartezeit (Lead soll erst selbst buchen): kein „in wenigen Minuten“
    expect(heuteLeer({ push: true, assistentMinuten: 60 }).text).not.toContain("Minuten");
  });

  it("keine Gedankenstriche", () => {
    const texte = [GLUECKWUNSCH, ...Object.values(leoWillkommen("Frau Weber")), ...Object.values(heuteLeer({ push: true, assistentMinuten: 0 })).filter((x) => typeof x === "string")];
    for (const t of texte) expect(hatGedankenstrich(t as string)).toBe(false);
  });
});
