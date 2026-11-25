// Kontrast-Wächter (Usability-Check 25.11.2026): Weiß auf WhatsApp-Grün war 2,0:1.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { erfuelltAA, kontrast } from "@/lib/kontrast";

const css = readFileSync("src/app/globals.css", "utf8");
const token = (name: string) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css);
  if (!m) throw new Error(`Token --${name} fehlt`);
  return m[1];
};

function dateien(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "generated" || n === "node_modules") return [];
    return statSync(p).isDirectory() ? dateien(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("Kontrast nach WCAG", () => {
  it("rechnet wie WCAG 2.1", () => {
    expect(kontrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(kontrast("#ffffff", "#25d366")).toBeCloseTo(1.98, 2);
    expect(erfuelltAA("#ffffff", "#25d366")).toBe(false);
    expect(erfuelltAA("#ffffff", "#25d366", true)).toBe(false);
  });

  it("Weiß auf WhatsApp-Grün und den Grundfarben erfüllt AA", () => {
    for (const t of ["whatsapp", "whatsapp-dark", "brand", "brand-dark"]) expect(erfuelltAA("#ffffff", token(t)), t).toBe(true);
    expect(erfuelltAA(token("muted"), "#ffffff")).toBe(true);
  });

  it("kein helles WhatsApp-Grün (#25D366) mehr als Fläche mit weißer Schrift", () => {
    const funde = dateien("src").filter((p) => /bg-\[#25d366\][^"]*text-white|text-white[^"]*bg-\[#25d366\]/i.test(readFileSync(p, "utf8")));
    expect(funde).toEqual([]);
  });
});
