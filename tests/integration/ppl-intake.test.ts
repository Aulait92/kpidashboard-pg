import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { syncPplIntake, type AirtableRecord } from "@/lib/airtable";
import { loadPplReport } from "@/lib/ppl/auswertung";
import { requireTestDb } from "./db";

// Airtable-Leads (auch ohne Käufer) → PplIntake → Auswertung „Eingang/abgelehnt“.
const tag = Math.random().toString(36).slice(2, 8);
const NOW = new Date("2031-05-20T20:00:00Z"); // 12 h nach Eingang → nicht mehr „in Bearbeitung“
const rec = (i: number, fields: Record<string, unknown>, at = "2031-05-20T08:00:00.000Z"): AirtableRecord => ({
  id: `recIT${tag}${String(i).padStart(4, "0")}`,
  createdTime: at,
  fields: { "slug (from Produkt (Eingang))": ["pkv-tarifoptimierung"], "Weitergabe-Zustimmung": "Zugestimmt", Source: "Meta", ...fields },
});

describe("PPL-Eingang aus dem Airtable-Abgleich", () => {
  const records: AirtableRecord[] = [
    rec(1, { Zuweisungsdatum: "2031-05-20T08:05:00.000Z", liefer_status: "ok" }),
    rec(2, { Dublette: true }),
    rec(3, { schwach: true }),
    rec(4, { ist_beamter: 1 }),
    rec(5, {}),
    rec(6, { "Weitergabe-Zustimmung": "Abgelehnt" }),
    rec(7, { "Weitergabe-Zustimmung": "Ausstehend", Zuweisungsdatum: "2031-05-20T08:05:00.000Z" }),
    rec(8, { "slug (from Produkt (Eingang))": undefined }), // ohne Produkt (z. B. Pflege) → zählt nicht
    rec(9, {}, "2025-01-01T00:00:00.000Z"), // vor Juni 2026 → nicht erfasst
  ];
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.pplIntake.deleteMany({ where: { airtableId: { startsWith: `recIT${tag}` } } });
  });

  it("legt alle Leads an, leitet Gründe ab und ist beim zweiten Lauf ohne Änderungen", async () => {
    const first = await syncPplIntake(records, new Map(), () => null, NOW);
    expect(first.created).toBe(8);
    const rows = await prisma.pplIntake.findMany({ where: { airtableId: { startsWith: `recIT${tag}` } }, orderBy: { airtableId: "asc" } });
    expect(rows.map((r) => [r.outcome, r.reason])).toEqual([
      ["geliefert", null],
      ["abgelehnt", "Dublette"],
      ["abgelehnt", "schwach"],
      ["abgelehnt", "Beamter"],
      ["abgelehnt", "kein Abnehmer"],
      ["abgelehnt", "Weitergabe abgelehnt"],
      ["offen", "wartet auf Zustimmung"],
      ["abgelehnt", "kein Abnehmer"],
    ]);
    expect(rows[7].productKey).toBeNull();
    const second = await syncPplIntake(records, new Map(), () => null, NOW);
    expect(second).toEqual({ created: 0, updated: 0 });
    // Änderung in Airtable (z. B. später zugewiesen) wird übernommen
    const changed = records.map((r, i) => (i === 4 ? { ...r, fields: { ...r.fields, Zuweisungsdatum: "2031-05-20T09:00:00.000Z" } } : r));
    expect(await syncPplIntake(changed, new Map(), () => null, NOW)).toEqual({ created: 0, updated: 1 });
  });

  it("Auswertung zeigt Eingang und Ablehnungen nach Grund (ohne Leads ohne Produkt)", async () => {
    const report = await loadPplReport("tag", null, NOW);
    const today = report.rows[report.rows.length - 1];
    // 7 Leads mit Produkt: 2 geliefert (Eingang), 4 abgelehnt, 1 offen
    expect(today.rejected).toMatchObject({ dublette: 1, schwach: 1, beamter: 1, weitergabe: 1 });
    expect(today.rejectedTotal).toBe(4);
    expect(today.pending).toBe(1);
    expect(today.received).toBe(7);
  });
});
