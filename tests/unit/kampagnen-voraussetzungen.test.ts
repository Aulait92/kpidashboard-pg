import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { checkPrerequisites } from "@/lib/kampagnen/context";
import { eindeutigerFormName } from "@/lib/kampagnen/builder";
import type { CampaignContext } from "@/lib/kampagnen/types";

// Vorab-Prüfungen vor dem Lauf (Ole, 24.11.2026: „Muss standardmäßig durchdacht sein“): Fehler, die sonst erst nach
// 15 Minuten beim Anlegen bei Meta auffallen, werden vor dem Start gemeldet.
const ctx = (x: Partial<CampaignContext> = {}) =>
  ({ product: "Privatschutz", dailyBudgetEur: 30, privacyUrl: "https://x.de/datenschutz", adAccountId: "1", pageId: "99", consentFehlt: [], ...x }) as CampaignContext;
const deps = (x: Partial<Parameters<typeof checkPrerequisites>[1]> = {}) => ({
  checkAdAccount: async () => ({ ok: true as const, name: "A" }),
  pageToken: async () => "t",
  leadgenTos: async () => true,
  env: () => ({ anthropic: true, r2: true, meta: true }),
  ...x,
});

describe("Kampagne: Vorab-Prüfungen", () => {
  it("alles da: keine Probleme", async () => {
    expect(await checkPrerequisites(ctx(), deps())).toEqual([]);
  });
  it("fehlende Anschrift für die Einwilligung wird vor dem Start gemeldet", async () => {
    const p = await checkPrerequisites(ctx({ consentFehlt: ["Anschrift"] }), deps());
    expect(p.map((x) => x.key)).toEqual(["consent"]);
    expect(p[0].message).toContain("Anschrift");
  });
  it("Lead-Ads-Bedingungen nicht akzeptiert: Hinweis mit Link", async () => {
    const p = await checkPrerequisites(ctx(), deps({ leadgenTos: async () => false }));
    expect(p.map((x) => x.key)).toEqual(["leadgenTos"]);
    expect(p[0].message).toContain("leadgen/tos?page_id=99");
  });
  it("Bedingungen unbekannt (Abfrage scheitert): nicht blockieren", async () => {
    expect(await checkPrerequisites(ctx(), deps({ leadgenTos: async () => { throw new Error("x"); } }))).toEqual([]);
  });
});

describe("Formularname eindeutig", () => {
  it("hängt Datum und Uhrzeit (Berlin) an", () => {
    expect(eindeutigerFormName("PG | Privatschutz | Formular", new Date("2026-11-24T08:15:00Z"))).toBe("PG | Privatschutz | Formular | 24.11.26 09:15");
  });
});
