// Admin-Umbau 20.11.2026 (Auftrag Ole 19.11.: „der neue Admin ist DER Admin“): Die alte Oberfläche ist entfernt.
// Jede alte Adresse leitet dauerhaft auf ihr Gegenstück (src/middleware.ts, lib/admin-neu/umzug.ts), kein Link im Code
// zeigt mehr auf eine alte Seite, und unter src/app/admin gibt es außerhalb von /admin/neu keine Seiten mehr.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UMZUG, neuerPfad } from "@/lib/admin-neu/umzug";

/** Seite zu einer Adresse ([id]-Segmente als Ordner mit eckigen Klammern, auch Routen-Gruppen). */
function pageExists(href: string): boolean {
  const segs = href.split(/[?#]/)[0].split("/").filter(Boolean);
  const walk = (dir: string, rest: string[]): boolean => {
    if (!existsSync(dir)) return false;
    if (!rest.length && existsSync(`${dir}/page.tsx`)) return true;
    const kinder = readdirSync(dir);
    if (kinder.filter((d) => /^\(.+\)$/.test(d)).some((g) => walk(`${dir}/${g}`, rest))) return true;
    if (!rest.length) return false;
    const [kopf, ...tail] = rest;
    const dyn = kinder.find((d) => /^\[[^\]]+\]$/.test(d));
    return walk(`${dir}/${kopf}`, tail) || (/^\[.+\]$/.test(kopf) && !!dyn && walk(`${dir}/${dyn}`, tail));
  };
  return walk("src/app", segs);
}

const dateien = (d: string, out: string[] = []): string[] => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) dateien(`${d}/${e.name}`, out);
    else out.push(`${d}/${e.name}`);
  }
  return out;
};

describe("Umzug: nur noch ein Admin", () => {
  it("jede alte Adresse hat ein fertiges Gegenstück mit Seite", () => {
    for (const u of UMZUG) {
      expect(u.fertig, u.alt).toBe(true);
      expect(pageExists(u.neu), `${u.alt} → ${u.neu}`).toBe(true);
    }
  });

  it("alte Seiten sind entfernt (Routen-Handler wie Exporte bleiben)", () => {
    const alt = dateien("src/app/admin").filter((f) => !f.startsWith("src/app/admin/neu/") && /\/page\.tsx$/.test(f));
    expect(alt).toEqual([]);
  });

  it("frühere Weiterleitungen und Sonderfälle", () => {
    expect(neuerPfad("/admin")).toBe("/admin/neu");
    expect(neuerPfad("/admin/heute")).toBe("/admin/neu");
    expect(neuerPfad("/admin/vertrieb")).toBe("/admin/neu/vertrieb");
    expect(neuerPfad("/admin/vertrieb/aufgaben?view=done")).toBe("/admin/neu/vertrieb/aufgaben?view=done");
    expect(neuerPfad("/admin/vertrieb/linkedin")).toBe("/admin/neu/marketing");
    expect(neuerPfad("/admin/vertrieb/unterlagen/praesentation/makler")).toBe("/admin/neu/marketing/unterlagen/praesentation/makler");
    expect(neuerPfad("/admin/buyers")).toBe("/admin/neu/kunden");
    expect(neuerPfad("/admin/kunden/k1/logins")).toBe("/admin/neu/kunden/k1/team");
    expect(neuerPfad("/admin/whatsapp/settings?kunde=k1&wa=ok")).toBe("/admin/neu/kunden/k1/whatsapp?wa=ok");
    expect(neuerPfad("/admin/leads/export?x=1")).toBeNull();
  });

  it("kein Link im Code zeigt auf eine alte Admin-Seite", () => {
    const hits: string[] = [];
    for (const f of dateien("src")) {
      if (!/\.tsx?$/.test(f) || f.startsWith("src/generated/")) continue;
      if (/lib\/admin-neu\/(navigation|umzug)\.ts$/.test(f)) continue; // Zuordnungstabelle
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          for (const m of line.matchAll(/["'`](\/admin(?:\/[^"'`\s]*)?)["'`]/g)) {
            // Präfix-Prüfungen („alles unter /admin“) sind keine Links
            if (m[1] === "/admin/" || (m[1] === "/admin" && /startsWith|===|!==/.test(line))) continue;
            const href = m[1].replace(/\$\{[^}]*\}/g, "x");
            if (neuerPfad(href)) hits.push(`${f}:${i + 1} ${m[1]}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });
});
