// Usability-Check 25.11.2026 (Admin-BWA): Zeilentitel nicht abgeschnitten, leere Zellen als „·“ statt „noch keine Daten“.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/admin/zahlen/actions", () => ({ deleteManualRevenueAction: async () => ({}), saveManualRevenueAction: async () => ({}), saveUpdateTextsAction: async () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { BwaTab, BWA_LEER } from "@/components/admin/zahlen-view";
import type { BwaData } from "@/lib/bwa";

const LANG = "Sonstige betriebliche Aufwendungen (Beratung, Versicherungen, Beiträge)";
const d: BwaData = {
  range: "2026",
  ranges: [{ key: "2026", label: "2026" }] as BwaData["ranges"],
  items: [],
  hints: { openExpenses: 0, amexLastImport: null, amexLastBooking: null, bankFrom: null },
  bwa: {
    months: ["2026-10", "2026-11"],
    current: "2026-11",
    incomplete: [],
    rows: [
      { key: "h", label: "Kosten", kind: "header", values: [], total: null },
      { key: "betrieb:x", label: LANG, kind: "line", section: "betrieb" as never, values: [0, 120], total: 120, lines: ["betrieb:x"] },
    ],
  },
};

describe("BWA-Tabelle", () => {
  const html = renderToStaticMarkup(createElement(BwaTab, { d }));
  it("leere Zellen als „·“, kein „noch keine Daten“ je Zelle, Hinweis einmal über der Tabelle", () => {
    expect(BWA_LEER).toBe("·");
    expect(html).not.toMatch(/noch keine Daten<\/td>/);
    expect(html.match(/>·<\/td>/g)?.length).toBe(1);
    expect(html.match(/noch keine Daten/g)?.length).toBe(1);
  });
  it("Zeilentitel umbricht statt abgeschnitten, ganzer Titel als title, erste Spalte bleibt stehen", () => {
    const td = html.match(/<td[^>]*data-bwa-titel[^>]*>/)![0];
    expect(td).toContain("sticky left-0");
    expect(td).toContain("whitespace-normal");
    expect(td).not.toContain("truncate");
    expect(td).toContain(`title="${LANG}"`);
  });
});
