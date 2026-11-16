// Admin-Makeover Runde 2 (Ole, 16.11.2026): fünf Bereiche, alte Adressen brechen nicht.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADMIN_WEITERLEITUNGEN, adminBereich } from "@/lib/admin-bereiche";
import { KUNDEN_TABS } from "@/components/admin/kunden-tabs";
import { LINKS as VERTRIEB_LINKS } from "@/components/vertrieb/nav";

/** Seite zu einer Adresse, auch in Routen-Gruppen wie src/app/admin/kunden/(liste)/page.tsx. */
function pageExists(href: string): boolean {
  const segs = href.split("?")[0].split("/").filter(Boolean);
  const walk = (dir: string, rest: string[]): boolean => {
    if (!existsSync(dir)) return false;
    if (!rest.length && existsSync(`${dir}/page.tsx`)) return true;
    const groups = readdirSync(dir).filter((d) => /^\(.+\)$/.test(d));
    if (groups.some((g) => walk(`${dir}/${g}`, rest))) return true;
    return rest.length ? walk(`${dir}/${rest[0]}`, rest.slice(1)) : false;
  };
  return walk("src/app", segs);
}

describe("Admin-Bereiche", () => {
  it("ordnet jede Adresse dem richtigen Bereich zu (alte Adressen bleiben gültig)", () => {
    const cases: [string, string | null][] = [
      ["/admin/heute", "Heute"],
      ["/admin/heute/aufgaben", "Heute"],
      ["/admin/vertrieb/kontakte", "Vertrieb"],
      ["/admin/vertrieb/kontakte/abc", "Vertrieb"],
      ["/admin/vertrieb/pipeline", "Vertrieb"],
      ["/admin/vertrieb/follow-ups", "Vertrieb"],
      ["/admin/vertrieb/angebote", "Vertrieb"],
      ["/admin/marketing/linkedin", "Vertrieb"],
      ["/admin/marketing/unterlagen/praesentation/vertreter", "Vertrieb"],
      ["/admin/kunden", "Kunden"],
      ["/admin/kunden/xyz/abrechnung", "Kunden"],
      ["/admin/leads", "Kunden"],
      ["/admin/ppl", "Kunden"],
      ["/admin/ppl/bezug/1", "Kunden"],
      ["/admin/media-buyer", "Kunden"],
      ["/admin/monatsberichte", "Kunden"],
      ["/admin/monatsberichte/r1", "Kunden"],
      ["/admin/optimierung", "Kunden"],
      ["/admin/whatsapp", "Chats"],
      ["/admin/whatsapp/settings", "Einstellungen"],
      ["/", "Zahlen"],
      ["/admin/zahlen", "Zahlen"],
      ["/admin/zahlen/buchungen", "Zahlen"],
      ["/admin/nutzung", "Zahlen"],
      ["/admin/einstellungen/kosten", "Zahlen"],
      ["/admin/einstellungen", "Einstellungen"],
      ["/admin/einstellungen/monatsberichte", "Einstellungen"],
      ["/admin/lead-eingang", "Einstellungen"],
      ["/admin/vertrieb/import", "Einstellungen"],
      ["/admin/buyers", "Einstellungen"],
      ["/login", null],
      ["/admin/heutexyz", null],
    ];
    for (const [p, area] of cases) expect(adminBereich(p), p).toBe(area);
  });

  it("alte Adressen leiten auf bestehende Seiten weiter", () => {
    const map = Object.fromEntries(ADMIN_WEITERLEITUNGEN.map((r) => [r.source, r.destination]));
    expect(map).toEqual({
      "/admin/vertrieb": "/admin/heute?bereich=vertrieb",
      "/admin/vertrieb/aufgaben": "/admin/heute/aufgaben",
    });
    for (const r of ADMIN_WEITERLEITUNGEN) {
      expect(pageExists(r.destination), r.destination).toBe(true);
      // Die alte Seite ist entfernt, sonst wäre unklar, was gilt
      expect(pageExists(r.source), r.source).toBe(false);
    }
  });

  it("Weiterleitungen sind in next.config.ts eingebunden", () => {
    const cfg = readFileSync("next.config.ts", "utf8");
    expect(cfg).toContain("ADMIN_WEITERLEITUNGEN");
  });

  it("kein Link im Code zeigt noch auf eine weitergeleitete Adresse", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(`${d}/${e.name}`);
        else if (/\.tsx?$/.test(e.name)) files.push(`${d}/${e.name}`);
      }
    };
    walk("src");
    const hits: string[] = [];
    for (const f of files) {
      if (f.endsWith("lib/admin-bereiche.ts")) continue;
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/revalidatePath|const BASE =|^\s*(\/\/|\*)/.test(line)) return;
          if (/\/admin\/vertrieb\/aufgaben/.test(line) || /["'`]\/admin\/vertrieb["'`?#]/.test(line)) hits.push(`${f}:${i + 1}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it("jeder Reiter in Kunden und Vertrieb hat eine Seite", () => {
    for (const t of [...KUNDEN_TABS, ...VERTRIEB_LINKS]) expect(pageExists(t.href), t.href).toBe(true);
    for (const t of KUNDEN_TABS) expect(adminBereich(t.href), t.href).toBe("Kunden");
    for (const t of VERTRIEB_LINKS) expect(adminBereich(t.href), t.href).toBe("Vertrieb");
  });
});
