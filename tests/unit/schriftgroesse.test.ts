// Schrift mindestens 13 px im Kundenbereich (Usability-Check 25.11.2026, Design 2): Status-Chips, Kontakt-Aktionen,
// untere Navigation und Zähler waren 10 bis 12 px. `text-xs` ist im Projekt 13 px (globals.css --text-xs).
// Ausgenommen: Admin-Bereich und Bausteine, die nur der Admin nutzt (dort gilt die Regel nur für Fließtext).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const NUR_ADMIN = new Set(
  [
    "performance-table", "monthly-goals", "monthly-forecast", "trend-charts", "kpi-card", "speed-to-lead-card", "filter-bar",
    "pnl-statement", "cpl-trend-chart", "notifications-button", "funnel-hero", "buyer-comparison", "buyer-tabs",
  ].map((n) => `src/components/${n}.tsx`),
);

function dateien(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n).replace(/\\/g, "/");
    if (n === "generated" || n === "node_modules" || n === "admin" || n === "admin-neu") return [];
    return statSync(p).isDirectory() ? dateien(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("Schrift im Kundenbereich mindestens 13 px", () => {
  it("keine text-[9px] bis text-[12px] unter /buyer und in den gemeinsamen Bausteinen", () => {
    const funde = [...dateien("src/app/buyer"), ...dateien("src/components")]
      .filter((p) => !NUR_ADMIN.has(p))
      .flatMap((p) =>
        readFileSync(p, "utf8")
          .split("\n")
          .map((z, i) => (/\btext-\[(9|10|11|12)(\.\d+)?px\]/.test(z) ? `${p}:${i + 1}` : null))
          .filter((x): x is string => !!x),
      );
    expect(funde).toEqual([]);
  });
});
