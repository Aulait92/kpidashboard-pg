// Kundenakte → Abrechnung → Produkte zeigt auch laufende Produkte aus dem Angebot (Ole, 21.11.2026, Lohmann: Privatschutz)
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const hist = vi.hoisted(() => vi.fn());
const budgets = vi.hoisted(() => vi.fn());
vi.mock("@/lib/produkt-buchen", () => ({ productHistory: hist }));
vi.mock("@/lib/budget", () => ({ currentBudgets: budgets }));
vi.mock("@/app/admin/kunden/[id]/abrechnung/produkt-actions", () => ({ adminProduktAnlegenAction: vi.fn(), decideProductAction: vi.fn() }));

import { ProductBookingsCard } from "@/app/admin/kunden/[id]/abrechnung/produkt-card";

const html = async () => renderToStaticMarkup(await ProductBookingsCard({ customerId: "c1", message: null, failed: false }));

describe("Produkte-Karte im Admin", () => {
  it("Produkt aus dem Angebot steht als „Läuft“ in der Karte", async () => {
    hist.mockResolvedValue([]);
    budgets.mockResolvedValue({ lines: [{ product: "Privatschutz", dailyBudget: 35 }], upcoming: [] });
    const h = await html();
    expect(h).toContain("Privatschutz");
    expect(h).toContain("Läuft");
    expect(h).toContain("35 €/Tag");
    expect(h).not.toContain("Noch keine Produkte");
  });

  it("schon gebuchtes Produkt erscheint nicht doppelt; ohne alles der leere Zustand", async () => {
    hist.mockResolvedValue([]);
    budgets.mockResolvedValue({ lines: [{ product: "Werbebudget", dailyBudget: 0 }], upcoming: [] });
    expect(await html()).toContain("Noch keine Produkte");
  });
});
