// Trennung Chat-Assistent / Dokument-KI (Ole, 18.11.2026): Der Chat (lib/whatsapp/bot.ts, lib/kampagnen/llm.ts
// runAgent) darf nie Dokumente bekommen und nicht an den Dokument-Zugang kommen. Importgrenze, statisch geprüft:
//   1. Die statische Importkette des Chats enthält kein Modul aus lib/policen/auslesen und nicht das openai-SDK.
//   2. lib/policen/auslesen wird nur von freigegebenen Stellen eingebunden (Webhook-Eingang, Cron, Diagnose,
//      Vergleichsblatt, Admin-Einstellung).
//   3. Das openai-SDK wird nur im Dokument-Adapter eingebunden.
//   4. lib/policen/auslesen bindet nichts aus dem Chat ein.
// Die Laufzeitprüfung (Chat-Anfrage ohne Dokumente, Auslesen ohne Chat-Client) steht in
// tests/integration/policen-auslesen.test.ts.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const SRC = join(ROOT, "src");

function dateien(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "generated" || n === "node_modules") return [];
    return statSync(p).isDirectory() ? dateien(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?[^'";]*?from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g;
const DYN_RE = /import\(\s*["']([^"']+)["']\s*\)/g;

function aufloesen(von: string, spez: string): string | null {
  let basis: string;
  if (spez.startsWith("@/")) basis = join(SRC, spez.slice(2));
  else if (spez.startsWith(".")) basis = resolve(dirname(von), spez);
  else return null;
  for (const k of [basis, `${basis}.ts`, `${basis}.tsx`, join(basis, "index.ts"), join(basis, "index.tsx")]) if (existsSync(k) && statSync(k).isFile()) return k;
  return null;
}

/** Statische Importe (ohne „import type“) und dynamische Importe einer Datei. */
function importe(datei: string): { statisch: string[]; dynamisch: string[]; pakete: string[] } {
  const src = readFileSync(datei, "utf8");
  const statisch: string[] = [];
  const pakete: string[] = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    if (/^\s*(import|export)\s+type\b/.test(m[0])) continue;
    const spez = m[1] ?? m[2];
    const r = aufloesen(datei, spez);
    if (r) statisch.push(r);
    else if (!spez.startsWith(".") && !spez.startsWith("@/")) pakete.push(spez);
  }
  const dynamisch = [...src.matchAll(DYN_RE)].map((m) => aufloesen(datei, m[1]) ?? m[1]);
  return { statisch, dynamisch, pakete };
}

/** Statische Hülle ab einer Datei (alle Module, die beim Laden mitkommen). */
function huelle(start: string): { module: Set<string>; pakete: Set<string> } {
  const mods = new Set<string>();
  const pakete = new Set<string>();
  const offen = [start];
  while (offen.length) {
    const d = offen.pop()!;
    if (mods.has(d)) continue;
    mods.add(d);
    const i = importe(d);
    i.pakete.forEach((p) => pakete.add(p));
    offen.push(...i.statisch);
  }
  return { module: mods, pakete };
}

const AUSLESEN = join(SRC, "lib/policen/auslesen");
const rel = (p: string) => relative(ROOT, p);
const CHAT = ["src/lib/whatsapp/bot.ts", "src/lib/kampagnen/llm.ts"].map((p) => join(ROOT, p));

describe("Importgrenze Chat-Assistent / Dokument-KI", () => {
  it("die Importkette des Chats enthält kein Modul der Dokument-KI und nicht das openai-SDK", () => {
    for (const start of CHAT) {
      const h = huelle(start);
      expect([...h.module].filter((m) => m.startsWith(AUSLESEN)).map(rel), rel(start)).toEqual([]);
      expect([...h.pakete].filter((p) => p === "openai" || p.startsWith("openai/")), rel(start)).toEqual([]);
      // Auch dynamische Importe der Chat-Dateien selbst führen nicht dorthin
      expect(importe(start).dynamisch.filter((d) => d.startsWith(AUSLESEN)), rel(start)).toEqual([]);
    }
  });

  it("lib/policen/auslesen wird nur an freigegebenen Stellen eingebunden", () => {
    const erlaubt = [
      /^src\/lib\/policen\/auslesen\//,
      /^src\/lib\/whatsapp\/gateway\.ts$/, // Eingang: nach Unterlage bzw. Einwilligung auslesen (dynamisch)
      /^src\/app\/api\/whatsapp\/cron\/route\.ts$/,
      /^src\/app\/api\/ops\/diagnose\/route\.ts$/,
      /^src\/app\/buyer\/termine\/\[id\]\/vorbereitung\/vertraege\//,
      /^src\/components\/policen-vergleichsblatt\.tsx$/,
      /^src\/components\/policen-vergleich-kurz\.tsx$/,
      /^src\/lib\/beratungsdoku-server\.ts$/, // Beratungsdokumentation (Paket B): liest geprüfte Verträge des Vergleichsblatts, nur dynamisch
      /^src\/app\/admin\/neu\/einstellungen\/anbindungen\//,
      /^src\/lib\/policen\/texterkennung\.ts$/, // lokale Texterkennung (Kfz-Unterlagen, 22.11.2026): nur Stichwort-Erkennung aus auslesen/sparte, keine KI, kein Versand
      /^src\/lib\/policen\/flow\/server\.ts$/, // Policen-Strecke v2: nur Status (an, freigegebene Sparten, Pause) für den KI-Satz, nur dynamisch, keine Dokumente
    ];
    const verstoesse: string[] = [];
    for (const d of dateien(SRC)) {
      const r = rel(d);
      const i = importe(d);
      const nutzt = [...i.statisch, ...i.dynamisch].some((x) => x.startsWith(AUSLESEN));
      if (nutzt && !erlaubt.some((re) => re.test(r))) verstoesse.push(r);
    }
    expect(verstoesse).toEqual([]);
  });

  it("der Webhook-Eingang bindet die Dokument-KI nur dynamisch ein (nicht in der Importkette des Chats)", () => {
    const g = importe(join(SRC, "lib/whatsapp/gateway.ts"));
    expect(g.statisch.filter((x) => x.startsWith(AUSLESEN))).toEqual([]);
    expect(g.dynamisch.filter((x) => x.startsWith(AUSLESEN)).map(rel)).toEqual(["src/lib/policen/auslesen/server.ts"]);
  });

  it("das openai-SDK steht nur im Dokument-Adapter", () => {
    const nutzer = dateien(SRC).filter((d) => {
      const i = importe(d);
      return [...i.pakete, ...i.dynamisch].some((p) => p === "openai" || p.startsWith("openai/"));
    });
    expect(nutzer.map(rel)).toEqual(["src/lib/policen/auslesen/anbieter/openai-eu.ts"]);
  });

  it("KI-Clients nur in den Adaptern (lib/policen/auslesen/anbieter), sonst nirgends in lib/policen", () => {
    // ki-eu-konfig (nur Variablen, kein SDK) ist erlaubt
    const verboten = /@anthropic-ai|from "openai"|"@\/lib\/ki-eu"|replicate|runAgent|messages\.create|responses\.create/i;
    const treffer = dateien(join(SRC, "lib/policen"))
      .filter((d) => !d.startsWith(join(AUSLESEN, "anbieter")))
      .filter((d) => verboten.test(readFileSync(d, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n")));
    expect(treffer.map(rel)).toEqual([]);
  });

  it("die Dokument-KI bindet nichts aus dem Chat ein", () => {
    const chatModule = [/^src\/lib\/whatsapp\//, /^src\/lib\/kampagnen\//, /^src\/lib\/policen\/ki\.ts$/];
    for (const d of dateien(AUSLESEN)) {
      const i = importe(d);
      const treffer = [...i.statisch, ...i.dynamisch].map(rel).filter((x) => chatModule.some((re) => re.test(x)));
      expect(treffer, rel(d)).toEqual([]);
    }
  });
});
