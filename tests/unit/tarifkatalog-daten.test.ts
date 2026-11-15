// Prüft die Tarifkatalog-Daten in data/tarifkatalog (Format siehe data/tarifkatalog/README.md).
// Die Texte erscheinen auf Kundenfolien: Längen begrenzt (nichts wird abgeschnitten), keine Gedankenstriche.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const ROOT = join(__dirname, "..", "..", "data", "tarifkatalog");
const GESELLSCHAFTEN = ["allianz", "axa", "signal-iduna"];
const BAUSTEIN_WERTE = ["optional", "inklusive", "nein"];
const GRENZE = { tarifKurz: 14, merkmalKurz: 28, bausteinKurz: 20, wert: 24, stufen: 4, standard: 5 };

type Merkmal = { key: string; label: string; kurz: string; standard?: boolean };
type Sparte = { key: string; label: string; merkmale: Merkmal[]; bausteine: Merkmal[] };
type Tarif = {
  name: string;
  kurz: string;
  stufe: number;
  empfohlen?: boolean;
  werte: Record<string, string>;
  bausteine?: Record<string, string>;
  quelle: string;
  stand: string;
};
type Datei = { gesellschaft: string; sparte: string; produkt: string; inAllenTarifen?: string[]; tarife: Tarif[]; offen?: string[] };

const schema = JSON.parse(readFileSync(join(ROOT, "schema.json"), "utf8")) as { sparten: Sparte[] };
const sparten = new Map(schema.sparten.map((s) => [s.key, s]));

const dateien = GESELLSCHAFTEN.flatMap((g) => {
  const dir = join(ROOT, g);
  try {
    if (!statSync(dir).isDirectory()) return [];
  } catch {
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "buendel.json")
    .map((f) => ({ ordner: g, datei: f, pfad: join(dir, f) }));
});

/** Alle Zeichenketten eines JSON-Werts mit Pfad. */
function texte(v: unknown, pfad = ""): Array<[string, string]> {
  if (typeof v === "string") return [[pfad, v]];
  if (Array.isArray(v)) return v.flatMap((x, i) => texte(x, `${pfad}[${i}]`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => texte(x, pfad ? `${pfad}.${k}` : k));
  return [];
}

describe("Tarifkatalog: Schema", () => {
  it("hat alle Sparten mit eindeutigen Keys, kurzen Kurznamen und höchstens 5 Standardmerkmalen", () => {
    const keys = ["katze-kranken", "katze-op", "hund-kranken", "hund-op", "haftpflicht", "hausrat", "rechtsschutz", "wohngebaeude", "tierhalter-hund", "tierhalter-pferd", "unfall"];
    expect([...sparten.keys()].sort()).toEqual([...keys].sort());
    for (const s of schema.sparten) {
      const mk = s.merkmale.map((m) => m.key);
      expect(new Set(mk).size, `${s.key}: doppelte Merkmal-Keys`).toBe(mk.length);
      const bk = s.bausteine.map((b) => b.key);
      expect(new Set(bk).size, `${s.key}: doppelte Baustein-Keys`).toBe(bk.length);
      for (const m of s.merkmale) expect(m.kurz.length, `${s.key}.${m.key}.kurz „${m.kurz}“`).toBeLessThanOrEqual(GRENZE.merkmalKurz);
      for (const b of s.bausteine) expect(b.kurz.length, `${s.key}.${b.key}.kurz „${b.kurz}“`).toBeLessThanOrEqual(GRENZE.bausteinKurz);
      const std = s.merkmale.filter((m) => m.standard).length;
      expect(std, `${s.key}: Standardmerkmale`).toBeGreaterThan(0);
      expect(std, `${s.key}: Standardmerkmale`).toBeLessThanOrEqual(GRENZE.standard);
    }
  });

  it("enthält keine Gedankenstriche", () => {
    for (const [p, t] of texte(schema)) expect(hatGedankenstrich(t), `schema.json ${p}: „${t}“`).toBe(false);
  });
});

describe("Tarifkatalog: Gesellschaftsdateien", () => {
  it("gibt es", () => {
    expect(dateien.length).toBeGreaterThan(0);
  });

  for (const d of dateien) {
    const name = relative(ROOT, d.pfad);
    it(name, () => {
      const j = JSON.parse(readFileSync(d.pfad, "utf8")) as Datei;
      const s = sparten.get(j.sparte);
      expect(s, `${name}: Sparte „${j.sparte}“ nicht im Schema`).toBeDefined();
      if (!s) return;
      expect(`${j.sparte}.json`, `${name}: Dateiname passt nicht zur Sparte`).toBe(d.datei);
      expect(j.gesellschaft, `${name}: gesellschaft fehlt`).toBeTruthy();
      expect(j.produkt, `${name}: produkt fehlt`).toBeTruthy();

      const merkmale = new Set(s.merkmale.map((m) => m.key));
      const bausteine = new Set(s.bausteine.map((b) => b.key));
      expect(j.tarife.length, `${name}: keine Tarife`).toBeGreaterThan(0);
      expect(j.tarife.length, `${name}: höchstens ${GRENZE.stufen} Stufen`).toBeLessThanOrEqual(GRENZE.stufen);
      expect(j.tarife.map((t) => t.stufe), `${name}: Stufen aufsteigend ab 1`).toEqual(j.tarife.map((_, i) => i + 1));
      expect(j.tarife.filter((t) => t.empfohlen).length, `${name}: höchstens eine Empfehlung`).toBeLessThanOrEqual(1);

      for (const t of j.tarife) {
        const wo = `${name} „${t.name}“`;
        expect(t.name, `${wo}: name`).toBeTruthy();
        expect(t.kurz.length, `${wo}: kurz „${t.kurz}“`).toBeLessThanOrEqual(GRENZE.tarifKurz);
        expect(t.kurz.length, `${wo}: kurz leer`).toBeGreaterThan(0);
        expect(t.quelle, `${wo}: quelle fehlt`).toMatch(/^https:\/\//);
        expect(t.stand, `${wo}: stand fehlt`).toMatch(/^\d{4}-\d{2}(-\d{2})?$/);
        for (const [k, v] of Object.entries(t.werte)) {
          expect(merkmale.has(k), `${wo}: Merkmal „${k}“ nicht im Schema`).toBe(true);
          expect(typeof v, `${wo}: ${k}`).toBe("string");
          expect(v.length, `${wo}: ${k} = „${v}“ zu lang`).toBeLessThanOrEqual(GRENZE.wert);
          expect(v.length, `${wo}: ${k} leer`).toBeGreaterThan(0);
        }
        for (const [k, v] of Object.entries(t.bausteine ?? {})) {
          expect(bausteine.has(k), `${wo}: Baustein „${k}“ nicht im Schema`).toBe(true);
          expect(BAUSTEIN_WERTE, `${wo}: Baustein ${k} = „${v}“`).toContain(v);
        }
      }

      for (const [p, t] of texte(j)) {
        if (/quelle|quellen/.test(p)) continue;
        expect(hatGedankenstrich(t), `${name} ${p}: „${t}“`).toBe(false);
      }
    });
  }
});
